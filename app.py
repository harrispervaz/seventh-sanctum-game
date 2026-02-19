"""
The Seventh Sanctum - Game Server
Flask backend with complete game logic
"""

from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import json
import random
import uuid
from datetime import datetime

app = Flask(__name__)
CORS(app)

# Load card database
with open('card_database.json', 'r') as f:
    CARD_DATABASE = json.load(f)

CARDS_BY_ID = {card['id']: card for card in CARD_DATABASE['cards']}

# Game state storage (in-memory for prototype)
games = {}

class GameState:
    def __init__(self, player1_deck, player2_deck):
        self.game_id = str(uuid.uuid4())
        self.turn = 1
        self.active_player = 0  # 0 or 1
        self.half_turn = 1  # Increments every time any player starts a turn
        self.phase = 'start'  # start, deploy, combat, end
        
        # Player states
        self.players = [
            {
                'deck': player1_deck.copy(),
                'hand': [],
                'battlefield': [None, None, None, None, None],  # 5 unit slots
                'battlefield_exhausted': [False, False, False, False, False],  # Exhaustion state
                'battlefield_wither': [0, 0, 0, 0, 0],  # Wither stacks (DEF reduction)
                'battlefield_wither_applied_turn': [0, 0, 0, 0, 0],  # Turn when Wither was applied
                'battlefield_corrupt': [False, False, False, False, False],  # Corrupt status
                'battlefield_corrupt_applied_turn': [0, 0, 0, 0, 0],  # Turn when Corrupt was applied
                'battlefield_atk_buff': [0, 0, 0, 0, 0],  # Temporary ATK buffs
                'battlefield_def_buff': [0, 0, 0, 0, 0],  # Temporary DEF buffs
                'battlefield_spd_buff': [0, 0, 0, 0, 0],  # Temporary SPD buffs
                'battlefield_buff_expires': [None, None, None, None, None],  # When buffs expire ('end_turn', 'start_next_turn', None)
                'battlefield_no_retaliate': [False, False, False, False, False],  # Veil of Binding effect
                'battlefield_no_attack': [False, False, False, False, False],  # Petrify effect
                'battlefield_enter_exhausted_next_turn': [False, False, False, False, False],  # Velocity Patch effect
                'battlefield_deployed_turn': [0, 0, 0, 0, 0],  # Track when unit was deployed (for Swift)
                'field': None,
                'traps': [None, None, None],  # 3 trap slots (face-down)
                'discard': [],
                'energy': 5,  # Starting energy (players start with 5, gain 2 on Turn 1)
                'control_loss': 0,
                'must_discard': 0,  # Number of cards to discard (hand limit)
                'pending_energy': 0,  # Energy to gain next turn (Kill Zone, Rustfields)
                'rotfall_must_destroy': 0,  # Units to destroy (Rotfall Expanse)
                'relay_node_gained': False,  # Track Relay Node gain this turn (max 1)
            },
            {
                'deck': player2_deck.copy(),
                'hand': [],
                'battlefield': [None, None, None, None, None],
                'battlefield_exhausted': [False, False, False, False, False],
                'battlefield_wither': [0, 0, 0, 0, 0],
                'battlefield_wither_applied_turn': [0, 0, 0, 0, 0],
                'battlefield_corrupt': [False, False, False, False, False],
                'battlefield_corrupt_applied_turn': [0, 0, 0, 0, 0],
                'battlefield_atk_buff': [0, 0, 0, 0, 0],
                'battlefield_def_buff': [0, 0, 0, 0, 0],
                'battlefield_spd_buff': [0, 0, 0, 0, 0],
                'battlefield_buff_expires': [None, None, None, None, None],
                'battlefield_no_retaliate': [False, False, False, False, False],
                'battlefield_no_attack': [False, False, False, False, False],
                'battlefield_enter_exhausted_next_turn': [False, False, False, False, False],
                'battlefield_deployed_turn': [0, 0, 0, 0, 0],
                'field': None,
                'traps': [None, None, None],
                'discard': [],
                'energy': 5,
                'control_loss': 0,
                'must_discard': 0,  # Number of cards to discard (hand limit)
                'pending_energy': 0,  # Energy to gain next turn (Kill Zone, Rustfields)
                'rotfall_must_destroy': 0,  # Units to destroy (Rotfall Expanse)
                'relay_node_gained': False,  # Track Relay Node gain this turn (max 1)
            }
        ]
        
        # Shuffle decks and draw starting hands
        for player in self.players:
            random.shuffle(player['deck'])
            self.draw_cards(player, 5)
        
        self.winner = None
        self.game_log = []
        
    def draw_cards(self, player, count=1):
        """Draw cards from deck to hand"""
        for _ in range(count):
            if player['deck']:
                card_id = player['deck'].pop(0)
                player['hand'].append(card_id)
            else:
                # Deck exhaustion - player loses
                player_idx = self.players.index(player)
                self.winner = 1 - player_idx
                self.log(f"Player {player_idx + 1} ran out of cards and loses!")
    
    def log(self, message):
        """Add message to game log"""
        self.game_log.append({
            'turn': self.turn,
            'phase': self.phase,
            'message': message
        })
    
    def get_state(self, player_perspective=0):
        """Get game state from a player's perspective"""
        opponent = 1 - player_perspective
        
        return {
            'game_id': self.game_id,
            'turn': self.turn,
            'phase': self.phase,
            'active_player': self.active_player,
            'winner': self.winner,
            'you': {
                'energy': self.players[player_perspective]['energy'],
                'control_loss': self.players[player_perspective]['control_loss'],
                'must_discard': self.players[player_perspective].get('must_discard', 0),
                'rotfall_must_destroy': self.players[player_perspective].get('rotfall_must_destroy', 0),
                'hand': [self.get_card_data(cid) for cid in self.players[player_perspective]['hand']],
                'battlefield': [
                    self.get_card_data(
                        cid, 
                        self.players[player_perspective]['battlefield_exhausted'][i],
                        self.players[player_perspective]['battlefield_wither'][i],
                        self.players[player_perspective]['battlefield_corrupt'][i],
                        self.players[player_perspective]['battlefield_atk_buff'][i],
                        self.players[player_perspective]['battlefield_def_buff'][i],
                        self.players[player_perspective]['battlefield_spd_buff'][i]
                    ) if cid else None 
                    for i, cid in enumerate(self.players[player_perspective]['battlefield'])
                ],
                'field': self.get_card_data(self.players[player_perspective]['field']) if self.players[player_perspective]['field'] else None,
                'traps': [self.get_card_data(cid) if cid else None for cid in self.players[player_perspective]['traps']],
                'deck_count': len(self.players[player_perspective]['deck']),
                'discard_count': len(self.players[player_perspective]['discard'])
            },
            'opponent': {
                'energy': self.players[opponent]['energy'],
                'control_loss': self.players[opponent]['control_loss'],
                'hand_count': len(self.players[opponent]['hand']),
                'battlefield': [
                    self.get_card_data(
                        cid, 
                        self.players[opponent]['battlefield_exhausted'][i],
                        self.players[opponent]['battlefield_wither'][i],
                        self.players[opponent]['battlefield_corrupt'][i],
                        self.players[opponent]['battlefield_atk_buff'][i],
                        self.players[opponent]['battlefield_def_buff'][i],
                        self.players[opponent]['battlefield_spd_buff'][i]
                    ) if cid else None 
                    for i, cid in enumerate(self.players[opponent]['battlefield'])
                ],
                'field': self.get_card_data(self.players[opponent]['field']) if self.players[opponent]['field'] else None,
                'trap_count': sum(1 for t in self.players[opponent]['traps'] if t is not None),
                'deck_count': len(self.players[opponent]['deck']),
                'discard_count': len(self.players[opponent]['discard'])
            },
            'log': self.game_log[-10:]  # Last 10 messages
        }
    
    def get_card_data(self, card_id, is_exhausted=False, wither_stacks=0, is_corrupt=False, atk_buff=0, def_buff=0, spd_buff=0):
        """Get card data with runtime state"""
        if not card_id:
            return None
        
        card = CARDS_BY_ID.get(card_id, {}).copy()
        # Add exhaustion state
        card['is_exhausted'] = is_exhausted
        # Add Wither stacks
        card['wither_stacks'] = wither_stacks
        # Add Corrupt status
        card['is_corrupt'] = is_corrupt
        # Add buffs
        card['atk_buff'] = atk_buff
        card['def_buff'] = def_buff
        card['spd_buff'] = spd_buff
        # Calculate actual stats with buffs and debuffs
        if card.get('atk') is not None:
            card['atk_actual'] = card['atk'] + atk_buff
        if card.get('def') is not None:
            card['def_actual'] = max(1, card['def'] + def_buff - wither_stacks)
        if card.get('spd') is not None:
            card['spd_actual'] = card['spd'] + spd_buff
        return card
    
    # ============================================================
    # PHASE 3B: TRAP TRIGGER DETECTION
    # ============================================================
    
    def check_traps(self, defender_player, trigger_type, trigger_data=None):
        """
        Check if defender has any traps that can activate for this trigger
        
        Args:
            defender_player: The player who may have traps (0 or 1)
            trigger_type: Type of trigger (e.g., 'attack_declared', 'unit_deployed', etc.)
            trigger_data: Additional data about the trigger (attacking unit, deployed unit, etc.)
        
        Returns:
            List of activatable traps with their slot indices:
            [{'slot': 0, 'trap': {...}, 'trigger_message': '...'}]
        """
        defender = self.players[defender_player]
        activatable_traps = []
        
        print(f"🎭 DEBUG: Checking traps for player {defender_player}")
        print(f"🎭 DEBUG: Trigger type: {trigger_type}")
        print(f"🎭 DEBUG: Defender traps: {defender['traps']}")
        print(f"🎭 DEBUG: Defender energy: {defender['energy']}")
        
        for slot_idx, trap_id in enumerate(defender['traps']):
            if not trap_id:
                continue  # Empty slot
            
            print(f"🎭 DEBUG: Checking trap in slot {slot_idx}: {trap_id}")
            
            trap = CARDS_BY_ID[trap_id]
            
            # Check if player can afford the trap
            if defender['energy'] < trap['cost']:
                print(f"🎭 DEBUG: Cannot afford trap {trap['name']} (cost: {trap['cost']}, energy: {defender['energy']})")
                continue  # Skip if can't afford
            
            # Check if trap matches trigger type
            trap_triggers = {
                # Attack-related traps
                'skyforge_counter_measure': 'attack_declared',
                'skyforge_self_destruct': 'unit_destroyed_by_attack',
                'skyforge_decoy_protocol': 'attack_declared',
                'generic_false_step': 'attack_declared',
                'generic_return_to_sender': 'attack_declared',
                'miasma_rot_beneath_the_surface': 'attack_declared',
                
                # Deployment traps
                'skyforge_lockdown': 'unit_deployed',
                'miasma_miasma_potion': 'unit_deployed',
                
                # Other triggers
                'generic_flute_of_slumber': 'unit_readied',
                'miasma_foglash': 'technique_played',
                'generic_earthquake': 'field_activated',
                'generic_counter_sigil': 'trap_activated',
            }
            
            if trap_id in trap_triggers and trap_triggers[trap_id] == trigger_type:
                print(f"🎭 DEBUG: Trap {trap['name']} MATCHES trigger {trigger_type}!")
                # Generate trigger message
                message = self.get_trigger_message(trigger_type, trigger_data)
                activatable_traps.append({
                    'slot': slot_idx,
                    'trap': trap,
                    'trigger_message': message
                })
            else:
                print(f"🎭 DEBUG: Trap {trap['name']} does NOT match trigger {trigger_type}")
                if trap_id in trap_triggers:
                    print(f"🎭 DEBUG: Trap triggers on: {trap_triggers[trap_id]}")
        
        print(f"🎭 DEBUG: Found {len(activatable_traps)} activatable traps")
        return activatable_traps
    
    def get_trigger_message(self, trigger_type, trigger_data):
        """Generate a human-readable trigger message"""
        if not trigger_data:
            trigger_data = {}
            
        if trigger_type == 'attack_declared':
            attacker_name = trigger_data.get('attacker_name', 'Enemy Unit')
            return f"{attacker_name} is attacking!"
        elif trigger_type == 'unit_deployed':
            unit_name = trigger_data.get('unit_name', 'Enemy Unit')
            return f"{unit_name} has been deployed!"
        elif trigger_type == 'unit_destroyed_by_attack':
            destroyed_name = trigger_data.get('destroyed_name', 'Your Unit')
            attacker_name = trigger_data.get('attacker_name', 'Enemy Unit')
            return f"{destroyed_name} was destroyed by {attacker_name}!"
        elif trigger_type == 'unit_readied':
            unit_name = trigger_data.get('unit_name', 'Enemy Unit')
            return f"{unit_name} has become ready!"
        elif trigger_type == 'technique_played':
            technique_name = trigger_data.get('technique_name', 'Enemy Technique')
            return f"{technique_name} is being played!"
        elif trigger_type == 'field_activated':
            field_name = trigger_data.get('field_name', 'Enemy Field')
            return f"{field_name} has been activated!"
        elif trigger_type == 'trap_activated':
            trap_name = trigger_data.get('trap_name', 'Enemy Trap')
            return f"{trap_name} has been activated!"
        return "A trigger event occurred!"
    
    def attack(self, attacker_player, attacker_index, defender_index):
        """
        Declare an attack from one Unit to another
        Implements full combat rules from The Seventh Sanctum
        """
        attacker_player_obj = self.players[attacker_player]
        defender_player = 1 - attacker_player
        defender_player_obj = self.players[defender_player]
        
        # Get attacking Unit
        attacker_card_id = attacker_player_obj['battlefield'][attacker_index]
        if not attacker_card_id:
            return {'error': 'No Unit in that slot'}
        
        # Check if Unit is exhausted
        if attacker_player_obj['battlefield_exhausted'][attacker_index]:
            return {'error': 'Unit is exhausted and cannot attack'}
        
        # Check if Unit is petrified (Petrify effect)
        if attacker_player_obj['battlefield_no_attack'][attacker_index]:
            return {'error': 'Unit is petrified and cannot attack this turn'}
        
        attacker = CARDS_BY_ID[attacker_card_id]
        
        # Check if Unit can attack (must be UNIT type)
        if attacker['type'] != 'UNIT':
            return {'error': 'Only Units can attack'}
        
        # Turn 1 restriction: No player may attack on Turn 1
        # Swift DOES NOT bypass this - everyone waits until Turn 2
        if self.turn == 1:
            return {'error': 'No attacks allowed on Turn 1. Combat begins on Turn 2.'}

        
        # TODO: Check if Unit is exhausted (not implemented yet)
        # For now, allow all attacks
        
        # Get defending Unit
        defender_card_id = defender_player_obj['battlefield'][defender_index]
        if not defender_card_id:
            return {'error': 'No Unit in that slot'}
        
        defender = CARDS_BY_ID[defender_card_id]
        
        # Check SPD restrictions
        # NEW RULE: Can only attack equal or lower SPD
        attacker_spd = attacker.get('spd', 0)
        defender_spd = defender.get('spd', 0)
        
        # Apply buffs to SPD
        attacker_spd_actual = attacker_spd + attacker_player_obj['battlefield_spd_buff'][attacker_index]
        defender_spd_actual = defender_spd + defender_player_obj['battlefield_spd_buff'][defender_index]
        
        # Swift bypasses SPD restrictions ONLY on the turn the unit was deployed
        has_swift = 'Swift' in attacker.get('keywords', [])
        deployed_this_turn = attacker_player_obj['battlefield_deployed_turn'][attacker_index] == self.turn
        swift_active = has_swift and deployed_this_turn
        
        if not swift_active and attacker_spd_actual < defender_spd_actual:
            return {'error': f'SPD too low! {attacker["name"]} (SPD {attacker_spd_actual}) cannot attack {defender["name"]} (SPD {defender_spd_actual})'}
        
        # Check Guard keyword
        # If defender has Guard Units, must attack one of them
        guard_units = []
        for i, unit_id in enumerate(defender_player_obj['battlefield']):
            if unit_id:
                unit = CARDS_BY_ID[unit_id]
                if 'Guard' in unit.get('keywords', []):
                    guard_units.append(i)
        
        if guard_units and defender_index not in guard_units:
            guard_names = [CARDS_BY_ID[defender_player_obj['battlefield'][i]]['name'] for i in guard_units]
            return {'error': f'Must attack Guard Unit first: {", ".join(guard_names)}'}
        
        # NEW RULE: Free target choice (no highest DEF requirement)
        # Only Guard restriction applies
        
        # ============================================================
        # PHASE 3B: CHECK FOR TRAP TRIGGERS (Attack Declared)
        # ============================================================
        
        # Check if defender has traps that trigger on "attack declared"
        activatable_traps = self.check_traps(
            defender_player,
            'attack_declared',
            {'attacker_name': attacker['name']}
        )
        
        # If there are activatable traps, pause and return trap prompt data
        if activatable_traps:
            # Return first trap that can activate (sequential prompting handled by frontend)
            first_trap = activatable_traps[0]
            return {
                'trap_trigger': True,
                'trap': first_trap['trap'],
                'trap_slot': first_trap['slot'],
                'trigger_message': first_trap['trigger_message'],
                'pending_attack': {
                    'attacker_player': attacker_player,
                    'attacker_index': attacker_index,
                    'defender_index': defender_index
                }
            }
        
        # No traps to activate - proceed with combat
        # ============================================================
        
        # RESOLVE COMBAT
        attacker_atk = attacker.get('atk', 0)
        defender_def = defender.get('def', 0)
        defender_atk = defender.get('atk', 0)
        attacker_def = attacker.get('def', 0)
        
        # Apply Wither to defender's DEF (minimum 1)
        defender_wither = defender_player_obj['battlefield_wither'][defender_index]
        defender_def_actual = max(1, defender_def - defender_wither)
        if defender_wither > 0:
            combat_log.append(f"{defender['name']} has {defender_wither} Wither (DEF: {defender_def} → {defender_def_actual})")
        
        # Apply Wither to attacker's DEF (for retaliation, minimum 1)
        attacker_wither = attacker_player_obj['battlefield_wither'][attacker_index]
        attacker_def_actual = max(1, attacker_def - attacker_wither)
        
        combat_log = []
        combat_log.append(f"{attacker['name']} attacks {defender['name']}!")
        
        if defender_wither > 0:
            combat_log.append(f"{defender['name']} has {defender_wither} Wither (DEF: {defender_def} → {defender_def_actual})")
        
        # Check if defender is destroyed
        defender_destroyed = False
        if attacker_atk > defender_def_actual:
            defender_destroyed = True
            combat_log.append(f"{defender['name']} is destroyed! ({attacker_atk} ATK > {defender_def_actual} DEF)")
            defender_player_obj['battlefield'][defender_index] = None
            defender_player_obj['battlefield_wither'][defender_index] = 0
            defender_player_obj['battlefield_corrupt'][defender_index] = False
            defender_player_obj['discard'].append(defender_card_id)
            
            # Kill Zone: attacker's player has Kill Zone field - gain 1⚡ when ANY unit destroys an enemy
            if attacker_player_obj.get('field') == 'skyforge_kill_zone':
                attacker_player_obj['pending_energy'] = min(
                    attacker_player_obj.get('pending_energy', 0) + 1, 1
                )
                combat_log.append(f"⚡ Kill Zone: Gain 1⚡ at start of next turn!")
        else:
            combat_log.append(f"{defender['name']} survives! ({attacker_atk} ATK ≤ {defender_def_actual} DEF)")
            
            # Apply Wither if attacker has Wither keyword
            # Wither is a KEYWORD, not an ability - it works even when Corrupted!
            if 'Wither' in attacker.get('keywords', []) and not defender_destroyed:
                defender_player_obj['battlefield_wither'][defender_index] += 1
                defender_player_obj['battlefield_wither_applied_turn'][defender_index] = self.half_turn
                new_wither = defender_player_obj['battlefield_wither'][defender_index]
                combat_log.append(f"🥀 Wither applied! {defender['name']} now has {new_wither} Wither (until end of next turn)")
            
            # Apply Corrupt if attacker has Corrupt keyword
            # Corrupt is a KEYWORD, not an ability - it works even when Corrupted!
            if 'Corrupt' in attacker.get('keywords', []) and not defender_destroyed:
                if not defender_player_obj['battlefield_corrupt'][defender_index]:
                    defender_player_obj['battlefield_corrupt'][defender_index] = True
                    defender_player_obj['battlefield_corrupt_applied_turn'][defender_index] = self.half_turn
                    combat_log.append(f"🦠 Corrupt applied! {defender['name']}'s abilities are disabled (until end of next turn)")

        
        # Retaliation (only if defender survives and is ready)
        attacker_destroyed = False
        if not defender_destroyed:
            # Check if defender is exhausted - exhausted units cannot retaliate
            # Check if defender is bound by Veil of Binding - cannot retaliate
            defender_no_retaliate = defender_player_obj['battlefield_no_retaliate'][defender_index]
            
            if defender_no_retaliate:
                combat_log.append(f"{defender['name']} is bound and cannot retaliate (Veil of Binding)")
            elif not defender_player_obj['battlefield_exhausted'][defender_index]:
                # Use Wither-adjusted DEF for attacker
                if defender_atk > attacker_def_actual:
                    attacker_destroyed = True
                    if attacker_wither > 0:
                        combat_log.append(f"{attacker['name']} has {attacker_wither} Wither (DEF: {attacker_def} → {attacker_def_actual})")
                    combat_log.append(f"{defender['name']} retaliates and destroys {attacker['name']}! ({defender_atk} ATK > {attacker_def_actual} DEF)")
                    attacker_player_obj['battlefield'][attacker_index] = None
                    attacker_player_obj['battlefield_exhausted'][attacker_index] = False
                    attacker_player_obj['battlefield_wither'][attacker_index] = 0
                    attacker_player_obj['battlefield_corrupt'][attacker_index] = False
                    attacker_player_obj['discard'].append(attacker_card_id)
                    
                    # Rustfields: attacker's player has Rustfields + attacker is Skyforge
                    if attacker_player_obj.get('field') == 'skyforge_rustfields':
                        if attacker.get('faction') == 'Skyforge':
                            attacker_player_obj['pending_energy'] = min(
                                attacker_player_obj.get('pending_energy', 0) + 1, 1
                            )
                            combat_log.append(f"⚡ Rustfields: {attacker['name']} destroyed - gain 1⚡ next turn!")
                else:
                    combat_log.append(f"{attacker['name']} survives retaliation! ({defender_atk} ATK ≤ {attacker_def_actual} DEF)")
            else:
                combat_log.append(f"{defender['name']} is exhausted and cannot retaliate")
        
        # Exhaust the attacking Unit (unless it was destroyed)
        if not attacker_destroyed:
            attacker_player_obj['battlefield_exhausted'][attacker_index] = True
            combat_log.append(f"{attacker['name']} becomes exhausted")
        
        # Pierce keyword (excess damage to another Unit)
        pierce_available = False
        pierce_damage = 0
        if 'Pierce' in attacker.get('keywords', []) and defender_destroyed and not attacker_destroyed:
            excess_damage = attacker_atk - defender_def_actual
            if excess_damage > 0:
                pierce_available = True
                pierce_damage = excess_damage
                combat_log.append(f"🎯 Pierce! {excess_damage} excess damage available")
        
        # Log combat
        for msg in combat_log:
            self.log(msg)
        
        return {
            'success': True,
            'combat_log': combat_log,
            'attacker_destroyed': attacker_destroyed,
            'defender_destroyed': defender_destroyed,
            'pierce_available': pierce_available,
            'pierce_damage': pierce_damage,
            'attacker_player': attacker_player,
            'attacker_index': attacker_index
        }
    
    def apply_pierce_damage(self, attacker_player, attacker_index, pierce_target_index):
        """Apply Pierce overflow damage to another enemy Unit"""
        attacker_player_obj = self.players[attacker_player]
        defender_player = 1 - attacker_player
        defender_player_obj = self.players[defender_player]
        
        # Get attacker (for Pierce damage amount)
        attacker_card_id = attacker_player_obj['battlefield'][attacker_index]
        if not attacker_card_id:
            return {'error': 'Attacker no longer exists'}
        
        attacker = CARDS_BY_ID[attacker_card_id]
        
        # Get Pierce target
        target_card_id = defender_player_obj['battlefield'][pierce_target_index]
        if not target_card_id:
            return {'error': 'No Unit in that slot'}
        
        target = CARDS_BY_ID[target_card_id]
        
        # Pierce damage was calculated in attack, but we need to recalculate
        # For now, we'll need to store it. Let me use a simple approach:
        # Pierce damage will be passed from the attack result
        # This function receives the target and pierce_damage amount
        
        return {'error': 'Pierce damage amount not provided'}
    
    def apply_pierce(self, pierce_target_index, pierce_damage, defender_player):
        """Apply Pierce damage to a target Unit"""
        defender_player_obj = self.players[defender_player]
        
        # Get target
        target_card_id = defender_player_obj['battlefield'][pierce_target_index]
        if not target_card_id:
            return {'error': 'No Unit in that slot'}
        
        target = CARDS_BY_ID[target_card_id]
        
        # Get target's DEF (with Wither)
        target_wither = defender_player_obj['battlefield_wither'][pierce_target_index]
        target_def = target.get('def', 0)
        target_def_actual = max(1, target_def - target_wither)
        
        pierce_log = []
        pierce_log.append(f"🎯 Pierce damage directed to {target['name']}!")
        
        # Check if Pierce damage destroys the target
        if pierce_damage >= target_def_actual:
            pierce_log.append(f"{target['name']} is destroyed by Pierce! ({pierce_damage} damage ≥ {target_def_actual} DEF)")
            defender_player_obj['battlefield'][pierce_target_index] = None
            defender_player_obj['battlefield_exhausted'][pierce_target_index] = False
            defender_player_obj['battlefield_wither'][pierce_target_index] = 0
            defender_player_obj['battlefield_wither_applied_turn'][pierce_target_index] = 0
            defender_player_obj['battlefield_corrupt'][pierce_target_index] = False
            defender_player_obj['battlefield_corrupt_applied_turn'][pierce_target_index] = 0
            defender_player_obj['discard'].append(target_card_id)
        else:
            pierce_log.append(f"{target['name']} survives Pierce! ({pierce_damage} damage < {target_def_actual} DEF)")
        
        # Log Pierce resolution
        for msg in pierce_log:
            self.log(msg)
        
        return {
            'success': True,
            'pierce_log': pierce_log
        }
    
    def play_card(self, player_idx, card_id, target=None):
        """Play a card from hand"""
        player = self.players[player_idx]
        
        if card_id not in player['hand']:
            return {'error': 'Card not in hand'}
        
        card = CARDS_BY_ID[card_id]
        
        # Check energy cost (EXCEPT for Traps - they're free to set)
        if card['type'] != 'TRAP':
            # Assembly Line: Skyforge Units cost 1 less (min 1)
            actual_cost = card['cost']
            if card['type'] == 'UNIT' and card.get('faction') == 'Skyforge':
                if player.get('field') and player['field'] == 'skyforge_assembly_line':
                    actual_cost = max(1, actual_cost - 1)
                    self.log(f"⚙️ Assembly Line: {card['name']} costs 1 less ({actual_cost}⚡)")
            
            if player['energy'] < actual_cost:
                return {'error': 'Not enough energy'}
            player['energy'] -= actual_cost
        
        player['hand'].remove(card_id)
        
        # Handle card type
        if card['type'] == 'UNIT':
            # Find empty battlefield slot
            for i in range(5):
                if player['battlefield'][i] is None:
                    player['battlefield'][i] = card_id
                    
                    # Record when this unit was deployed (for Swift SPD bypass)
                    player['battlefield_deployed_turn'][i] = self.turn
                    
                    # Units enter play exhausted (unless they have Swift)
                    has_swift = 'Swift' in card.get('keywords', [])
                    if not has_swift:
                        player['battlefield_exhausted'][i] = True
                        self.log(f"Player {player_idx + 1} deploys {card['name']} (exhausted)")
                    else:
                        player['battlefield_exhausted'][i] = False
                        self.log(f"Player {player_idx + 1} deploys {card['name']} (Swift - ready!)")
                    
                    # Blight Pools: opponent's field - apply Wither to this unit when it enters play
                    opponent_idx = 1 - player_idx
                    opponent = self.players[opponent_idx]
                    if opponent.get('field') == 'miasma_blight_pools':
                        player['battlefield_wither'][i] += 1
                        player['battlefield_wither_applied_turn'][i] = self.half_turn
                        self.log(f"🌫️ Blight Pools: {card['name']} withers as it enters play! (DEF -1)")
                    
                    return {'success': True, 'message': f"Deployed {card['name']}"}
            return {'error': 'Battlefield full'}
        
        elif card['type'] == 'FIELD':
            # Replace existing field
            if player['field']:
                old_field = CARDS_BY_ID[player['field']]
                player['discard'].append(player['field'])
                self.log(f"Player {player_idx + 1} replaces {old_field['name']}")
            player['field'] = card_id
            self.log(f"Player {player_idx + 1} plays field {card['name']}")
            return {'success': True, 'message': f"Played {card['name']}"}
        
        elif card['type'] == 'TRAP':
            # Find empty trap slot
            for i in range(3):
                if player['traps'][i] is None:
                    player['traps'][i] = card_id
                    self.log(f"Player {player_idx + 1} sets a trap")
                    return {'success': True, 'message': 'Trap set'}
            return {'error': 'All trap slots full'}
        
        elif card['type'] == 'TECHNIQUE':
            # Resolve technique effect
            result = self.resolve_technique(player_idx, card_id)
            # Technique goes to discard
            player['discard'].append(card_id)
            return result
        
        return {'error': 'Unknown card type'}
    
    def resolve_technique(self, player_idx, card_id):
        """Resolve a technique's effect"""
        player = self.players[player_idx]
        opponent_idx = 1 - player_idx
        opponent = self.players[opponent_idx]
        card = CARDS_BY_ID[card_id]
        
        self.log(f"Player {player_idx + 1} plays {card['name']}")
        
        # PHASE 1 TECHNIQUES (Simple, no targeting)
        
        # Encroaching Fog - Apply Wither to all enemy Units
        if card['id'] == 'miasma_encroaching_fog':
            count = 0
            for i in range(5):
                if opponent['battlefield'][i] is not None:
                    opponent['battlefield_wither'][i] += 1
                    opponent['battlefield_wither_applied_turn'][i] = self.half_turn
                    count += 1
            self.log(f"🥀 Encroaching Fog! Wither applied to {count} enemy Units")
            return {'success': True, 'message': f'Withered {count} enemy Units'}
        
        # Choking Spores - Exhaust all enemy Units
        elif card['id'] == 'miasma_choking_spores':
            count = 0
            for i in range(5):
                if opponent['battlefield'][i] is not None and not opponent['battlefield_exhausted'][i]:
                    opponent['battlefield_exhausted'][i] = True
                    count += 1
            self.log(f"💤 Choking Spores! {count} enemy Units exhausted")
            return {'success': True, 'message': f'Exhausted {count} enemy Units'}
        
        # Salvage the Ruins - Draw 1-2 cards
        elif card['id'] == 'generic_salvage_the_ruins':
            cards_drawn = 1
            self.draw_cards(player, 1)
            
            # Draw additional card if no Field
            if not player['field']:
                self.draw_cards(player, 1)
                cards_drawn = 2
                self.log(f"📚 Salvage the Ruins! Drew {cards_drawn} cards (no Field bonus)")
            else:
                self.log(f"📚 Salvage the Ruins! Drew {cards_drawn} card")
            
            return {'success': True, 'message': f'Drew {cards_drawn} card(s)'}
        
        # Arcane Surge - Gain 3⚡, skip next energy gain
        elif card['id'] == 'generic_arcane_surge':
            player['energy'] += 3
            # Mark to skip next energy gain (we'll need to track this)
            if 'skip_next_energy_gain' not in player:
                player['skip_next_energy_gain'] = False
            player['skip_next_energy_gain'] = True
            self.log(f"⚡ Arcane Surge! Gained 3⚡ (will skip next energy gain)")
            return {'success': True, 'message': 'Gained 3⚡'}
        
        # PHASE 2 TECHNIQUES (Targeted buffs)
        
        # Food Rations - Choose a Unit, gain +1 DEF until start of your next turn
        elif card['id'] == 'generic_food_rations':
            # This needs targeting - return special response for UI to handle
            return {
                'success': True,
                'needs_target': True,
                'target_type': 'any_unit',
                'message': 'Select a Unit to give +1 DEF'
            }
        
        # Software Update - Target Unit gains +1 ATK and -1 DEF until end of turn
        elif card['id'] == 'skyforge_software_update':
            return {
                'success': True,
                'needs_target': True,
                'target_type': 'any_unit',
                'message': 'Select a Unit to buff (+1 ATK, -1 DEF)'
            }
        
        # Emergency Repairs - Target your Unit, gain +2 DEF until start of next turn
        elif card['id'] == 'generic_emergency_repairs':
            return {
                'success': True,
                'needs_target': True,
                'target_type': 'friendly_unit',
                'message': 'Select one of your Units to give +2 DEF'
            }
        
        # Adrenal Rush - Ready a Unit you control, gain +1 ATK until end of turn
        elif card['id'] == 'generic_adrenal_rush':
            return {
                'success': True,
                'needs_target': True,
                'target_type': 'friendly_unit',
                'message': 'Select one of your Units to Ready and buff'
            }
        
        # Velocity Patch - Target Unit gains +2 SPD until end of turn
        elif card['id'] == 'skyforge_velocity_patch':
            return {
                'success': True,
                'needs_target': True,
                'target_type': 'any_unit',
                'message': 'Select a Unit to give +2 SPD'
            }
        
        # PHASE 3 TECHNIQUES (Advanced effects)
        
        # EASIEST - No targeting, just destroy Field
        
        # Travelling Merchant - Destroy opponent's Field
        elif card['id'] == 'generic_travelling_merchant':
            opponent_idx = 1 - player_idx
            opponent = self.players[opponent_idx]
            
            if opponent['field']:
                field_card = CARDS_BY_ID[opponent['field']]
                opponent['discard'].append(opponent['field'])
                opponent['field'] = None
                self.log(f"🚶 Travelling Merchant! Destroyed {field_card['name']}")
                return {'success': True, 'message': f"Destroyed {field_card['name']}"}
            else:
                self.log(f"🚶 Travelling Merchant! No enemy Field to destroy")
                return {'success': True, 'message': 'No enemy Field to destroy'}
        
        # Eviction Notice - Destroy opponent's Field (same as Travelling Merchant)
        elif card['id'] == 'generic_eviction_notice':
            opponent_idx = 1 - player_idx
            opponent = self.players[opponent_idx]
            
            if opponent['field']:
                field_card = CARDS_BY_ID[opponent['field']]
                opponent['discard'].append(opponent['field'])
                opponent['field'] = None
                self.log(f"📜 Eviction Notice! Destroyed {field_card['name']}")
                return {'success': True, 'message': f"Destroyed {field_card['name']}"}
            else:
                self.log(f"📜 Eviction Notice! No enemy Field to destroy")
                return {'success': True, 'message': 'No enemy Field to destroy'}
        
        # Veil of Binding - Target Unit can't retaliate this turn (enemy only)
        elif card['id'] == 'generic_veil_of_binding':
            return {
                'success': True,
                'needs_target': True,
                'target_type': 'enemy_unit',
                'message': 'Select an enemy Unit to prevent from retaliating'
            }
        
        # MEDIUM DIFFICULTY
        
        # Petrify - Target Unit can't attack during its next turn
        elif card['id'] == 'miasma_petrify':
            return {
                'success': True,
                'needs_target': True,
                'target_type': 'any_unit',
                'message': 'Select a Unit to petrify (cannot attack next turn)'
            }
        
        # Toxic Sludge - If target is Corrupted, apply Wither x2
        elif card['id'] == 'miasma_toxic_sludge':
            return {
                'success': True,
                'needs_target': True,
                'target_type': 'enemy_unit',
                'message': 'Select an enemy Unit (Wither x2 if Corrupted)'
            }
        
        # HARD DIFFICULTY
        
        # Override - Disable target Unit's abilities until end of your turn
        elif card['id'] == 'skyforge_override':
            return {
                'success': True,
                'needs_target': True,
                'target_type': 'any_unit',
                'message': 'Select a Unit to disable its abilities'
            }
        
        # Reboot - Remove all negative effects from target Unit
        elif card['id'] == 'skyforge_reboot':
            return {
                'success': True,
                'needs_target': True,
                'target_type': 'any_unit',
                'message': 'Select a Unit to remove all debuffs'
            }
        
        # Default for unimplemented techniques
        else:
            self.log(f"⚠️ {card['name']} effect not yet implemented")
            return {'success': True, 'message': f"Played {card['name']} (effect not implemented)"}
    
    def apply_targeted_technique(self, player_idx, card_id, target_player, target_index):
        """Apply a technique effect to a targeted Unit"""
        player = self.players[player_idx]
        target_player_obj = self.players[target_player]
        card = CARDS_BY_ID[card_id]
        
        # Check if target slot has a Unit
        target_unit_id = target_player_obj['battlefield'][target_index]
        if not target_unit_id:
            return {'error': 'No Unit in that slot'}
        
        target_unit = CARDS_BY_ID[target_unit_id]
        
        # Apply technique effect based on card
        
        # Food Rations - +1 DEF until start of your next turn
        if card['id'] == 'generic_food_rations':
            target_player_obj['battlefield_def_buff'][target_index] += 1
            target_player_obj['battlefield_buff_expires'][target_index] = 'start_next_turn'
            self.log(f"🍞 Food Rations! {target_unit['name']} gains +1 DEF")
            return {'success': True, 'message': f"{target_unit['name']} buffed!"}
        
        # Software Update - +1 ATK, -1 DEF until end of turn
        elif card['id'] == 'skyforge_software_update':
            target_player_obj['battlefield_atk_buff'][target_index] += 1
            target_player_obj['battlefield_def_buff'][target_index] -= 1
            target_player_obj['battlefield_buff_expires'][target_index] = 'end_turn'
            self.log(f"⚙️ Software Update! {target_unit['name']} gains +1 ATK, -1 DEF")
            return {'success': True, 'message': f"{target_unit['name']} updated!"}
        
        # Emergency Repairs - +2 DEF until start of next turn (friendly only)
        elif card['id'] == 'generic_emergency_repairs':
            if target_player != player_idx:
                return {'error': 'Can only target your own Units'}
            target_player_obj['battlefield_def_buff'][target_index] += 2
            target_player_obj['battlefield_buff_expires'][target_index] = 'start_next_turn'
            self.log(f"🔧 Emergency Repairs! {target_unit['name']} gains +2 DEF")
            return {'success': True, 'message': f"{target_unit['name']} repaired!"}
        
        # Adrenal Rush - Ready unit + +1 ATK until end of turn (friendly only)
        elif card['id'] == 'generic_adrenal_rush':
            if target_player != player_idx:
                return {'error': 'Can only target your own Units'}
            # Ready the unit
            target_player_obj['battlefield_exhausted'][target_index] = False
            # Add ATK buff
            target_player_obj['battlefield_atk_buff'][target_index] += 1
            target_player_obj['battlefield_buff_expires'][target_index] = 'end_turn'
            self.log(f"💪 Adrenal Rush! {target_unit['name']} is readied and gains +1 ATK")
            return {'success': True, 'message': f"{target_unit['name']} energized!"}
        
        # Velocity Patch - +2 SPD until end of turn, enters exhausted next turn
        elif card['id'] == 'skyforge_velocity_patch':
            target_player_obj['battlefield_spd_buff'][target_index] += 2
            target_player_obj['battlefield_buff_expires'][target_index] = 'end_turn'
            target_player_obj['battlefield_enter_exhausted_next_turn'][target_index] = True
            self.log(f"⚡ Velocity Patch! {target_unit['name']} gains +2 SPD (will enter exhausted next turn)")
            return {'success': True, 'message': f"{target_unit['name']} accelerated!"}
        
        # Veil of Binding - Target can't retaliate this turn (enemy only)
        elif card['id'] == 'generic_veil_of_binding':
            if target_player == player_idx:
                return {'error': 'Must target an enemy Unit'}
            target_player_obj['battlefield_no_retaliate'][target_index] = True
            self.log(f"🔮 Veil of Binding! {target_unit['name']} cannot retaliate this turn")
            return {'success': True, 'message': f"{target_unit['name']} bound!"}
        
        # Petrify - Target can't attack during its next turn
        elif card['id'] == 'miasma_petrify':
            target_player_obj['battlefield_no_attack'][target_index] = True
            self.log(f"🪨 Petrify! {target_unit['name']} cannot attack during its next turn")
            return {'success': True, 'message': f"{target_unit['name']} petrified!"}
        
        # Toxic Sludge - If target is Corrupted, apply Wither x2
        elif card['id'] == 'miasma_toxic_sludge':
            if target_player != player_idx:  # Must target enemy
                is_corrupted = target_player_obj['battlefield_corrupt'][target_index]
                if is_corrupted:
                    target_player_obj['battlefield_wither'][target_index] += 2
                    target_player_obj['battlefield_wither_applied_turn'][target_index] = self.half_turn
                    new_wither = target_player_obj['battlefield_wither'][target_index]
                    self.log(f"🧪 Toxic Sludge! {target_unit['name']} is Corrupted - gains 2 Wither (now {new_wither})")
                    return {'success': True, 'message': f"{target_unit['name']} withered x2!"}
                else:
                    self.log(f"🧪 Toxic Sludge! {target_unit['name']} is not Corrupted - no effect")
                    return {'success': True, 'message': f"{target_unit['name']} not Corrupted (no effect)"}
            else:
                return {'error': 'Must target an enemy Unit'}
        
        # Override - Disable abilities until end of your turn (same as Corrupt but temporary)
        elif card['id'] == 'skyforge_override':
            # Apply Corrupt-like effect that expires at end of turn
            was_already_corrupt = target_player_obj['battlefield_corrupt'][target_index]
            target_player_obj['battlefield_corrupt'][target_index] = True
            # Mark that this is temporary (will clear at end of caster's turn, not target's next turn)
            # We'll track this separately
            if 'battlefield_override_expires_turn' not in target_player_obj:
                target_player_obj['battlefield_override_expires_turn'] = [0, 0, 0, 0, 0]
            target_player_obj['battlefield_override_expires_turn'][target_index] = self.turn
            
            self.log(f"⚙️ Override! {target_unit['name']}'s abilities disabled until end of turn")
            return {'success': True, 'message': f"{target_unit['name']} overridden!"}
        
        # Reboot - Remove all negative effects
        elif card['id'] == 'skyforge_reboot':
            effects_cleared = []
            
            # Clear Wither
            if target_player_obj['battlefield_wither'][target_index] > 0:
                effects_cleared.append(f"Wither (-{target_player_obj['battlefield_wither'][target_index]})")
                target_player_obj['battlefield_wither'][target_index] = 0
                target_player_obj['battlefield_wither_applied_turn'][target_index] = 0
            
            # Clear Corrupt
            if target_player_obj['battlefield_corrupt'][target_index]:
                effects_cleared.append("Corrupt")
                target_player_obj['battlefield_corrupt'][target_index] = False
                target_player_obj['battlefield_corrupt_applied_turn'][target_index] = 0
            
            # Clear Petrify
            if target_player_obj['battlefield_no_attack'][target_index]:
                effects_cleared.append("Petrify")
                target_player_obj['battlefield_no_attack'][target_index] = False
            
            # Clear Veil of Binding
            if target_player_obj['battlefield_no_retaliate'][target_index]:
                effects_cleared.append("Veil of Binding")
                target_player_obj['battlefield_no_retaliate'][target_index] = False
            
            # Clear negative buffs (DEF debuffs from Software Update)
            if target_player_obj['battlefield_def_buff'][target_index] < 0:
                effects_cleared.append(f"DEF debuff ({target_player_obj['battlefield_def_buff'][target_index]})")
                target_player_obj['battlefield_def_buff'][target_index] = 0
            
            if effects_cleared:
                effects_str = ", ".join(effects_cleared)
                self.log(f"🔄 Reboot! Cleared from {target_unit['name']}: {effects_str}")
                return {'success': True, 'message': f"Cleared: {effects_str}"}
            else:
                self.log(f"🔄 Reboot! {target_unit['name']} has no negative effects to clear")
                return {'success': True, 'message': 'No effects to clear'}
        
        return {'error': 'Unknown targeted technique'}
    
    def advance_phase(self):
        """Move to next phase"""
        # If it's AI's turn, let AI play
        if self.active_player == 1:
            if self.phase == 'deploy':
                self.ai_turn()  # AI plays cards
                self.phase = 'combat'
            elif self.phase == 'combat':
                self.ai_turn()  # AI attacks
                self.phase = 'end'
            elif self.phase == 'end':
                self.end_turn()
            else:  # start
                self.phase = 'deploy'
        else:
            # Human player - normal phase advancement
            if self.phase == 'start':
                self.phase = 'deploy'
            elif self.phase == 'deploy':
                self.phase = 'combat'
            elif self.phase == 'combat':
                self.phase = 'end'
            elif self.phase == 'end':
                self.end_turn()
    
    def ai_turn(self):
        """
        AI plays its turn
        Makes intelligent decisions about deploying units and attacking
        """
        ai_player = self.active_player
        ai = self.players[ai_player]
        opponent = self.players[1 - ai_player]
        
        self.log(f"AI is thinking...")
        
        # Phase 1: DEPLOY PHASE - Play cards from hand
        if self.phase == 'deploy':
            # Sort hand by priority: Units > Fields > Techniques > Traps
            playable_cards = []
            
            for card_id in ai['hand']:
                card = CARDS_BY_ID[card_id]
                priority = 0
                
                # Prioritize based on card type
                if card['type'] == 'UNIT':
                    priority = 100 - card['cost']  # Prefer cheaper units
                elif card['type'] == 'FIELD':
                    priority = 50
                elif card['type'] == 'TRAP':
                    priority = 30
                elif card['type'] == 'TECHNIQUE':
                    priority = 20
                
                # Check if we can afford it (or if it's a trap - free to set)
                can_play = (card['type'] == 'TRAP') or (ai['energy'] >= card['cost'])
                
                if can_play:
                    playable_cards.append({
                        'id': card_id,
                        'card': card,
                        'priority': priority
                    })
            
            # Sort by priority (highest first)
            playable_cards.sort(key=lambda x: x['priority'], reverse=True)
            
            # Play cards until we run out of energy or board space
            for item in playable_cards:
                card = item['card']
                
                # Check if we have space
                if card['type'] == 'UNIT':
                    units_count = sum(1 for u in ai['battlefield'] if u is not None)
                    if units_count >= 5:
                        continue  # Battlefield full
                
                if card['type'] == 'TRAP':
                    traps_count = sum(1 for t in ai['traps'] if t is not None)
                    if traps_count >= 3:
                        continue  # Trap slots full
                
                if card['type'] == 'FIELD' and ai['field'] is not None:
                    continue  # Already have a field
                
                # Try to play the card
                result = self.play_card(ai_player, item['id'])
                if result.get('success'):
                    self.log(f"AI plays {card['name']}")
                    
                    # Don't play too many cards in one turn
                    if card['type'] == 'UNIT' and ai['energy'] < 2:
                        break  # Save some energy
        
        # Phase 2: COMBAT PHASE - Attack with units
        if self.phase == 'combat':
            # Turn 1 restriction: No attacks allowed
            if self.turn == 1:
                self.log("AI skips combat (Turn 1 restriction)")
                return
            
            # Get all ready AI units
            for ai_index, unit_id in enumerate(ai['battlefield']):
                if not unit_id:
                    continue
                
                # Skip exhausted units
                if ai['battlefield_exhausted'][ai_index]:
                    continue
                
                attacker = CARDS_BY_ID[unit_id]
                
                # Find valid targets (units we can actually attack)
                valid_targets = []
                
                # First, check if opponent has any Guard units
                guard_units = []
                for opp_index, opp_unit_id in enumerate(opponent['battlefield']):
                    if not opp_unit_id:
                        continue
                    defender = CARDS_BY_ID[opp_unit_id]
                    if 'Guard' in defender.get('keywords', []):
                        guard_units.append(opp_index)
                
                # If Guard units exist, must attack one of them
                targets_to_consider = guard_units if guard_units else range(5)
                
                # If no Guard, must attack highest DEF
                if not guard_units:
                    # Find highest DEF among opponent units
                    enemy_units = []
                    for opp_index, opp_unit_id in enumerate(opponent['battlefield']):
                        if not opp_unit_id:
                            continue
                        defender = CARDS_BY_ID[opp_unit_id]
                        enemy_units.append({
                            'index': opp_index,
                            'def': defender.get('def', 0)
                        })
                    
                    if enemy_units:
                        max_def = max(u['def'] for u in enemy_units)
                        targets_to_consider = [u['index'] for u in enemy_units if u['def'] == max_def]
                
                for opp_index in targets_to_consider:
                    if not opp_unit_id:
                        continue
                    
                    defender = CARDS_BY_ID[opp_unit_id]
                    
                    # Check SPD restrictions
                    attacker_spd = attacker.get('spd', 0)
                    defender_spd = defender.get('spd', 0)
                    has_swift = 'Swift' in attacker.get('keywords', [])
                    
                    if has_swift or attacker_spd >= defender_spd:
                        # Calculate if this is a good attack
                        attacker_atk = attacker.get('atk', 0)
                        defender_def = defender.get('def', 0)
                        defender_atk = defender.get('atk', 0)
                        attacker_def = attacker.get('def', 0)
                        
                        # We destroy them if our ATK > their DEF
                        we_destroy = attacker_atk > defender_def
                        # They destroy us if their ATK > our DEF
                        they_destroy = defender_atk > attacker_def
                        
                        # Calculate value of trade
                        score = 0
                        if we_destroy and not they_destroy:
                            score = 100  # Great trade!
                        elif we_destroy and they_destroy:
                            score = 50   # Even trade
                        elif not we_destroy and not they_destroy:
                            score = 10   # No one dies, chip damage
                        else:
                            score = -50  # Bad trade, we die
                        
                        valid_targets.append({
                            'index': opp_index,
                            'score': score
                        })
                
                # Attack the best target
                if valid_targets:
                    # Sort by score (best first)
                    valid_targets.sort(key=lambda x: x['score'], reverse=True)
                    
                    # Only attack if it's not a terrible trade
                    best_target = valid_targets[0]
                    if best_target['score'] >= -20:  # Don't suicide unless desperate
                        self.attack(ai_player, ai_index, best_target['index'])
    
    def end_turn(self):
        """End current turn and start next"""
        current_player = self.players[self.active_player]
        opponent = self.players[1 - self.active_player]
        
        # Clear Override effects on opponent's Units (expires at end of caster's turn)
        if 'battlefield_override_expires_turn' in opponent:
            for i in range(5):
                if opponent['battlefield'][i] is not None:
                    if opponent['battlefield_override_expires_turn'][i] == self.turn:
                        if opponent['battlefield_corrupt'][i]:
                            self.log(f"{CARDS_BY_ID[opponent['battlefield'][i]]['name']}'s Override expires")
                            opponent['battlefield_corrupt'][i] = False
                            opponent['battlefield_override_expires_turn'][i] = 0
        
        # Clear Wither and Corrupt that have expired
        # NOTE: Wither is now cleared at START of turn (see start_turn())
        # Keeping this comment for reference
        for i in range(5):
            if current_player['battlefield'][i] is not None:
                # Check if Corrupt should be cleared
                corrupt_turn = current_player['battlefield_corrupt_applied_turn'][i]
                if corrupt_turn > 0 and self.half_turn > corrupt_turn:
                    if current_player['battlefield_corrupt'][i]:
                        self.log(f"{CARDS_BY_ID[current_player['battlefield'][i]]['name']}'s Corrupt expires")
                        current_player['battlefield_corrupt'][i] = False
                        current_player['battlefield_corrupt_applied_turn'][i] = 0
                
                # Clear buffs that expire at end of turn
                if current_player['battlefield_buff_expires'][i] == 'end_turn':
                    if current_player['battlefield_atk_buff'][i] or current_player['battlefield_def_buff'][i] or current_player['battlefield_spd_buff'][i]:
                        self.log(f"{CARDS_BY_ID[current_player['battlefield'][i]]['name']}'s buffs expire")
                        current_player['battlefield_atk_buff'][i] = 0
                        current_player['battlefield_def_buff'][i] = 0
                        current_player['battlefield_spd_buff'][i] = 0
                        current_player['battlefield_buff_expires'][i] = None
                
                # Clear Veil of Binding (no retaliate) at end of turn
                if current_player['battlefield_no_retaliate'][i]:
                    self.log(f"{CARDS_BY_ID[current_player['battlefield'][i]]['name']}'s Veil of Binding expires")
                    current_player['battlefield_no_retaliate'][i] = False
        
        # Check Control Loss
        has_units = any(u is not None for u in current_player['battlefield'])
        if not has_units:
            current_player['control_loss'] += 1
            self.log(f"Player {self.active_player + 1} gains Control Loss token ({current_player['control_loss']}/3)")
            
            if current_player['control_loss'] >= 3:
                self.winner = 1 - self.active_player
                self.log(f"Player {self.active_player + 1} loses! Three Control Loss tokens!")
                return
        else:
            # Has units - clear Control Loss
            if current_player['control_loss'] > 0:
                self.log(f"Player {self.active_player + 1} clears Control Loss tokens")
                current_player['control_loss'] = 0
        
        # Rotfall Expanse: check BOTH players at end of turn
        # If either player has more than 3 units, they must destroy down to 3
        for p_idx in range(2):
            p = self.players[p_idx]
            either_has_rotfall = (
                self.players[0].get('field') == 'miasma_rotfall_expanse' or
                self.players[1].get('field') == 'miasma_rotfall_expanse'
            )
            if either_has_rotfall:
                unit_count = sum(1 for u in p['battlefield'] if u is not None)
                if unit_count > 3:
                    must_destroy = unit_count - 3
                    if p_idx == 0:
                        # Human player - set flag and block turn
                        p['rotfall_must_destroy'] = must_destroy
                        self.log(f"🌑 Rotfall Expanse: You have {unit_count} Units - must destroy {must_destroy}!")
                        return  # Block turn end - frontend shows modal
                    else:
                        # AI player - auto-destroy weakest units (lowest ATK)
                        self.log(f"🌑 Rotfall Expanse: Opponent has {unit_count} Units - destroying {must_destroy}!")
                        for _ in range(must_destroy):
                            # Find weakest unit (lowest ATK) to auto-destroy
                            weakest_i = None
                            weakest_atk = 999
                            for i in range(5):
                                if p['battlefield'][i] is not None:
                                    unit_atk = CARDS_BY_ID[p['battlefield'][i]].get('atk', 0)
                                    if unit_atk < weakest_atk:
                                        weakest_atk = unit_atk
                                        weakest_i = i
                            if weakest_i is not None:
                                destroyed_name = CARDS_BY_ID[p['battlefield'][weakest_i]]['name']
                                p['discard'].append(p['battlefield'][weakest_i])
                                p['battlefield'][weakest_i] = None
                                self.log(f"🌑 Rotfall: AI destroys {destroyed_name}")
        
        # Apply energy cap
        if current_player['energy'] > 5:
            current_player['energy'] = 5
        
        # Check hand size limit (max 7 cards) - BLOCK turn from ending
        if len(current_player['hand']) > 7:
            over_limit = len(current_player['hand']) - 7
            if current_player.get('must_discard', 0) == 0:
                # First time - set flag
                current_player['must_discard'] = over_limit
                self.log(f"⚠️ You have {len(current_player['hand'])} cards! Discard {over_limit} before ending turn.")
            return  # BLOCK - don't end turn until hand size is 7 or less
        
        # Clear must_discard flag if it was set
        current_player['must_discard'] = 0
        
        # Switch active player
        self.active_player = 1 - self.active_player
        
        # Increment turn
        if self.active_player == 0:
            self.turn += 1
        
        # Start phase
        self.phase = 'start'
        self.start_turn()
    
    def start_turn(self):
        """Handle start of turn"""
        current_player = self.players[self.active_player]
        
        # Increment half_turn counter (tracks individual player turns for Wither expiry)
        self.half_turn += 1
        
        # Clear ALL Wither on current player's units at START of their turn
        # This handles both Lowlands Mist wither and Blight Pools wither correctly
        for i in range(5):
            if current_player['battlefield'][i] is not None:
                if current_player['battlefield_wither'][i] > 0:
                    unit_name = CARDS_BY_ID[current_player['battlefield'][i]]['name']
                    self.log(f"{unit_name}'s Wither expires")
                    current_player['battlefield_wither'][i] = 0
                    current_player['battlefield_wither_applied_turn'][i] = 0
        
        # Apply Velocity Patch exhaustion to BOTH players (before clearing Petrify)
        # Must check both players since the flag was set on whichever player cast it
        for p in range(2):
            for i in range(5):
                if self.players[p]['battlefield'][i] is not None:
                    if self.players[p]['battlefield_enter_exhausted_next_turn'][i]:
                        unit_name = CARDS_BY_ID[self.players[p]['battlefield'][i]]['name']
                        self.log(f"{unit_name} enters exhausted (Velocity Patch)")
                        self.players[p]['battlefield_exhausted'][i] = True
                        self.players[p]['battlefield_enter_exhausted_next_turn'][i] = False
        
        # Clear Petrify (no attack) at start of turn
        for i in range(5):
            if current_player['battlefield'][i] is not None:
                if current_player['battlefield_no_attack'][i]:
                    self.log(f"{CARDS_BY_ID[current_player['battlefield'][i]]['name']}'s Petrify expires")
                    current_player['battlefield_no_attack'][i] = False
        
        # Clear buffs that expire at start of turn
        for i in range(5):
            if current_player['battlefield'][i] is not None:
                if current_player['battlefield_buff_expires'][i] == 'start_next_turn':
                    if current_player['battlefield_atk_buff'][i] or current_player['battlefield_def_buff'][i] or current_player['battlefield_spd_buff'][i]:
                        self.log(f"{CARDS_BY_ID[current_player['battlefield'][i]]['name']}'s buffs expire")
                        current_player['battlefield_atk_buff'][i] = 0
                        current_player['battlefield_def_buff'][i] = 0
                        current_player['battlefield_spd_buff'][i] = 0
                        current_player['battlefield_buff_expires'][i] = None
        
        # Draw card
        self.draw_cards(current_player, 1)
        
        # Gain energy (check for Arcane Surge skip)
        if current_player.get('skip_next_energy_gain', False):
            self.log(f"⚡ Arcane Surge effect: No energy gained this turn")
            current_player['skip_next_energy_gain'] = False
        else:
            current_player['energy'] += 2
        
        # Apply pending energy from Kill Zone / Rustfields
        if current_player.get('pending_energy', 0) > 0:
            current_player['energy'] += current_player['pending_energy']
            self.log(f"⚡ Gained {current_player['pending_energy']}⚡ from field effect!")
            current_player['pending_energy'] = 0
        
        # Relay Node: gain 1⚡ if you have a Skyforge Unit deployed AND energy < 5 (max 1 per turn)
        current_player['relay_node_gained'] = False
        if current_player.get('field') == 'skyforge_relay_node':
            if current_player['energy'] < 5:
                has_skyforge_unit = any(
                    uid and CARDS_BY_ID[uid].get('faction') == 'Skyforge'
                    for uid in current_player['battlefield']
                )
                if has_skyforge_unit:
                    current_player['energy'] += 1
                    current_player['relay_node_gained'] = True
                    self.log(f"⚡ Relay Node: Gained 1⚡ (Skyforge Unit deployed)")
            else:
                self.log(f"⚡ Relay Node: Energy already at max (5⚡)")
        
        # Lowlands Mist: apply Wither to all ENEMY units at start of YOUR turn
        # Wither will expire at start of ENEMY's next turn automatically
        opponent_idx = 1 - self.active_player
        opponent = self.players[opponent_idx]
        if current_player.get('field') == 'miasma_lowlands_mist':
            for i in range(5):
                if opponent['battlefield'][i] is not None:
                    opponent['battlefield_wither'][i] += 1
                    opponent['battlefield_wither_applied_turn'][i] = self.half_turn
                    unit_name = CARDS_BY_ID[opponent['battlefield'][i]]['name']
                    self.log(f"🌫️ Lowlands Mist: {unit_name} withers (DEF -1 until their next turn)")
        
        # Ready all units (remove exhaustion)
        for i in range(5):
            if current_player['battlefield'][i] is not None:
                current_player['battlefield_exhausted'][i] = False
        
        self.log(f"Turn {self.turn} - Player {self.active_player + 1}'s turn begins")
        self.log(f"All Units are readied")
        
        # Auto-advance to deploy phase
        self.phase = 'deploy'

def create_starter_deck(faction):
    """Create a 42-card starter deck for a faction"""
    
    # Skyforge 42-card starter deck (EXACT list with duplicates)
    if faction == 'Skyforge':
        deck = []
        
        # All cards with quantities (including duplicates to reach 42)
        deck_list = {
            'skyforge_skyforge_drone': 3,
            'skyforge_skyforge_scout': 3,
            'skyforge_skyforge_gunner': 2,
            'skyforge_skyforge_interceptor': 1,
            'skyforge_skyforge_bulwark': 1,
            'skyforge_skyforge_overseer': 1,
            'human_scrapland_scavenger': 2,  # Added +1 for 42nd card
            'hybrid_ashfang_hound': 1,
            'ancient_wasteland_sentinel': 1,
            'beast_carrion_drifter': 1,
            'human_dustrunner_nomad': 1,
            'mutant_ironhide_behemoth': 1,
            'mutant_signal_leech': 1,
            'undead_gravefield_lurker': 1,
            'undead_wanderer_of_ash': 1,
            'skyforge_override': 1,
            'skyforge_software_update': 1,
            'skyforge_velocity_patch': 1,
            'skyforge_reboot': 1,
            'generic_arcane_surge': 2,  # Duplicate (+1)
            'generic_veil_of_binding': 1,
            'generic_food_rations': 1,
            'generic_travelling_merchant': 1,
            'skyforge_lockdown': 1,
            'skyforge_counter_measure': 2,  # Duplicate (+1)
            'skyforge_self_destruct': 1,
            'skyforge_decoy_protocol': 1,
            'generic_flute_of_slumber': 1,
            'generic_return_to_sender': 1,
            'skyforge_assembly_line': 2,  # Duplicate (+1)
            'skyforge_relay_node': 1,
            'skyforge_kill_zone': 1,
            'skyforge_rustfields': 1,
        }
        
        for card_id, count in deck_list.items():
            if card_id in CARDS_BY_ID:
                for _ in range(count):
                    deck.append(card_id)
            else:
                print(f"Warning: Card not found: {card_id}")
        
        return deck
    
    # Miasma 42-card starter deck (EXACT list with duplicates)
    elif faction == 'Miasma':
        deck = []
        
        # All cards with quantities (including duplicates to reach 42)
        deck_list = {
            'miasma_miasma_drifter': 3,
            'miasma_miasma_husk': 3,
            'miasma_miasma_stalker': 2,
            'miasma_miasma_spore_swarm': 1,
            'miasma_miasma_blightcrawler': 1,
            'miasma_miasma_corruptor': 1,
            'miasma_miasma_rot_titan': 1,
            'miasma_the_living_miasma': 1,
            'gnome_knoxx_the_engineer': 2,  # Added +1 for 42nd card
            'undead_fog_walker_guide': 1,
            'undead_ashara_the_bone_seer': 1,
            'human_edda_the_thief': 1,
            'human_scrap_gladiator': 1,
            'human_kalzar_of_the_scribes': 1,
            'human_beast_tamer_tarn': 1,
            'miasma_encroaching_fog': 1,
            'miasma_toxic_sludge': 1,
            'miasma_petrify': 1,
            'miasma_choking_spores': 1,
            'generic_eviction_notice': 1,
            'generic_emergency_repairs': 2,  # Duplicate (+1)
            'generic_adrenal_rush': 1,
            'generic_salvage_the_ruins': 2,  # Duplicate (+1)
            'miasma_miasma_potion': 2,  # Duplicate (+1)
            'miasma_rot_beneath_the_surface': 1,
            'miasma_foglash': 1,
            'generic_earthquake': 1,
            'generic_counter_sigil': 1,
            'generic_false_step': 1,
            'miasma_lowlands_mist': 1,
            'miasma_blight_pools': 2,  # Duplicate (+1)
            'miasma_rotfall_expanse': 1,
        }
        
        for card_id, count in deck_list.items():
            if card_id in CARDS_BY_ID:
                for _ in range(count):
                    deck.append(card_id)
            else:
                print(f"Warning: Card not found: {card_id}")
        
        return deck
    
    return []

@app.route('/')
def index():
    """Main game page"""
    return render_template('game.html')

@app.route('/api/new_game', methods=['POST'])
def new_game():
    """Create a new game"""
    data = request.json
    faction1 = data.get('faction1', 'Skyforge')
    faction2 = data.get('faction2', 'Miasma')
    
    deck1 = create_starter_deck(faction1)
    deck2 = create_starter_deck(faction2)
    
    game = GameState(deck1, deck2)
    games[game.game_id] = game
    
    return jsonify({
        'game_id': game.game_id,
        'state': game.get_state(0)
    })

@app.route('/api/game/new', methods=['POST'])
def new_game_with_factions():
    """Create a new game with faction choice"""
    data = request.json
    player_faction = data.get('player_faction', 'skyforge').capitalize()
    opponent_faction = data.get('opponent_faction', 'miasma').capitalize()
    
    deck1 = create_starter_deck(player_faction)
    deck2 = create_starter_deck(opponent_faction)
    
    game = GameState(deck1, deck2)
    games[game.game_id] = game
    
    return jsonify({
        'game_id': game.game_id
    })

@app.route('/api/game/<game_id>/state', methods=['GET'])
def get_game_state(game_id):
    """Get current game state"""
    game = games.get(game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404
    
    player = int(request.args.get('player', 0))
    return jsonify(game.get_state(player))

@app.route('/api/game/<game_id>/play_card', methods=['POST'])
def play_card(game_id):
    """Play a card from hand"""
    game = games.get(game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404
    
    data = request.json
    player = data.get('player', 0)
    card_id = data.get('card_id')
    
    result = game.play_card(player, card_id)
    
    return jsonify({
        'result': result,
        'state': game.get_state(player)
    })

@app.route('/api/game/<game_id>/attack', methods=['POST'])
def attack(game_id):
    """Declare an attack"""
    game = games.get(game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404
    
    data = request.json
    player = data.get('player', 0)
    attacker_index = data.get('attacker_index')
    defender_index = data.get('defender_index')
    
    result = game.attack(player, attacker_index, defender_index)
    
    return jsonify({
        'result': result,
        'state': game.get_state(player)
    })

# ============================================================
# PHASE 3B: TRAP ACTIVATION ENDPOINTS
# ============================================================

@app.route('/api/game/<game_id>/activate_trap', methods=['POST'])
def activate_trap(game_id):
    """Activate a trap"""
    game = games.get(game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404
    
    data = request.json
    player = data.get('player', 0)
    trap_slot = data.get('trap_slot')
    activate = data.get('activate', False)  # True = YES, False = NO
    
    # Get trap from player's trap slots
    trap_id = game.players[player]['traps'][trap_slot]
    if not trap_id:
        return jsonify({'error': 'No trap in that slot'}), 404
    
    trap = CARDS_BY_ID[trap_id]
    
    if activate:
        # Player chose YES - activate the trap
        
        # Check energy cost
        if game.players[player]['energy'] < trap['cost']:
            return jsonify({'error': 'Not enough energy'}), 400
        
        # Pay energy cost
        game.players[player]['energy'] -= trap['cost']
        game.log(f"Player {player + 1} activates {trap['name']} (Cost: {trap['cost']})")
        
        # Remove trap from slot
        game.players[player]['traps'][trap_slot] = None
        
        # Move trap to discard
        game.players[player]['discard'].append(trap_id)
        
        # TODO: Phase 3D - Resolve trap effect
        # For now, just return success
        
        return jsonify({
            'success': True,
            'message': f"Activated {trap['name']}",
            'trap_activated': True,
            'trap_id': trap_id,
            'state': game.get_state(player)
        })
    else:
        # Player chose NO - don't activate
        game.log(f"Player {player + 1} did not activate {trap['name']}")
        
        return jsonify({
            'success': True,
            'message': f"Did not activate {trap['name']}",
            'trap_activated': False,
            'state': game.get_state(player)
        })

@app.route('/api/game/<game_id>/pierce', methods=['POST'])
def apply_pierce(game_id):
    """Apply Pierce overflow damage to a target"""
    game = games.get(game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404
    
    data = request.json
    defender_player = data.get('defender_player')
    pierce_target_index = data.get('pierce_target_index')
    pierce_damage = data.get('pierce_damage')
    
    result = game.apply_pierce(pierce_target_index, pierce_damage, defender_player)
    
    player = int(data.get('player', 0))
    return jsonify({
        'result': result,
        'state': game.get_state(player)
    })

@app.route('/api/game/<game_id>/target_technique', methods=['POST'])
def target_technique(game_id):
    """Apply a targeted technique effect"""
    game = games.get(game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404
    
    data = request.json
    player_idx = int(data.get('player', 0))
    card_id = data.get('card_id')
    target_player = int(data.get('target_player'))
    target_index = int(data.get('target_index'))
    
    result = game.apply_targeted_technique(player_idx, card_id, target_player, target_index)
    
    return jsonify({
        'result': result,
        'state': game.get_state(player_idx)
    })

@app.route('/api/game/<game_id>/advance_phase', methods=['POST'])
def advance_phase(game_id):
    """Advance to next phase"""
    game = games.get(game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404
    
    game.advance_phase()
    
    player = int(request.json.get('player', 0))
    return jsonify(game.get_state(player))

@app.route('/api/game/<game_id>/discard', methods=['POST'])
def discard_card(game_id):
    """Discard a card from hand (hand limit)"""
    game = games.get(game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404
    
    data = request.json
    card_index = data.get('card_index')
    
    current_player = game.players[game.active_player]
    
    if current_player.get('must_discard', 0) == 0:
        return jsonify({'error': 'No need to discard'})
    
    if card_index < 0 or card_index >= len(current_player['hand']):
        return jsonify({'error': 'Invalid card index'})
    
    # Discard the card
    discarded_card = current_player['hand'].pop(card_index)
    current_player['discard'].append(discarded_card)
    current_player['must_discard'] -= 1
    
    game.log(f"Discarded {CARDS_BY_ID[discarded_card]['name']} (hand limit: {len(current_player['hand'])}/7)")
    
    # Check if still need to discard more
    if len(current_player['hand']) > 7:
        game.log(f"⚠️ Still {len(current_player['hand']) - 7} more to discard")
    else:
        game.log(f"✅ Hand at 7 cards. You may end turn now.")
        current_player['must_discard'] = 0
    
    player = int(data.get('player', 0))
    return jsonify(game.get_state(player))

@app.route('/api/game/<game_id>/rotfall_destroy', methods=['POST'])
def rotfall_destroy(game_id):
    """Destroy a unit due to Rotfall Expanse (player chooses)"""
    game = games.get(game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404
    
    data = request.json
    unit_index = data.get('unit_index')
    player_idx = int(data.get('player', 0))
    
    current_player = game.players[player_idx]
    
    if current_player.get('rotfall_must_destroy', 0) == 0:
        return jsonify({'error': 'No Rotfall destruction required'})
    
    if unit_index is None or unit_index < 0 or unit_index >= 5:
        return jsonify({'error': 'Invalid unit index'})
    
    if current_player['battlefield'][unit_index] is None:
        return jsonify({'error': 'No unit in that slot'})
    
    # Destroy the chosen unit
    destroyed_id = current_player['battlefield'][unit_index]
    destroyed_name = CARDS_BY_ID[destroyed_id]['name']
    current_player['battlefield'][unit_index] = None
    current_player['battlefield_exhausted'][unit_index] = False
    current_player['battlefield_wither'][unit_index] = 0
    current_player['battlefield_corrupt'][unit_index] = False
    current_player['discard'].append(destroyed_id)
    current_player['rotfall_must_destroy'] -= 1
    
    game.log(f"🌑 Rotfall Expanse: {destroyed_name} destroyed by Rotfall!")
    
    if current_player['rotfall_must_destroy'] > 0:
        game.log(f"🌑 Must destroy {current_player['rotfall_must_destroy']} more Unit(s)")
    else:
        game.log(f"✅ Rotfall satisfied. You may end turn now.")
    
    return jsonify(game.get_state(player_idx))

@app.route('/api/cards', methods=['GET'])
def get_cards():
    """Get all cards"""
    return jsonify(CARD_DATABASE)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
