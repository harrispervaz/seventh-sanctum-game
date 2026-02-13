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
        self.phase = 'start'  # start, deploy, combat, end
        
        # Player states
        self.players = [
            {
                'deck': player1_deck.copy(),
                'hand': [],
                'battlefield': [None, None, None, None, None],  # 5 unit slots
                'field': None,
                'traps': [None, None, None],  # 3 trap slots (face-down)
                'discard': [],
                'energy': 5,  # Starting energy (players start with 5, gain 2 on Turn 1)
                'control_loss': 0
            },
            {
                'deck': player2_deck.copy(),
                'hand': [],
                'battlefield': [None, None, None, None, None],
                'field': None,
                'traps': [None, None, None],
                'discard': [],
                'energy': 5,
                'control_loss': 0
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
                'hand': [self.get_card_data(cid) for cid in self.players[player_perspective]['hand']],
                'battlefield': [self.get_card_data(cid) if cid else None for cid in self.players[player_perspective]['battlefield']],
                'field': self.get_card_data(self.players[player_perspective]['field']) if self.players[player_perspective]['field'] else None,
                'traps': [self.get_card_data(cid) if cid else None for cid in self.players[player_perspective]['traps']],
                'deck_count': len(self.players[player_perspective]['deck']),
                'discard_count': len(self.players[player_perspective]['discard'])
            },
            'opponent': {
                'energy': self.players[opponent]['energy'],
                'control_loss': self.players[opponent]['control_loss'],
                'hand_count': len(self.players[opponent]['hand']),
                'battlefield': [self.get_card_data(cid) if cid else None for cid in self.players[opponent]['battlefield']],
                'field': self.get_card_data(self.players[opponent]['field']) if self.players[opponent]['field'] else None,
                'trap_count': sum(1 for t in self.players[opponent]['traps'] if t is not None),
                'deck_count': len(self.players[opponent]['deck']),
                'discard_count': len(self.players[opponent]['discard'])
            },
            'log': self.game_log[-10:]  # Last 10 messages
        }
    
    def get_card_data(self, card_id):
        """Get card data with runtime state"""
        if not card_id:
            return None
        
        card = CARDS_BY_ID.get(card_id, {}).copy()
        # Add any runtime modifications here (buffs, debuffs, etc.)
        return card
    
    def attack(self, attacker_player, attacker_index, defender_index):
        """
        Declare an attack from one Unit to another
        Implements full combat rules from The Seventh Sanctum
        """
        # Turn 1 restriction: No player may attack on Turn 1
        if self.turn == 1:
            return {'error': 'No attacks allowed on Turn 1. Combat begins on Turn 2.'}
        
        attacker_player_obj = self.players[attacker_player]
        defender_player = 1 - attacker_player
        defender_player_obj = self.players[defender_player]
        
        # Get attacking Unit
        attacker_card_id = attacker_player_obj['battlefield'][attacker_index]
        if not attacker_card_id:
            return {'error': 'No Unit in that slot'}
        
        attacker = CARDS_BY_ID[attacker_card_id]
        
        # Check if Unit can attack (must be UNIT type)
        if attacker['type'] != 'UNIT':
            return {'error': 'Only Units can attack'}
        
        # TODO: Check if Unit is exhausted (not implemented yet)
        # For now, allow all attacks
        
        # Get defending Unit
        defender_card_id = defender_player_obj['battlefield'][defender_index]
        if not defender_card_id:
            return {'error': 'No Unit in that slot'}
        
        defender = CARDS_BY_ID[defender_card_id]
        
        # Check SPD restrictions
        # A Unit may only attack a Unit with equal or lower SPD
        attacker_spd = attacker.get('spd', 0)
        defender_spd = defender.get('spd', 0)
        
        # Swift keyword bypasses SPD restrictions (not implemented yet)
        has_swift = 'Swift' in attacker.get('keywords', [])
        
        if not has_swift and attacker_spd < defender_spd:
            return {'error': f'SPD too low! {attacker["name"]} (SPD {attacker_spd}) cannot attack {defender["name"]} (SPD {defender_spd})'}
        
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
        
        # If no Guard, must attack highest DEF
        # (For now, we'll allow free targeting - this can be enforced later)
        
        # RESOLVE COMBAT
        attacker_atk = attacker.get('atk', 0)
        defender_def = defender.get('def', 0)
        defender_atk = defender.get('atk', 0)
        attacker_def = attacker.get('def', 0)
        
        combat_log = []
        combat_log.append(f"{attacker['name']} attacks {defender['name']}!")
        
        # Check if defender is destroyed
        defender_destroyed = False
        if attacker_atk > defender_def:
            defender_destroyed = True
            combat_log.append(f"{defender['name']} is destroyed! ({attacker_atk} ATK > {defender_def} DEF)")
            defender_player_obj['battlefield'][defender_index] = None
            defender_player_obj['discard'].append(defender_card_id)
        else:
            combat_log.append(f"{defender['name']} survives! ({attacker_atk} ATK ≤ {defender_def} DEF)")
        
        # Retaliation (only if defender survives and is ready)
        # TODO: Check if defender is exhausted
        attacker_destroyed = False
        if not defender_destroyed:
            if defender_atk > attacker_def:
                attacker_destroyed = True
                combat_log.append(f"{defender['name']} retaliates and destroys {attacker['name']}! ({defender_atk} ATK > {attacker_def} DEF)")
                attacker_player_obj['battlefield'][attacker_index] = None
                attacker_player_obj['discard'].append(attacker_card_id)
            else:
                combat_log.append(f"{attacker['name']} survives retaliation! ({defender_atk} ATK ≤ {attacker_def} DEF)")
        
        # Pierce keyword (excess damage to another Unit)
        if 'Pierce' in attacker.get('keywords', []) and defender_destroyed and not attacker_destroyed:
            excess_damage = attacker_atk - defender_def
            combat_log.append(f"Pierce! {excess_damage} excess damage available")
            # TODO: Allow player to choose Pierce target
        
        # Log combat
        for msg in combat_log:
            self.log(msg)
        
        # TODO: Exhaust attacking Unit
        
        return {
            'success': True,
            'combat_log': combat_log,
            'attacker_destroyed': attacker_destroyed,
            'defender_destroyed': defender_destroyed
        }
    
    def play_card(self, player_idx, card_id, target=None):
        """Play a card from hand"""
        player = self.players[player_idx]
        
        if card_id not in player['hand']:
            return {'error': 'Card not in hand'}
        
        card = CARDS_BY_ID[card_id]
        
        # Check energy cost (EXCEPT for Traps - they're free to set)
        if card['type'] != 'TRAP':
            if player['energy'] < card['cost']:
                return {'error': 'Not enough energy'}
            # Pay energy
            player['energy'] -= card['cost']
        
        player['hand'].remove(card_id)
        
        # Handle card type
        if card['type'] == 'UNIT':
            # Find empty battlefield slot
            for i in range(5):
                if player['battlefield'][i] is None:
                    player['battlefield'][i] = card_id
                    self.log(f"Player {player_idx + 1} deploys {card['name']}")
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
            # Technique resolves immediately then goes to discard
            player['discard'].append(card_id)
            self.log(f"Player {player_idx + 1} plays {card['name']}")
            # TODO: Implement technique effects
            return {'success': True, 'message': f"Played {card['name']}"}
        
        return {'error': 'Unknown card type'}
    
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
                
                attacker = CARDS_BY_ID[unit_id]
                
                # Find valid targets (units we can actually attack)
                valid_targets = []
                
                for opp_index, opp_unit_id in enumerate(opponent['battlefield']):
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
        
        # Apply energy cap
        if current_player['energy'] > 5:
            current_player['energy'] = 5
        
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
        
        # Draw card
        self.draw_cards(current_player, 1)
        
        # Gain energy
        current_player['energy'] += 2
        
        # TODO: Ready all units
        
        self.log(f"Turn {self.turn} - Player {self.active_player + 1}'s turn begins")
        
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

@app.route('/api/game/<game_id>/advance_phase', methods=['POST'])
def advance_phase(game_id):
    """Advance to next phase"""
    game = games.get(game_id)
    if not game:
        return jsonify({'error': 'Game not found'}), 404
    
    game.advance_phase()
    
    player = int(request.json.get('player', 0))
    return jsonify(game.get_state(player))

@app.route('/api/cards', methods=['GET'])
def get_cards():
    """Get all cards"""
    return jsonify(CARD_DATABASE)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
