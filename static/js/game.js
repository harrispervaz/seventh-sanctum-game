// The Seventh Sanctum - Game Client JavaScript

let gameState = null;
let gameId = null;
let selectedCard = null;
let attackMode = false;
let selectedAttacker = null;
let pierceMode = false;
let pierceData = null; // {damage, defender_player, attacker_player, attacker_index}
let targetingMode = false;
let targetingCard = null; // {card, card_id, target_type}
let cardModalOpen = false;
let pendingAttackData = null;  // PHASE 3B: Store attack data when trap triggers
let pendingTriggerData = null; // PHASE 3D: Store trigger data for trap effects

// Initialize game
async function initGame() {
    console.log('🎮 Initializing game...');
    try {
        const response = await fetch('/api/new_game', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                faction1: 'Skyforge',
                faction2: 'Miasma'
            })
        });
        
        console.log('📡 Response received:', response.status);
        const data = await response.json();
        console.log('📦 Game data:', data);
        
        gameId = data.game_id;
        gameState = data.state;
        
        console.log('✅ Game state loaded');
        console.log('👤 Your hand:', gameState.you.hand);
        console.log('🎴 Hand size:', gameState.you.hand ? gameState.you.hand.length : 0);
        
        updateUI();
        addLog('Game started! You are playing Skyforge vs Miasma AI');
    } catch (error) {
        console.error('❌ Error starting game:', error);
        addLog('Error starting game. Please refresh.');
    }
}

// Update the entire UI
function updateUI() {
    // CRITICAL: Comprehensive state validation
    if (!gameState) {
        console.error('❌ updateUI called with null gameState!');
        return;
    }
    
    if (!gameState.you || !gameState.opponent) {
        console.error('❌ updateUI: Missing player data!', gameState);
        return;
    }
    
    if (!gameState.phase || !gameState.turn) {
        console.error('❌ updateUI: Missing phase or turn!', gameState);
        return;
    }
    
    // Check for Rotfall Expanse destruction requirement
    checkRotfall(gameState);
    
    // Update header info
    document.getElementById('turn-number').textContent = gameState.turn ?? '?';
    document.getElementById('current-phase').textContent = capitalizeFirst(gameState.phase ?? 'unknown');
    
    const isYourTurn = gameState.active_player === 0;
    document.getElementById('active-player-indicator').textContent = 
        isYourTurn ? "🟢 Your Turn" : "🔴 Opponent's Turn";
    
    // Disable attack button on Turn 1 or if not combat phase
    const attackBtn = document.getElementById('attack-mode-btn');
    if (gameState.turn === 1) {
        attackBtn.disabled = true;
        attackBtn.title = "Combat begins on Turn 2";
    } else if (gameState.phase !== 'combat' || !isYourTurn) {
        attackBtn.disabled = true;
        attackBtn.title = isYourTurn ? "Advance to Combat Phase first" : "Not your turn";
    } else {
        attackBtn.disabled = false;
        attackBtn.title = "Declare attacks with your Units";
    }
    
    // Update stats (with fallbacks)
    document.getElementById('your-energy').textContent = gameState.you.energy ?? 0;
    document.getElementById('your-control-loss').textContent = gameState.you.control_loss ?? 0;
    document.getElementById('opponent-energy').textContent = gameState.opponent.energy ?? 0;
    document.getElementById('opponent-control-loss').textContent = gameState.opponent.control_loss ?? 0;
    
    // Update your hand
    renderHand();
    
    // Update opponent's hand (card backs)
    renderOpponentHand();
    
    // Update battlefields
    renderBattlefield('your', gameState.you.battlefield);
    renderBattlefield('opponent', gameState.opponent.battlefield);
    
    // Update fields
    renderField('your', gameState.you.field);
    renderField('opponent', gameState.opponent.field);
    
    // Update traps
    renderTraps('your', gameState.you.traps);
    renderTraps('opponent', gameState.opponent.trap_count);
    
    // Update game log
    if (gameState.log) {
        gameState.log.forEach(entry => {
            if (!document.querySelector(`[data-log="${entry.message}"]`)) {
                addLog(entry.message);
            }
        });
    }
    
    // Check for winner
    if (gameState.winner !== null) {
        showWinModal(gameState.winner === 0);
    }
}

// Track previous hand state for draw animations
let previousHandIds = [];

// Render your hand
function renderHand() {
    console.log('🃏 Rendering hand...');
    const handEl = document.getElementById('your-hand');
    
    if (!gameState || !gameState.you || !gameState.you.hand) {
        console.error('❌ No hand data!', gameState);
        return;
    }
    
    // Get current hand IDs
    const currentHandIds = gameState.you.hand.map(card => card.id);
    
    handEl.innerHTML = '';
    
    console.log(`📇 Hand has ${gameState.you.hand.length} cards`);
    
    // Check if must discard
    const mustDiscard = gameState.you.must_discard || 0;
    if (mustDiscard > 0) {
        const discardNotice = document.createElement('div');
        discardNotice.style.cssText = `
            color: #ff6b6b;
            font-weight: bold;
            font-size: 16px;
            text-align: center;
            padding: 10px;
            background: rgba(255, 107, 107, 0.2);
            border-radius: 5px;
            margin-bottom: 10px;
        `;
        discardNotice.textContent = `⚠️ HAND LIMIT! Discard ${mustDiscard} card${mustDiscard > 1 ? 's' : ''}`;
        handEl.appendChild(discardNotice);
    }
    
    gameState.you.hand.forEach((card, index) => {
        console.log(`  Card ${index}:`, card);
        const cardEl = createCardElement(card, true);
        
        // Check if this is a newly drawn card
        const isNewCard = !previousHandIds.includes(card.id);
        
        if (mustDiscard > 0) {
            // Discard mode - click to discard
            cardEl.style.cursor = 'pointer';
            cardEl.style.border = '3px solid #ff6b6b';
            cardEl.addEventListener('click', (e) => {
                e.stopPropagation();
                showDiscardModal(card, index);
            });
        } else {
            // Normal mode
            // Single click to select
            cardEl.addEventListener('click', (e) => {
                e.stopPropagation();
                selectCard(card, index);
            });
            
            // Double click to zoom
            cardEl.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                showCardModal(card);
            });
        }
        
        handEl.appendChild(cardEl);
        
        // Play draw animation for new cards
        if (isNewCard) {
            playDrawAnimation(cardEl);
        }
    });
    
    // Update previous hand state
    previousHandIds = currentHandIds;
    
    console.log('✅ Hand rendered');
}

// Render opponent's hand (card backs)
function renderOpponentHand() {
    const handEl = document.getElementById('opponent-hand');
    handEl.innerHTML = '';
    
    const count = gameState.opponent.hand_count || 0;
    for (let i = 0; i < count; i++) {
        const cardBack = document.createElement('div');
        cardBack.className = 'card card-back';
        
        const backImg = document.createElement('img');
        backImg.src = '/static/images/card-back.png';
        backImg.style.cssText = `
            width: 90px;
            height: 145px;
            border-radius: 8px;
        `;
        cardBack.appendChild(backImg);
        handEl.appendChild(cardBack);
    }
}

// Render battlefield
// Track previous battlefield state for exhaust detection
let previousBattlefieldState = { your: [], opponent: [] };

function renderBattlefield(player, units) {
    for (let i = 0; i < 5; i++) {
        const slot = document.querySelector(`[data-zone="${player}-unit"][data-index="${i}"]`);
        const hadCard = slot.querySelector('.card') !== null;
        const existingCard = slot.querySelector('.card');
        
        // Check if a unit was destroyed (had card, now no card)
        const wasDestroyed = hadCard && !units[i];
        
        if (wasDestroyed && existingCard) {
            // Play destroy animation before clearing slot
            playDestroyAnimation(existingCard, () => {
                slot.innerHTML = '<small>UNIT</small>';
            });
            continue; // Skip the rest for this slot - let animation finish
        }
        
        slot.innerHTML = '';
        
        if (units[i]) {
            const isOpponent = player === 'opponent';
            const cardEl = createBattlefieldCard(units[i], isOpponent);
            
            // Trigger play animation for newly deployed cards (both players)
            if (!hadCard) {
                playPlayAnimation(cardEl);
            }
            
            // Check if card just became exhausted
            const previousState = previousBattlefieldState[player][i];
            if (previousState && !previousState.is_exhausted && units[i].is_exhausted) {
                // Card just became exhausted - play sparkle effect!
                setTimeout(() => {
                    const cardInSlot = slot.querySelector('.card');
                    if (cardInSlot) {
                        playExhaustSparkle(cardInSlot);
                    }
                }, 200); // Trigger as rotation starts
            }
            
            // Add attack functionality for your units
            if (player === 'your' && attackMode) {
                cardEl.style.cursor = 'pointer';
                cardEl.style.border = '3px solid gold';
                cardEl.addEventListener('click', () => selectAttacker(i));
            }
            
            // Add defend functionality for opponent units (normal attack)
            if (player === 'opponent' && attackMode && selectedAttacker !== null) {
                cardEl.style.cursor = 'crosshair';
                cardEl.style.border = '3px solid red';
                cardEl.addEventListener('click', () => declareAttack(selectedAttacker, i));
            }
            
            // Add Pierce target selection for opponent units
            if (player === 'opponent' && pierceMode) {
                cardEl.style.cursor = 'pointer';
                cardEl.style.border = '3px solid purple';
                cardEl.style.boxShadow = '0 0 15px purple';
                cardEl.addEventListener('click', () => selectPierceTarget(i));
            }
            
            // Add targeting for techniques
            if (targetingMode) {
                const targetPlayer = player === 'your' ? 0 : 1;
                const canTarget = targetingCard.target_type === 'any_unit' || 
                                 (targetingCard.target_type === 'friendly_unit' && player === 'your') ||
                                 (targetingCard.target_type === 'enemy_unit' && player === 'opponent');
                
                if (canTarget) {
                    cardEl.style.cursor = 'pointer';
                    cardEl.style.border = '3px solid yellow';
                    cardEl.style.boxShadow = '0 0 15px yellow';
                    cardEl.addEventListener('click', () => applyTargetedTechnique(targetPlayer, i));
                }
            }
            
            slot.appendChild(cardEl);
        } else {
            slot.innerHTML = '<small>UNIT</small>';
        }
    }
    
    // Update previous state for next comparison
    previousBattlefieldState[player] = units.map(unit => unit ? {...unit} : null);
}

// Create battlefield card with proper icon positioning
function createBattlefieldCard(card, isOpponent = false) {
    if (!card) return null;
    
    const cardEl = document.createElement('div');
    cardEl.className = `card ${card.type.toLowerCase()}`;
    
    // Add "cannot attack" visual state (Counter Measure / Petrify effect)
    if (card.no_attack) {
        cardEl.classList.add('unit-cannot-attack');
    }
    
    // Add click to view full card (only when not in attack/targeting mode)
    cardEl.style.cursor = 'zoom-in';
    cardEl.addEventListener('click', (e) => {
        if (!attackMode && !targetingMode && !pierceMode) {
            e.stopPropagation();
            showCardModal(card);
        }
    });
    
    // Add exhausted styling with rotation
    if (card.is_exhausted) {
        cardEl.style.opacity = '0.6';
        cardEl.style.filter = 'grayscale(60%)';
        cardEl.style.transform = 'rotate(90deg)';
        cardEl.style.transition = 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.6s ease, filter 0.6s ease';
        cardEl.title = 'Exhausted - Cannot attack or retaliate';
    } else {
        cardEl.style.transform = 'rotate(0deg)';
        cardEl.style.transition = 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.6s ease, filter 0.6s ease';
    }
    
    // Add artwork image (80x80) - FIXED POSITION
    const artworkEl = document.createElement('img');
    artworkEl.src = `/static/images/cards/${card.id}.png`;
    artworkEl.onerror = () => {
        // Fallback: hide if image missing
        artworkEl.style.display = 'none';
    };
    artworkEl.style.cssText = `
        width: 80px;
        height: 80px;
        object-fit: cover;
        border-radius: 5px;
        margin-top: 1px;
        margin-bottom: 2px;
        border: 1px solid rgba(255,255,255,0.2);
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    `;
    cardEl.appendChild(artworkEl);
    
    // Add keyword icons for Units
    if (card.type === 'UNIT' && card.keywords && card.keywords.length > 0) {
        const iconsContainer = document.createElement('div');
        iconsContainer.className = 'keyword-icons';
        
        // Position at bottom for opponent, top for you
        const position = isOpponent ? 'bottom: -22px;' : 'top: -22px;';
        
        iconsContainer.style.cssText = `
            position: absolute;
            ${position}
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 3px;
            background: rgba(0,0,0,0.9);
            padding: 3px 6px;
            border-radius: 10px;
            font-size: 14px;
            z-index: 10;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        `;
        
        const keywordIcons = {
            'Swift': '🏃',
            'Guard': '🛡️',
            'Pierce': '🎯',
            'Wither': '🥀',
            'Corrupt': '🦠',
            'Echo': '🔊',
            'Retreat': '↩️'
        };
        
        card.keywords.forEach(keyword => {
            if (keywordIcons[keyword]) {
                const icon = document.createElement('span');
                icon.textContent = keywordIcons[keyword];
                icon.title = keyword;
                icon.style.cursor = 'help';
                iconsContainer.appendChild(icon);
            }
        });
        
        if (iconsContainer.children.length > 0) {
            cardEl.appendChild(iconsContainer);
        }
    }
    
    // Add exhaustion icon if exhausted
    if (card.is_exhausted) {
        const exhaustIcon = document.createElement('div');
        exhaustIcon.className = 'exhaustion-icon';
        exhaustIcon.textContent = '💤';
        exhaustIcon.style.cssText = `
            position: absolute;
            top: -20px;
            left: -5px;
            font-size: 18px;
            z-index: 11;
            filter: drop-shadow(0 0 2px black);
        `;
        exhaustIcon.title = 'Exhausted';
        cardEl.appendChild(exhaustIcon);
    }
    
    
    // Add Wither indicator if unit has Wither stacks
    if (card.wither_stacks && card.wither_stacks > 0) {
        const witherIndicator = document.createElement('div');
        witherIndicator.innerHTML = `🥀 -${card.wither_stacks}`;
        witherIndicator.style.cssText = `
            position: absolute;
            bottom: 25px;
            left: 2px;
            background: rgba(139, 0, 139, 0.95);
            color: white;
            padding: 2px 5px;
            border-radius: 5px;
            font-size: 10px;
            font-weight: bold;
            z-index: 12;
        `;
        witherIndicator.title = `Wither: DEF reduced by ${card.wither_stacks}`;
        cardEl.appendChild(witherIndicator);
    }
    
    // Add Corrupt indicator if unit is corrupted
    if (card.is_corrupt) {
        const corruptIndicator = document.createElement('div');
        corruptIndicator.textContent = '🦠';
        corruptIndicator.style.cssText = `
            position: absolute;
            bottom: 25px;
            right: 2px;
            font-size: 20px;
            z-index: 12;
            filter: drop-shadow(0 0 3px rgba(0,255,0,0.8));
        `;
        corruptIndicator.title = 'Corrupted: Abilities disabled';
        cardEl.appendChild(corruptIndicator);
    }
    
    // Cost
    const costEl = document.createElement('div');
    costEl.className = 'card-cost';
    costEl.textContent = card.cost;
    cardEl.appendChild(costEl);
    
    // Name
    const nameEl = document.createElement('div');
    nameEl.className = 'card-name';
    nameEl.textContent = card.name;
    cardEl.appendChild(nameEl);
    
    // Stats (for units)
    if (card.type === 'UNIT' && card.atk !== undefined) {
        const statsEl = document.createElement('div');
        statsEl.className = 'card-stats';
        
        // Show actual stats (with buffs/debuffs) if different from base
        const atkDisplay = card.atk_buff ? `${card.atk_actual}<span style="color:${card.atk_buff > 0 ? '#4ade80' : '#e879f9'};font-size:9px;">${card.atk_buff > 0 ? '↑' : '↓'}</span>` : card.atk;
        const defDisplay = (card.def_buff !== 0 || card.wither_stacks) ? `${card.def_actual}<span style=\"color:${card.def_buff > 0 ? '#60a5fa' : '#e879f9'};font-size:9px;\">${card.def_buff > 0 ? '⬆' : '⬇'}</span>` : card.def;
        const spdDisplay = card.spd_buff ? `${card.spd_actual}<span style="color:#fbbf24;font-size:9px;">»</span>` : card.spd;
        
        statsEl.innerHTML = `
            <div class="stat">
                <div class="stat-label">ATK</div>
                <div class="stat-value atk">${atkDisplay}</div>
            </div>
            <div class="stat">
                <div class="stat-label">DEF</div>
                <div class="stat-value def">${defDisplay}</div>
            </div>
            <div class="stat">
                <div class="stat-label">SPD</div>
                <div class="stat-value spd">${spdDisplay}</div>
            </div>
        `;
        
        cardEl.appendChild(statsEl);
    }
    
    // Card Type Badge (for non-unit cards)
    if (card.type !== 'UNIT') {
        const badgeEl = document.createElement('div');
        badgeEl.className = `card-type-badge ${card.type.toLowerCase()}`;
        
        const badgeText = {
            'TRAP': 'TRAP',
            'TECHNIQUE': 'TECHNIQUE',
            'FIELD': 'FIELD'
        };
        
        badgeEl.textContent = badgeText[card.type] || card.type;
        cardEl.appendChild(badgeEl);
    }
    
    return cardEl;
}

// Render field
// Track previous field IDs for animation detection
let previousFieldIds = { your: null, opponent: null };

function renderField(player, field) {
    const slot = document.querySelector(`[data-zone="${player}-field"]`);
    const hadCard = slot.querySelector('.card') !== null;
    const oldFieldId = hadCard ? slot.querySelector('.card')?.dataset?.cardId : null;
    
    // Check if field was destroyed (had card, now no card)
    const wasDestroyed = hadCard && !field;
    
    if (wasDestroyed) {
        // Play destruction animation before clearing
        const cardToDestroy = slot.querySelector('.card');
        if (cardToDestroy) {
            cardToDestroy.classList.add('field-shattering');
            setTimeout(() => {
                slot.innerHTML = '<small>FIELD</small>';
                stopFieldEffects(player === 'your' ? 'your' : 'opponent');
            }, 600);
            return; // Don't continue - let animation finish
        }
    }
    
    slot.innerHTML = '';
    
    if (field) {
        const cardEl = createCardElement(field, false, true);
        cardEl.dataset.cardId = field.id; // Track field ID
        
        // Use slide-in animation for field cards (original smash deploy effect)
        if (!hadCard) {
            playSlideInAnimation(cardEl);
        }
        
        // Check if this is a NEW field or a REPLACEMENT for opponent (AI)
        if (player === 'opponent') {
            const previousFieldId = previousFieldIds.opponent;
            const isNewField = !previousFieldId;
            const isReplacement = previousFieldId && previousFieldId !== field.id;
            
            if (isNewField || isReplacement) {
                // Trigger field animation for opponent!
                setTimeout(() => {
                    playFieldAnimation(field.id, isReplacement, 'opponent');
                }, 100);
            }
        }
        
        slot.appendChild(cardEl);
        
        // Start field effects for BOTH players (always call to ensure background updates)
        const playerType = player === 'your' ? 'your' : 'opponent';
        startFieldEffects(field.id, playerType);
        
        // Update previous field ID
        previousFieldIds[player] = field.id;
    } else {
        slot.innerHTML = '<small>FIELD</small>';
        // No field - stop effects
        stopFieldEffects(player === 'your' ? 'your' : 'opponent');
        previousFieldIds[player] = null;
    }
}

// Render traps
function renderTraps(player, traps) {
    if (player === 'opponent') {
        // Show card backs for opponent traps
        for (let i = 0; i < 3; i++) {
            const slot = document.querySelector(`[data-zone="opponent-trap"][data-index="${i}"]`);
            const hadCard = slot.querySelector('.card') !== null;
            slot.innerHTML = '';
            
            if (i < traps) {
                const cardBack = document.createElement('div');
                cardBack.className = 'card card-back';
                
                const backImg = document.createElement('img');
                backImg.src = '/static/images/card-back.png';
                backImg.style.cssText = `
                    width: 90px;
            height: 145px;
                    border-radius: 8px;
                `;
                cardBack.appendChild(backImg);
                
                // Play animation for newly set traps
                if (!hadCard) {
                    playPlayAnimation(cardBack);
                }
                
                slot.appendChild(cardBack);
            } else {
                slot.innerHTML = '<small>TRAP</small>';
            }
        }
    } else {
        // Show actual traps for you
        for (let i = 0; i < 3; i++) {
            const slot = document.querySelector(`[data-zone="your-trap"][data-index="${i}"]`);
            const hadCard = slot.querySelector('.card') !== null;
            slot.innerHTML = '';
            
            if (traps[i]) {
                const cardEl = createCardElement(traps[i], false, true);
                
                // Play animation for newly set traps
                if (!hadCard) {
                    playPlayAnimation(cardEl);
                }
                
                slot.appendChild(cardEl);
            } else {
                slot.innerHTML = '<small>TRAP</small>';
            }
        }
    }
}

// Create card element
function createCardElement(card, clickable = false, showDetails = false) {
    if (!card) return null;
    
    const cardEl = document.createElement('div');
    cardEl.className = `card ${card.type.toLowerCase()}`;
    
    // Add exhausted styling with rotation
    if (card.is_exhausted) {
        cardEl.style.opacity = '0.6';
        cardEl.style.filter = 'grayscale(60%)';
        cardEl.style.transform = 'rotate(90deg)';
        cardEl.style.transition = 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.6s ease, filter 0.6s ease';
        cardEl.title = 'Exhausted - Cannot attack or retaliate';
    } else {
        cardEl.style.transform = 'rotate(0deg)';
        cardEl.style.transition = 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.6s ease, filter 0.6s ease';
    }
    
    // Add artwork image (80x80) - FIXED POSITION
    const artworkEl = document.createElement('img');
    artworkEl.src = `/static/images/cards/${card.id}.png`;
    artworkEl.onerror = () => {
        // Fallback: hide if image missing
        artworkEl.style.display = 'none';
    };
    artworkEl.style.cssText = `
        width: 80px;
        height: 80px;
        object-fit: cover;
        border-radius: 5px;
        margin-top: 1px;
        margin-bottom: 2px;
        border: 1px solid rgba(255,255,255,0.2);
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    `;
    cardEl.appendChild(artworkEl);
    
    // Add keyword icons for Units
    if (card.type === 'UNIT' && card.keywords && card.keywords.length > 0) {
        const iconsContainer = document.createElement('div');
        iconsContainer.className = 'keyword-icons';
        iconsContainer.style.cssText = `
            position: absolute;
            top: -20px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 3px;
            background: rgba(0,0,0,0.8);
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 14px;
            z-index: 10;
        `;
        
        const keywordIcons = {
            'Swift': '🏃',
            'Guard': '🛡️',
            'Pierce': '🎯',
            'Wither': '🥀',
            'Corrupt': '🦠',
            'Echo': '🔊',
            'Retreat': '↩️'
        };
        
        card.keywords.forEach(keyword => {
            if (keywordIcons[keyword]) {
                const icon = document.createElement('span');
                icon.textContent = keywordIcons[keyword];
                icon.title = keyword;
                icon.style.cursor = 'help';
                iconsContainer.appendChild(icon);
            }
        });
        
        if (iconsContainer.children.length > 0) {
            cardEl.appendChild(iconsContainer);
        }
    }
    
    // Add exhaustion icon if exhausted
    if (card.is_exhausted) {
        const exhaustIcon = document.createElement('div');
        exhaustIcon.className = 'exhaustion-icon';
        exhaustIcon.textContent = '💤';
        exhaustIcon.style.cssText = `
            position: absolute;
            top: -20px;
            left: -5px;
            font-size: 18px;
            z-index: 11;
            filter: drop-shadow(0 0 2px black);
        `;
        exhaustIcon.title = 'Exhausted';
        cardEl.appendChild(exhaustIcon);
    }
    
    
    // Add Wither indicator if unit has Wither stacks
    if (card.wither_stacks && card.wither_stacks > 0) {
        const witherIndicator = document.createElement('div');
        witherIndicator.innerHTML = `🥀 -${card.wither_stacks}`;
        witherIndicator.style.cssText = `
            position: absolute;
            bottom: 25px;
            left: 2px;
            background: rgba(139, 0, 139, 0.95);
            color: white;
            padding: 2px 5px;
            border-radius: 5px;
            font-size: 10px;
            font-weight: bold;
            z-index: 12;
        `;
        witherIndicator.title = `Wither: DEF reduced by ${card.wither_stacks}`;
        cardEl.appendChild(witherIndicator);
    }
    
    // Add Corrupt indicator if unit is corrupted
    if (card.is_corrupt) {
        const corruptIndicator = document.createElement('div');
        corruptIndicator.textContent = '🦠';
        corruptIndicator.style.cssText = `
            position: absolute;
            bottom: 25px;
            right: 2px;
            font-size: 20px;
            z-index: 12;
            filter: drop-shadow(0 0 3px rgba(0,255,0,0.8));
        `;
        corruptIndicator.title = 'Corrupted: Abilities disabled';
        cardEl.appendChild(corruptIndicator);
    }
    
    // Cost
    const costEl = document.createElement('div');
    costEl.className = 'card-cost';
    costEl.textContent = card.cost;
    cardEl.appendChild(costEl);
    
    // Name
    const nameEl = document.createElement('div');
    nameEl.className = 'card-name';
    nameEl.textContent = card.name;
    cardEl.appendChild(nameEl);
    
    // Stats (for units)
    if (card.type === 'UNIT' && card.atk !== undefined) {
        const statsEl = document.createElement('div');
        statsEl.className = 'card-stats';
        
        // Show actual stats (with buffs/debuffs) if different from base
        const atkDisplay = card.atk_buff ? `${card.atk_actual}<span style="color:${card.atk_buff > 0 ? '#4ade80' : '#e879f9'};font-size:9px;">${card.atk_buff > 0 ? '↑' : '↓'}</span>` : card.atk;
        const defDisplay = (card.def_buff !== 0 || card.wither_stacks) ? `${card.def_actual}<span style=\"color:${card.def_buff > 0 ? '#60a5fa' : '#e879f9'};font-size:9px;\">${card.def_buff > 0 ? '⬆' : '⬇'}</span>` : card.def;
        const spdDisplay = card.spd_buff ? `${card.spd_actual}<span style="color:#fbbf24;font-size:9px;">»</span>` : card.spd;
        
        statsEl.innerHTML = `
            <div class="stat">
                <div class="stat-label">ATK</div>
                <div class="stat-value atk">${atkDisplay}</div>
            </div>
            <div class="stat">
                <div class="stat-label">DEF</div>
                <div class="stat-value def">${defDisplay}</div>
            </div>
            <div class="stat">
                <div class="stat-label">SPD</div>
                <div class="stat-value spd">${spdDisplay}</div>
            </div>
        `;
        
        cardEl.appendChild(statsEl);
    }
    
    // Card Type Badge (for non-unit cards)
    if (card.type !== 'UNIT') {
        const badgeEl = document.createElement('div');
        badgeEl.className = `card-type-badge ${card.type.toLowerCase()}`;
        
        const badgeText = {
            'TRAP': 'TRAP',
            'TECHNIQUE': 'TECHNIQUE',
            'FIELD': 'FIELD'
        };
        
        badgeEl.textContent = badgeText[card.type] || card.type;
        cardEl.appendChild(badgeEl);
    }
    
    return cardEl;
}

// Toggle attack mode
function toggleAttackMode() {
    // Check if combat is allowed (not Turn 1)
    if (gameState.turn === 1) {
        addLog('❌ No attacks allowed on Turn 1! Combat begins Turn 2.');
        return;
    }
    
    if (gameState.phase !== 'combat') {
        addLog('❌ Not combat phase! Advance to combat phase first.');
        return;
    }
    
    attackMode = !attackMode;
    selectedAttacker = null;
    
    const btn = document.getElementById('attack-mode-btn');
    if (attackMode) {
        btn.textContent = 'Cancel Attack';
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-danger');
        addLog('⚔️ ATTACK MODE: Click your Unit, then click enemy Unit');
    } else {
        btn.textContent = 'Declare Attacks';
        btn.classList.remove('btn-danger');
        btn.classList.add('btn-secondary');
        addLog('Attack mode cancelled');
    }
    
    updateUI();
}

// Select attacking Unit
function selectAttacker(index) {
    selectedAttacker = index;
    const unit = gameState.you.battlefield[index];
    addLog(`Selected attacker: ${unit.name}`);
    addLog('Now click an enemy Unit to attack');
    updateUI();
}

// Declare attack
async function declareAttack(attackerIndex, defenderIndex) {
    if (!gameState || gameState.active_player !== 0) {
        addLog('❌ Not your turn!');
        return;
    }
    
    if (gameState.phase !== 'combat') {
        addLog('❌ Not combat phase! Click "End Phase" to advance.');
        return;
    }
    
    try {
        const response = await fetch(`/api/game/${gameId}/attack`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                player: 0,
                attacker_index: attackerIndex,
                defender_index: defenderIndex
            })
        });
        
        const data = await response.json();
        
        // ============================================================
        // PHASE 3B: CHECK FOR TRAP TRIGGER
        // ============================================================
        if (data.result.trap_trigger) {
            addLog(`🎭 ${data.result.trigger_message}`);
            
            // Store pending attack data
            pendingAttackData = data.result.pending_attack;
            
            // PHASE 3D: Store trigger data for trap effects
            pendingTriggerData = data.result.trigger_data;
            
            // Check who owns the trap
            // Player 0 = Human (you), Player 1 = AI
            const trapOwner = 1; // In this context, defender is always opponent (AI)
            
            if (trapOwner === 1) {
                // AI OWNS THE TRAP - Make automatic decision
                
                // AI Decision Logic:
                // - 80% chance to activate if can afford
                // - 20% chance to save/bluff
                const willActivate = Math.random() < 0.8;
                
                addLog(`🎭 AI considers activating ${data.result.trap.name}...`);
                
                if (willActivate) {
                    addLog(`✅ AI activates ${data.result.trap.name}!`);
                } else {
                    addLog(`❌ AI chooses not to activate ${data.result.trap.name}`);
                }
                
                // Wait a moment so player can read the message
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                // Send AI's decision to backend
                await handleTrapActivation(
                    data.result.trap,
                    data.result.trap_slot,
                    willActivate,
                    trapOwner
                );
                
                // After trap resolves, continue with attack
                // TODO: Phase 3D will handle continuing the attack
                return;
                
            } else {
                // HUMAN OWNS THE TRAP - Show prompt
                showTrapActivationPromptWithHandler(
                    data.result.trap,
                    data.result.trap_slot,
                    data.result.trigger_message,
                    trapOwner,
                    data.result.trigger_data  // Pass trigger data for target selection
                );
                return;
            }
        }
        
        if (data.result.error) {
            addLog(`❌ ${data.result.error}`);
        } else {
            // Get card elements for animation
            console.log('🎬 Looking for attacker at index:', attackerIndex);
            console.log('🎬 Looking for defender at index:', defenderIndex);
            
            const attackerEl = document.querySelector(`[data-zone="your-unit"][data-index="${attackerIndex}"] .card`);
            const defenderEl = document.querySelector(`[data-zone="opponent-unit"][data-index="${defenderIndex}"] .card`);
            
            console.log('🎬 Attacker element:', attackerEl);
            console.log('🎬 Defender element:', defenderEl);
            console.log('🎬 Combat log:', data.result.combat_log);
            
            // Play attack animation if elements exist
            if (attackerEl && defenderEl && data.result.combat_log) {
                // Extract damage from combat log
                // Look for "deals X damage" OR "is destroyed! (X ATK" OR "takes X damage"
                const combatText = data.result.combat_log.join(' ');
                let damage = 0;
                
                // Try different patterns
                const dealsMatch = combatText.match(/deals (\d+) damage/);
                const destroyedMatch = combatText.match(/\((\d+) ATK/);
                const takesMatch = combatText.match(/takes (\d+) damage/);
                
                if (dealsMatch) {
                    damage = parseInt(dealsMatch[1]);
                } else if (destroyedMatch) {
                    damage = parseInt(destroyedMatch[1]);
                } else if (takesMatch) {
                    damage = parseInt(takesMatch[1]);
                }
                
                console.log('🎬 Damage extracted:', damage);
                
                if (damage > 0) {
                    console.log('🎬 Playing attack animation!');
                    await playAttackAnimation(attackerEl, defenderEl, damage);
                } else {
                    console.log('❌ No damage, skipping animation');
                }
            } else {
                console.log('❌ Missing elements:', {
                    hasAttacker: !!attackerEl,
                    hasDefender: !!defenderEl,
                    hasCombatLog: !!data.result.combat_log
                });
            }
            
            // Show combat log
            data.result.combat_log.forEach(msg => addLog(`⚔️ ${msg}`));
            gameState = data.state;
            
            // Check if Pierce is available
            if (data.result.pierce_available && data.result.pierce_damage > 0) {
                // Enter Pierce mode
                pierceMode = true;
                pierceData = {
                    damage: data.result.pierce_damage,
                    defender_player: 1, // Opponent
                    attacker_player: data.result.attacker_player,
                    attacker_index: data.result.attacker_index
                };
                addLog(`🎯 Pierce! Select an enemy Unit to take ${pierceData.damage} overflow damage (or click "Skip Pierce")`);
                
                // Show skip button
                showSkipPierceButton();
            } else {
                // Reset attack mode
                attackMode = false;
                selectedAttacker = null;
                document.getElementById('attack-mode-btn').textContent = 'Declare Attacks';
                document.getElementById('attack-mode-btn').classList.remove('btn-danger');
                document.getElementById('attack-mode-btn').classList.add('btn-secondary');
            }
            
            updateUI();
        }
    } catch (error) {
        console.error('Error attacking:', error);
        addLog('Error declaring attack');
    }
}

// Select Pierce target
async function selectPierceTarget(targetIndex) {
    if (!pierceData) return;
    
    try {
        const response = await fetch(`/api/game/${gameId}/pierce`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                player: 0,
                defender_player: pierceData.defender_player,
                pierce_target_index: targetIndex,
                pierce_damage: pierceData.damage
            })
        });
        
        const data = await response.json();
        
        if (data.result.error) {
            addLog(`❌ ${data.result.error}`);
        } else {
            // Show Pierce log
            data.result.pierce_log.forEach(msg => addLog(msg));
            gameState = data.state;
            
            // Exit Pierce mode
            pierceMode = false;
            pierceData = null;
            hideSkipPierceButton();
            
            // Reset attack mode
            attackMode = false;
            selectedAttacker = null;
            document.getElementById('attack-mode-btn').textContent = 'Declare Attacks';
            document.getElementById('attack-mode-btn').classList.remove('btn-danger');
            document.getElementById('attack-mode-btn').classList.add('btn-secondary');
            
            updateUI();
        }
    } catch (error) {
        console.error('Error applying Pierce:', error);
        addLog('Error applying Pierce damage');
    }
}

// Skip Pierce damage
function skipPierce() {
    addLog('Pierce damage skipped');
    pierceMode = false;
    pierceData = null;
    hideSkipPierceButton();
    
    // Reset attack mode
    attackMode = false;
    selectedAttacker = null;
    document.getElementById('attack-mode-btn').textContent = 'Declare Attacks';
    document.getElementById('attack-mode-btn').classList.remove('btn-danger');
    document.getElementById('attack-mode-btn').classList.add('btn-secondary');
    
    updateUI();
}

// Show/hide Skip Pierce button
function showSkipPierceButton() {
    let btn = document.getElementById('skip-pierce-btn');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'skip-pierce-btn';
        btn.className = 'btn-secondary';
        btn.textContent = 'Skip Pierce';
        btn.addEventListener('click', skipPierce);
        document.querySelector('.controls').appendChild(btn);
    }
    btn.style.display = 'inline-block';
}

function hideSkipPierceButton() {
    const btn = document.getElementById('skip-pierce-btn');
    if (btn) {
        btn.style.display = 'none';
    }
}

// Select a card from hand (KEEPING OLD FUNCTION)
function selectCard(card, index) {
    console.log('🎯 selectCard called!', {card: card.name, index});
    selectedCard = {card, index};
    
    // Different message for traps (no cost to set)
    if (card.type === 'TRAP') {
        addLog(`Selected: ${card.name} - Click "Set Trap"`);
    } else {
        addLog(`Selected: ${card.name} - Click "Deploy/Play" to use`);
    }
    
    // Remove previous selection highlight
    console.log('Removing old selections...');
    document.querySelectorAll('.card.selected').forEach(el => {
        console.log('Found selected card, removing:', el);
        el.classList.remove('selected');
    });
    
    // Add selection highlight to clicked card
    const handEl = document.getElementById('your-hand');
    console.log('Hand element:', handEl);
    const cards = handEl.querySelectorAll('.card');
    console.log('Cards in hand:', cards.length);
    console.log('Trying to select card at index:', index);
    if (cards[index]) {
        console.log('✅ Adding selected class to card:', cards[index]);
        cards[index].classList.add('selected');
        console.log('Card classes after adding:', cards[index].className);
    } else {
        console.error('❌ Card not found at index:', index);
    }
    
    // Show deploy button (text changes based on card type)
    showDeployButton();
    
    // Highlight available slots based on card type (Traps, Units, Fields)
    highlightAvailableSlots();
    
    // DON'T call updateUI() here - it re-renders hand and removes the selected class!
}

// Show/hide deploy button
function showDeployButton() {
    let btn = document.getElementById('deploy-card-btn');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'deploy-card-btn';
        btn.className = 'btn-primary';
        btn.addEventListener('click', playSelectedCard);
        document.querySelector('.controls').insertBefore(btn, document.getElementById('attack-mode-btn'));
    }
    
    // Update button text based on card type
    if (selectedCard && selectedCard.card.type === 'TRAP') {
        btn.textContent = 'Set Trap';
        btn.style.background = 'linear-gradient(135deg, #2c2c2c 0%, #1a1a1a 100%)';
        btn.style.border = '2px solid #444';
    } else {
        btn.textContent = 'Deploy/Play Card';
        btn.style.background = '';
        btn.style.border = '';
    }
    
    btn.style.display = 'inline-block';
    
    // Add global click handler to deselect
    addDeselectHandler();
}

function hideDeployButton() {
    const btn = document.getElementById('deploy-card-btn');
    if (btn) {
        btn.style.display = 'none';
    }
    
    // Remove global click handler
    removeDeselectHandler();
}

// Global click handler to deselect card
let deselectHandler = null;

function addDeselectHandler() {
    if (deselectHandler) return; // Already added
    
    deselectHandler = (e) => {
        // Don't deselect if clicking on:
        // - Cards in hand (to select different card)
        // - Deploy button (to deploy)
        // - Attack/phase buttons
        // - Modal overlay
        
        if (e.target.closest('#your-hand')) return;
        if (e.target.closest('#deploy-card-btn')) return;
        if (e.target.closest('.controls')) return;
        if (e.target.closest('#card-modal')) return;
        
        // Deselect!
        deselectCard();
    };
    
    document.addEventListener('click', deselectHandler);
}

function removeDeselectHandler() {
    if (deselectHandler) {
        document.removeEventListener('click', deselectHandler);
        deselectHandler = null;
    }
}

function deselectCard() {
    console.log('🔄 Deselecting card');
    selectedCard = null;
    
    // Remove selection highlight
    document.querySelectorAll('.card.selected').forEach(el => {
        el.classList.remove('selected');
    });
    
    // Clear all slot highlights (traps, units, fields)
    highlightAvailableSlots();
    
    // Hide deploy button
    hideDeployButton();
    
    addLog('Selection cancelled');
}

// Play the selected card
async function playSelectedCard() {
    if (!selectedCard) return;
    
    try {
        const response = await fetch(`/api/game/${gameId}/play_card`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                player: 0,
                card_id: selectedCard.card.id
            })
        });
        
        const data = await response.json();
        
        if (data.result.error) {
            addLog(`❌ ${data.result.error}`);
        } else if (data.result.needs_target) {
            // Enter targeting mode
            targetingMode = true;
            targetingCard = {
                card: selectedCard.card, 
                card_id: selectedCard.card.id,
                target_type: data.result.target_type
            };
            addLog(`🎯 ${data.result.message}`);
            updateUI();
        } else if (data.result.deployment_trap_trigger) {
            // PHASE 3D BATCH 3: Deployment trap triggered (Lockdown, Miasma Potion)
            console.log('🎭 Deployment trap triggered!');
            console.log('   trap_owner:', data.result.trap_owner);
            console.log('   current turn:', gameState.active_player);
            
            addLog(`🎭 ${data.result.trap.name} triggered - ${data.result.trigger_message || 'Unit deployed!'}`);
            
            // Update state FIRST if included
            if (data.result.state) {
                console.log('✅ Updating state before showing deployment trap');
                gameState = data.result.state;
            } else {
                // Fallback for old code paths
                gameState = data.result.state || gameState;
            }
            
            // CRITICAL: Show trap prompt immediately!
            await handleTrapPrompt(
                data.result.trap_owner,
                data.result.trap_slot,
                data.result.trap,
                data.result.trigger_data,
                'deployment'
            );
            
            console.log('✅ Deployment trap handled');
        } else if (data.result.field_trap_trigger) {
            // PHASE 3D BATCH 3: Field trap triggered (Earthquake)
            console.log('🌍 Field trap triggered!');
            console.log('   trap:', data.result.trap.name);
            console.log('   state included?', !!data.result.state);
            
            addLog(`🎭 Trap triggered! ${data.result.trap.name}`);
            addLog(`💬 ${data.result.trigger_message}`);
            
            // CRITICAL: Update state FIRST so new field is visible before trap activates
            if (data.result.state) {
                console.log('✅ Updating state before showing trap');
                gameState = data.result.state;
                updateUI();
            } else {
                console.warn('⚠️ No state in field_trap_trigger response!');
            }
            
            // NOW show trap activation prompt
            await handleTrapPrompt(
                data.result.trap_owner,
                data.result.trap_slot,
                data.result.trap,
                data.result.trigger_data,
                'field'
            );
        } else if (data.result.technique_trap_trigger) {
            // PHASE 3D BATCH 3: Technique trap triggered (Foglash)
            addLog(`🎭 Trap triggered! ${data.result.trap.name}`);
            addLog(`💬 ${data.result.trigger_message}`);
            
            // Show trap activation prompt (will update UI after resolution)
            await handleTrapPrompt(
                data.result.trap_owner,
                data.result.trap_slot,
                data.result.trap,
                data.result.trigger_data,
                'technique',
                data.result.technique_in_limbo  // Pass technique card that's in limbo
            );
        } else {
            // Check what type of card was played
            const isField = selectedCard.card.type === 'FIELD';
            const isTechnique = selectedCard.card.type === 'TECHNIQUE';
            
            // Get card position for energy drain effect
            const handCards = document.querySelectorAll('#your-hand .card');
            const cardEl = handCards[selectedCard.index] || null;
            
            // Trigger energy drain effect if card costs energy
            if (cardEl && selectedCard.card.cost > 0) {
                const cardRect = cardEl.getBoundingClientRect();
                const cardX = cardRect.left + cardRect.width / 2;
                const cardY = cardRect.top + cardRect.height / 2;
                
                const energyCounter = document.getElementById('your-energy');
                const energyRect = energyCounter.getBoundingClientRect();
                const energyX = energyRect.left + energyRect.width / 2;
                const energyY = energyRect.top + energyRect.height / 2;
                
                playEnergyDrainEffect(cardX, cardY, energyX, energyY);
            }
            
            // Technique resolved - fly card to battlefield then fire particles!
            if (isTechnique) {
                await playTechniqueEffect(selectedCard.card.id, cardEl);
            }
            
            addLog(`✅ ${data.result.message}`);
            
            // FOR FIELDS: Handle animation BEFORE updateUI to preserve old card
            if (isField) {
                const wasReplacement = gameState.you.field && gameState.you.field.id !== selectedCard.card.id;
                const newFieldId = selectedCard.card.id;
                
                // Update state but DON'T call updateUI yet
                gameState = data.state;
                
                // Manually render the new field card (append without clearing)
                const fieldSlot = document.querySelector('[data-zone="your-field"]');
                const oldCard = fieldSlot.querySelector('.card');
                
                if (wasReplacement && oldCard) {
                    // Add new card alongside old (hidden initially)
                    const newCardEl = createCardElement(gameState.you.field, false, true);
                    newCardEl.dataset.cardId = newFieldId;
                    newCardEl.style.opacity = '0';
                    fieldSlot.appendChild(newCardEl);
                }
                
                // Play animation (will shatter old, reveal new)
                await playFieldAnimation(newFieldId, wasReplacement);
                
                // NOW update full UI
                updateUI();
            } else {
                // Not a field - normal flow
                gameState = data.state;
                updateUI();
            }
        }
        
        selectedCard = null;
        hideDeployButton();
        
        // Remove selection highlight
        document.querySelectorAll('.card.selected').forEach(el => {
            el.classList.remove('selected');
        });
        
        // Clear all slot highlights (traps, units, fields)
        highlightAvailableSlots();
    } catch (error) {
        console.error('Error playing card:', error);
        addLog('Error playing card');
    }
}

// Apply targeted technique
async function applyTargetedTechnique(targetPlayer, targetIndex) {
    if (!targetingCard) return;
    
    try {
        const response = await fetch(`/api/game/${gameId}/target_technique`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                player: 0,
                card_id: targetingCard.card_id,
                target_player: targetPlayer,
                target_index: targetIndex
            })
        });
        
        const data = await response.json();
        
        if (data.result.error) {
            addLog(`❌ ${data.result.error}`);
        } else {
            // Fly card to battlefield then fire particles!
            const handCards = document.querySelectorAll('#your-hand .card');
            await playTechniqueEffect(targetingCard.card_id, handCards[0] || null);
            addLog(`✅ ${data.result.message}`);
            gameState = data.state;
        }
        
        // Exit targeting mode
        targetingMode = false;
        targetingCard = null;
        updateUI();
    } catch (error) {
        console.error('Error applying technique:', error);
        addLog('Error applying technique');
    }
}

// End phase / advance phase
async function advancePhase() {
    console.log('📞 advancePhase called - Current:', {
        phase: gameState?.phase,
        active_player: gameState?.active_player,
        aiTurnInProgress: aiTurnInProgress
    });
    
    try {
        const response = await fetch(`/api/game/${gameId}/advance_phase`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({player: 0})
        });
        
        const data = await response.json();
        
        // PHASE 3D BATCH 3: Check for trap triggers based on trap_type
        
        // Flute of Slumber (ready trap)
        if (data.trap_type === 'ready_trap_trigger' || data.ready_trap_trigger) {
            addLog(`🎭 ${data.trigger_message}`);
            
            // Update state FIRST (before showing modal)
            gameState = data.state;
            
            // Handle trap prompt (this will update UI after resolution)
            await handleTrapPrompt(
                data.trap_owner,
                data.trap_slot,
                data.trap,
                data.trigger_data,
                'ready'
            );
            
            // CRITICAL: Check if AI turn needs to start after trap resolves
            // Ready traps can trigger at start of AI's turn, and we need to start aiTurn()
            if (gameState.active_player === 1 && !aiTurnInProgress) {
                console.log('🤖 Ready trap resolved - starting AI turn');
                setTimeout(aiTurn, 1000);
            }
            
            return;
        }
        
        // Lockdown, Miasma Potion (deployment traps)
        if (data.trap_type === 'deployment_trap_trigger' || data.deployment_trap_trigger) {
            addLog(`🎭 ${data.trigger_message}`);
            
            // Update state FIRST
            gameState = data.state;
            
            // Handle trap prompt
            await handleTrapPrompt(
                data.trap_owner,
                data.trap_slot,
                data.trap,
                data.trigger_data,
                'deployment'
            );
            
            // Don't call updateUI here - handleTrapPrompt will do it
            return;
        }
        
        // Earthquake (field trap)
        if (data.trap_type === 'field_trap_trigger' || data.field_trap_trigger) {
            addLog(`🎭 ${data.trigger_message}`);
            
            // Update state FIRST
            gameState = data.state;
            
            // Handle trap prompt
            await handleTrapPrompt(
                data.trap_owner,
                data.trap_slot,
                data.trap,
                data.trigger_data,
                'field'
            );
            
            // Don't call updateUI here - handleTrapPrompt will do it
            return;
        }
        
        // Foglash (technique trap)
        if (data.trap_type === 'technique_trap_trigger' || data.technique_trap_trigger) {
            addLog(`🎭 ${data.trigger_message}`);
            
            // Update state FIRST
            gameState = data.state;
            
            // Handle trap prompt
            await handleTrapPrompt(
                data.trap_owner,
                data.trap_slot,
                data.trap,
                data.trigger_data,
                'technique',
                data.technique_in_limbo
            );
            
            // Don't call updateUI here - handleTrapPrompt will do it
            return;
        }
        
        // Counter-Sigil
        if (data.counter_sigil_trigger) {
            addLog(`🎭 ${data.trigger_message}`);
            
            // Update state FIRST
            gameState = data.state;
            
            // Handle Counter-Sigil prompt (this will update UI after resolution)
            await handleCounterSigilPrompt(
                data.trap_owner,
                data.trap_slot,
                data.trap,
                data.trigger_data,
                data.original_trap_activation
            );
            
            // Don't call updateUI here
            return;
        }
        
        // ATTACK TRAPS (Decoy Protocol, etc.) during AI turn
        if (data.trap_type === 'attack_trap_trigger' || data.attack_trap_trigger) {
            console.log('⚔️ ATTACK TRAP TRIGGERED during AI turn!');
            console.log('   trap:', data.trap);
            console.log('   trap_owner:', data.trap_owner);
            console.log('   trap_slot:', data.trap_slot);
            console.log('   trigger_data:', data.trigger_data);
            console.log('   pending_attack:', data.pending_attack);
            
            addLog(`🎭 ${data.trigger_message}`);
            
            // Update state FIRST
            gameState = data.state;
            
            // Store pending attack data globally so continueAttack can access it
            if (data.pending_attack) {
                pendingAttackData = data.pending_attack;
                console.log('💾 Stored pending attack data:', pendingAttackData);
            } else {
                console.warn('⚠️ No pending_attack data in response!');
            }
            
            console.log('📞 Calling handleTrapPrompt for attack trap...');
            
            // Handle trap prompt (attack traps work like deployment traps)
            await handleTrapPrompt(
                data.trap_owner,
                data.trap_slot,
                data.trap,
                data.trigger_data,
                'attack'
            );
            
            console.log('✅ handleTrapPrompt completed for attack trap');
            
            // Don't call updateUI here - handleTrapPrompt will do it
            return;
        }
        
        // Normal phase advancement - extract state from response
        console.log('📦 Raw advance_phase response:', data);
        
        // Check for AI combat logs and trigger animations
        if (data.combat_log && Array.isArray(data.combat_log) && data.combat_log.length > 0) {
            console.log('⚔️ ========================================');
            console.log('⚔️ COMBAT DETECTED IN AI TURN!');
            console.log('⚔️ Number of messages:', data.combat_log.length);
            console.log('⚔️ Active player:', gameState?.active_player);
            console.log('⚔️ ========================================');
            
            // Print each message for debugging
            data.combat_log.forEach((msg, i) => {
                console.log(`⚔️ [${i}] "${msg}"`);
            });
            
            // Try to parse combat info from logs
            // Example: "Scrap Golem (slot 0) attacks Ore Hauler (slot 1) - deals 2 damage"
            data.combat_log.forEach(async (logMsg, index) => {
                console.log(`🔍 Parsing message ${index}: "${logMsg}"`);
                
                const attackMatch = logMsg.match(/\(slot (\d+)\) attacks .* \(slot (\d+)\)/);
                const damageMatch = logMsg.match(/(\d+) damage/);
                
                console.log('  Attack match:', attackMatch);
                console.log('  Damage match:', damageMatch);
                
                if (attackMatch && damageMatch) {
                    const attackerIndex = parseInt(attackMatch[1]);
                    const defenderIndex = parseInt(attackMatch[2]);
                    const damage = parseInt(damageMatch[1]);
                    
                    console.log(`  ✅ MATCHED! Attacker: ${attackerIndex}, Defender: ${defenderIndex}, Damage: ${damage}`);
                    
                    // Determine zones based on active player
                    const attackerZone = gameState.active_player === 1 ? 'opponent-unit' : 'your-unit';
                    const defenderZone = gameState.active_player === 1 ? 'your-unit' : 'opponent-unit';
                    
                    console.log(`  Zones: Attacker="${attackerZone}", Defender="${defenderZone}"`);
                    
                    // Wait a bit for UI to update
                    await new Promise(resolve => setTimeout(resolve, 200));
                    
                    const attackerEl = document.querySelector(`[data-zone="${attackerZone}"][data-index="${attackerIndex}"] .card`);
                    const defenderEl = document.querySelector(`[data-zone="${defenderZone}"][data-index="${defenderIndex}"] .card`);
                    
                    console.log('  Attacker element:', attackerEl);
                    console.log('  Defender element:', defenderEl);
                    
                    if (attackerEl && defenderEl && damage > 0) {
                        console.log('  🎬 PLAYING AI COMBAT ANIMATION!');
                        await playCombatAnimation(attackerEl, defenderEl, damage);
                        showDamageNumber(damage, defenderEl);
                    } else {
                        console.log('  ❌ Missing elements or zero damage - skipping animation');
                    }
                } else {
                    console.log('  ⚠️ No match - not an attack message');
                }
                
                // Add to log
                addLog(`⚔️ ${logMsg}`);
            });
        }
        
        gameState = data.state || data;
        
        // Validate state before updating UI
        if (!gameState || !gameState.phase || !gameState.you || !gameState.opponent) {
            console.error('❌ CRITICAL: Invalid state received from advance_phase!');
            console.error('   Received data:', data);
            console.error('   Extracted gameState:', gameState);
            const errorMsg = '❌ Game state error - server returned invalid data';
            addLog(errorMsg);
            throw new Error(errorMsg);  // ← THROW ERROR so aiTurn catches it!
        }
        
        console.log('✅ State validated successfully');
        console.log('   Phase:', gameState.phase, 'Active player:', gameState.active_player);
        
        updateUI();
        
        // Clear all slot highlights when ending turn (traps, units, fields)
        highlightAvailableSlots();
        
        // CRITICAL: Start AI turn if it's now the AI's turn
        // The aiTurn() loop handles the turn, but we need to START it!
        if (gameState.active_player === 1 && !aiTurnInProgress) {
            console.log('🤖 Turn switched to AI - starting AI turn');
            setTimeout(aiTurn, 1000);
        } else if (gameState.active_player === 1 && aiTurnInProgress) {
            console.log('⏸️ AI turn already in progress - not starting duplicate');
        }
        
    } catch (error) {
        console.error('❌ Error advancing phase:', error);
        addLog('❌ Error advancing game - check console');
        throw error;  // Re-throw so aiTurn can catch it and break the loop
    }
}

// Track if a trap modal is currently active
let trapModalActive = false;
let aiTurnInProgress = false;  // Prevent multiple simultaneous AI turns
let aiTurnHasCriticalError = false;  // Prevent restarting after critical failure

// Simple AI opponent
async function aiTurn() {
    // Don't restart if there was a critical error
    if (aiTurnHasCriticalError) {
        console.error('🚫 AI turn blocked - critical error occurred previously');
        console.error('   Please refresh the page to restart the game');
        return;
    }
    
    // Prevent multiple AI turns from running simultaneously
    if (aiTurnInProgress) {
        console.warn('⚠️ AI turn already in progress - skipping duplicate call');
        return;
    }
    
    console.log('🤖 AI TURN START - gameState.active_player:', gameState?.active_player);
    console.log('   Current phase:', gameState?.phase);
    console.log('   Current turn:', gameState?.turn);
    aiTurnInProgress = true;
    
    let iterations = 0;
    const MAX_ITERATIONS = 20;  // Safety limit to prevent infinite loops
    let lastPhase = gameState.phase;
    let phaseChanges = 0;
    
    try {
        while (gameState.active_player === 1 && !gameState.winner) {
            // Safety check: prevent infinite loops
            iterations++;
            
            // Track phase changes
            if (gameState.phase !== lastPhase) {
                phaseChanges++;
                console.log(`📊 Phase changed: ${lastPhase} → ${gameState.phase} (change #${phaseChanges})`);
                lastPhase = gameState.phase;
            }
            
            console.log(`🔄 AI turn iteration ${iterations}/${MAX_ITERATIONS} - Phase: ${gameState.phase}, Active: ${gameState.active_player}`);
            
            if (iterations > MAX_ITERATIONS) {
                console.error('🚨 CRITICAL: AI turn exceeded maximum iterations!');
                console.error('Final state:', {
                    phase: gameState.phase,
                    active_player: gameState.active_player,
                    turn: gameState.turn,
                    total_iterations: iterations,
                    phase_changes: phaseChanges,
                    last_phase: lastPhase
                });
                console.error('This indicates the game is stuck in an invalid state');
                console.error('Possible causes:');
                console.error('  - Trap not being cleared properly');
                console.error('  - Phase not advancing');
                console.error('  - State not updating between iterations');
                addLog('🚨 CRITICAL ERROR: AI turn stuck - game cannot continue');
                addLog(`Phase: ${gameState.phase}, Iterations: ${iterations}, Phase changes: ${phaseChanges}`);
                addLog('Please refresh the page to start a new game');
                aiTurnHasCriticalError = true;  // Block future AI turns
                break;
            }
            
            await new Promise(resolve => setTimeout(resolve, 800));
            
            // Don't advance if a trap modal is currently being shown
            if (trapModalActive) {
                console.log('⏸️ AI turn paused - trap modal active');
                break;
            }
            
            console.log(`📞 Calling advancePhase (iteration ${iterations})...`);
            
            try {
                await advancePhase();
                console.log(`✅ advancePhase completed (iteration ${iterations})`);
                console.log('   New state:', {
                    phase: gameState?.phase,
                    active_player: gameState?.active_player
                });
            } catch (error) {
                console.error(`❌ CRITICAL: Error in advancePhase (iteration ${iterations}):`, error);
                console.error('Stack trace:', error.stack);
                addLog('🚨 CRITICAL ERROR: Game state corrupted');
                addLog('Please refresh the page to start a new game');
                aiTurnHasCriticalError = true;  // Block future AI turns
                break;
            }
            
            if (gameState.winner !== null) {
                console.log('🏆 Game has winner - exiting AI turn');
                break;
            }
        }
        
        console.log('🤖 AI TURN END - Final active_player:', gameState?.active_player);
    } finally {
        aiTurnInProgress = false;
        console.log('🔓 AI turn lock released');
    }
}

// Add log entry
function addLog(message) {
    const logEl = document.getElementById('game-log');
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = `• ${message}`;
    entry.setAttribute('data-log', message);
    logEl.appendChild(entry);
    logEl.scrollTop = logEl.scrollHeight;
}

// Show win modal
function showWinModal(youWon) {
    const modal = document.getElementById('win-modal');
    const message = document.getElementById('win-message');
    
    if (youWon) {
        message.textContent = '🎉 Victory! You Win! 🎉';
    } else {
        message.textContent = '💀 Defeat! You Lose! 💀';
    }
    
    modal.classList.add('active');
}

// Utility
function capitalizeFirst(str) {
    if (!str) return '';  // Safety check for undefined/null
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Event listeners
document.getElementById('end-phase-btn').addEventListener('click', advancePhase);
document.getElementById('attack-mode-btn').addEventListener('click', toggleAttackMode);
document.getElementById('new-game-btn').addEventListener('click', () => location.reload());

// Show full card modal
function showCardModal(card) {
    if (cardModalOpen) return;
    cardModalOpen = true;
    
    const modal = document.createElement('div');
    modal.id = 'card-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        cursor: pointer;
    `;
    
    const cardImg = document.createElement('img');
    cardImg.src = `/static/images/cards-full/${card.id}.png`;
    cardImg.onerror = () => {
        // Fallback if image doesn't exist
        cardImg.src = '/static/images/card-back.png';
    };
    cardImg.style.cssText = `
        max-width: 90%;
        max-height: 90%;
        border-radius: 15px;
        box-shadow: 0 10px 50px rgba(0,0,0,0.8);
    `;
    
    modal.appendChild(cardImg);
    modal.addEventListener('click', closeCardModal);
    document.body.appendChild(modal);
}

// Close card modal
function closeCardModal() {
    const modal = document.getElementById('card-modal');
    if (modal) {
        modal.remove();
        cardModalOpen = false;
    }
}

// Add ESC key listener
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && cardModalOpen) {
        closeCardModal();
    }
});

// Start game on load
window.addEventListener('load', initGame);

// Show full card modal
function showCardModal(card) {
    if (cardModalOpen) return;
    cardModalOpen = true;
    
    const modal = document.createElement('div');
    modal.id = 'card-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        cursor: pointer;
    `;
    
    const cardImg = document.createElement('img');
    cardImg.src = `/static/images/cards-full/${card.id}.png`;
    cardImg.onerror = () => {
        // Fallback if image doesn't exist
        cardImg.src = '/static/images/card-back.png';
    };
    cardImg.style.cssText = `
        max-width: 90%;
        max-height: 90%;
        border-radius: 15px;
        box-shadow: 0 10px 50px rgba(0,0,0,0.8);
    `;
    
    modal.appendChild(cardImg);
    modal.addEventListener('click', closeCardModal);
    document.body.appendChild(modal);
}

// Close card modal
function closeCardModal() {
    const modal = document.getElementById('card-modal');
    if (modal) {
        modal.remove();
        cardModalOpen = false;
    }
}

// Add ESC key listener
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && cardModalOpen) {
        closeCardModal();
    }
});

// Discard card (hand limit)
async function discardCard(cardIndex) {
    try {
        const response = await fetch(`/api/game/${gameId}/discard`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({card_index: cardIndex, player: 0})
        });
        
        const data = await response.json();
        if (data.error) {
            addLog(`❌ ${data.error}`);
            return;
        }
        
        gameState = data;
        updateUI();
    } catch (error) {
        console.error('Discard error:', error);
        addLog('❌ Failed to discard card');
    }
}

// Show discard confirmation modal
function showDiscardModal(card, cardIndex) {
    const modal = document.createElement('div');
    modal.id = 'discard-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: fadeIn 0.2s ease;
    `;
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: linear-gradient(145deg, #2a2a2a, #1a1a1a);
        border: 3px solid #ff6b6b;
        border-radius: 15px;
        padding: 30px;
        max-width: 400px;
        text-align: center;
        box-shadow: 
            0 10px 40px rgba(0, 0, 0, 0.5),
            0 0 30px rgba(255, 107, 107, 0.3);
        animation: slideIn 0.3s ease;
    `;
    
    modalContent.innerHTML = `
        <h2 style="color: #ff6b6b; margin: 0 0 15px 0; font-size: 24px;">
            ⚠️ Discard Card?
        </h2>
        <div style="
            background: rgba(0, 0, 0, 0.4);
            padding: 15px;
            border-radius: 8px;
            margin: 15px 0;
            border: 2px solid rgba(255, 107, 107, 0.3);
        ">
            <p style="margin: 0; font-size: 18px; font-weight: bold; color: #fff;">
                ${card.name}
            </p>
            <p style="margin: 5px 0 0 0; font-size: 14px; color: #aaa;">
                ${card.type}
            </p>
        </div>
        <p style="color: #ccc; margin: 15px 0; font-size: 14px;">
            This card will be sent to your discard pile.
        </p>
        <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">
            <button id="discard-confirm" style="
                padding: 12px 30px;
                font-size: 16px;
                font-weight: bold;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                background: linear-gradient(145deg, #ff6b6b, #ff5252);
                color: white;
                box-shadow: 0 4px 12px rgba(255, 107, 107, 0.4);
                transition: all 0.2s;
            ">
                Discard
            </button>
            <button id="discard-cancel" style="
                padding: 12px 30px;
                font-size: 16px;
                font-weight: bold;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                background: linear-gradient(145deg, #444, #333);
                color: white;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                transition: all 0.2s;
            ">
                Cancel
            </button>
        </div>
    `;
    
    // Add hover effects
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes slideIn {
            from { transform: translateY(-50px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        #discard-confirm:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(255, 107, 107, 0.6);
        }
        #discard-cancel:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5);
        }
    `;
    document.head.appendChild(style);
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Button handlers
    document.getElementById('discard-confirm').addEventListener('click', () => {
        modal.remove();
        style.remove();
        discardCard(cardIndex);
    });
    
    document.getElementById('discard-cancel').addEventListener('click', () => {
        modal.remove();
        style.remove();
    });
    
    // Click outside to cancel
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
            style.remove();
        }
    });
    
    // ESC to cancel
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            style.remove();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

// Show discard confirmation modal
let pendingDiscardIndex = null;

// Show damage number animation
function showDamageNumber(damage, targetElement) {
    const rect = targetElement.getBoundingClientRect();
    const damageEl = document.createElement('div');
    damageEl.className = 'damage-number';
    damageEl.textContent = `-${damage}`;
    damageEl.style.left = `${rect.left + rect.width / 2}px`;
    damageEl.style.top = `${rect.top}px`;
    
    document.body.appendChild(damageEl);
    
    // Remove after animation
    setTimeout(() => damageEl.remove(), 1000);
}

// Trigger attack animation
function playAttackAnimation(attackerElement, defenderElement, damage) {
    return new Promise(async (resolve) => {
        // Play complete combat animation sequence
        await playCombatAnimation(attackerElement, defenderElement, damage);
        
        // Show damage number
        showDamageNumber(damage, defenderElement);
        
        // Wait a bit before resolving
        setTimeout(resolve, 300);
    });
}

// Trigger card slide-in animation
function playSlideInAnimation(cardElement) {
    cardElement.classList.add('slide-in');
    setTimeout(() => {
        cardElement.classList.remove('slide-in');
    }, 600);
}

/* ============================================
   PHASE 1 ANIMATIONS
   ============================================ */

// Draw Animation - Card flies from deck to hand
function playDrawAnimation(cardElement) {
    cardElement.classList.add('drawing');
    setTimeout(() => {
        cardElement.classList.remove('drawing');
    }, 500);
}

// Play Animation - Card zooms to battlefield
function playPlayAnimation(cardElement) {
    cardElement.classList.add('playing');
    setTimeout(() => {
        cardElement.classList.remove('playing');
    }, 400);
}

// Destroy Animation - Card explodes/fades with particles
function playDestroyAnimation(cardElement, callback) {
    const rect = cardElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Create explosion particles - MORE PARTICLES!
    const particleCount = 20;
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'destroy-particle';
        
        // Random explosion direction
        const angle = (Math.PI * 2 * i) / particleCount;
        const distance = 60 + Math.random() * 50;
        const tx = Math.cos(angle) * distance;
        const ty = Math.sin(angle) * distance;
        
        particle.style.left = centerX + 'px';
        particle.style.top = centerY + 'px';
        particle.style.setProperty('--tx', tx + 'px');
        particle.style.setProperty('--ty', ty + 'px');
        
        // Random particle size for variety
        const size = 10 + Math.random() * 6;
        particle.style.width = size + 'px';
        particle.style.height = size + 'px';
        
        document.body.appendChild(particle);
        
        // Remove particle after animation
        setTimeout(() => particle.remove(), 600);
    }
    
    // Animate the card itself
    cardElement.classList.add('destroying');
    setTimeout(() => {
        if (callback) callback();
    }, 500);
}

/* ============================================
   PHASE 2 COMBAT ANIMATIONS
   ============================================ */

// Attack Lunge - Attacker card lunges forward
function playAttackLunge(attackerElement) {
    attackerElement.classList.add('lunging');
    setTimeout(() => {
        attackerElement.classList.remove('lunging');
    }, 800); // was 500, now 800ms to match CSS animation
}

// FF12-Style Attack Line - Energy beam from attacker to defender
async function playAttackLine(attackerElement, defenderElement) {
    const attackerRect = attackerElement.getBoundingClientRect();
    const defenderRect = defenderElement.getBoundingClientRect();
    
    const startX = attackerRect.left + attackerRect.width / 2;
    const startY = attackerRect.top + attackerRect.height / 2;
    const endX = defenderRect.left + defenderRect.width / 2;
    const endY = defenderRect.top + defenderRect.height / 2;
    
    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    
    // Create attack line
    const line = document.createElement('div');
    line.className = 'attack-line';
    line.style.left = startX + 'px';
    line.style.top = startY + 'px';
    line.style.width = '0px';
    line.style.transform = `rotate(${angle}deg)`;
    
    document.body.appendChild(line);
    
    // Animate line drawing - SLOWER!
    let lineWidth = 0;
    const lineDrawSpeed = distance / 400; // Slower: was 200, now 400ms
    const lineDrawInterval = setInterval(() => {
        lineWidth += lineDrawSpeed * 16; // ~60fps
        if (lineWidth >= distance) {
            lineWidth = distance;
            clearInterval(lineDrawInterval);
        }
        line.style.width = lineWidth + 'px';
    }, 16);
    
    // Create energy pulse
    const pulse = document.createElement('div');
    pulse.className = 'energy-pulse';
    line.appendChild(pulse);
    
    // Animate pulse traveling - SLOWER!
    let pulsePos = 0;
    const pulseSpeed = distance / 600; // Slower: was 300, now 600ms
    const pulseInterval = setInterval(() => {
        pulsePos += pulseSpeed * 16;
        if (pulsePos >= distance) {
            clearInterval(pulseInterval);
            // Remove line and pulse after impact - KEEP IT LONGER!
            setTimeout(() => line.remove(), 200); // was 100, now 200ms
        }
        pulse.style.left = pulsePos + 'px';
    }, 16);
    
    // Wait for pulse to reach target - LONGER!
    await new Promise(resolve => setTimeout(resolve, 600)); // was 300, now 600ms
}

// Hit Particle Burst - Explosion when attack hits
function playHitBurst(defenderElement) {
    const rect = defenderElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const particleCount = 12;
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'hit-particle';
        
        const angle = (Math.PI * 2 * i) / particleCount;
        const distance = 40 + Math.random() * 30;
        const tx = Math.cos(angle) * distance;
        const ty = Math.sin(angle) * distance;
        
        particle.style.left = centerX + 'px';
        particle.style.top = centerY + 'px';
        particle.style.setProperty('--tx', tx + 'px');
        particle.style.setProperty('--ty', ty + 'px');
        
        document.body.appendChild(particle);
        setTimeout(() => particle.remove(), 600); // was 400, now 600ms
    }
}

// Screen Shake - Impact effect
function playScreenShake() {
    const gameContainer = document.getElementById('game-container');
    gameContainer.classList.add('shake');
    setTimeout(() => {
        gameContainer.classList.remove('shake');
    }, 600); // was 400, now 600ms
}

// Hit Flash - Defender flashes when hit
function playHitFlash(defenderElement) {
    defenderElement.classList.add('hit-flash');
    setTimeout(() => {
        defenderElement.classList.remove('hit-flash');
    }, 500); // was 300, now 500ms
}

// Complete Combat Animation - Combines all effects
async function playCombatAnimation(attackerElement, defenderElement, damage) {
    // 1. Attacker lunges - LONGER!
    playAttackLunge(attackerElement);
    await new Promise(resolve => setTimeout(resolve, 400)); // was 200, now 400ms
    
    // 2. Attack line with energy pulse - SLOWER!
    await playAttackLine(attackerElement, defenderElement);
    
    // 3. Impact effects (all at once)
    playHitBurst(defenderElement);
    playHitFlash(defenderElement);
    playScreenShake();
    
    // 4. Wait a bit longer to appreciate the impact
    await new Promise(resolve => setTimeout(resolve, 200)); // Extra time to see impact
}

// Energy Drain Effect - When spending energy
function playEnergyDrainEffect(fromX, fromY, toX, toY) {
    const particleCount = 5;
    
    for (let i = 0; i < particleCount; i++) {
        setTimeout(() => {
            const particle = document.createElement('div');
            particle.className = 'energy-drain';
            
            const tx = toX - fromX;
            const ty = toY - fromY;
            
            particle.style.left = fromX + 'px';
            particle.style.top = fromY + 'px';
            particle.style.setProperty('--tx', tx + 'px');
            particle.style.setProperty('--ty', ty + 'px');
            
            document.body.appendChild(particle);
            setTimeout(() => particle.remove(), 800);
        }, i * 100);
    }
}

// Exhaust Sparkle Effect - When card becomes exhausted
function playExhaustSparkle(cardElement) {
    const rect = cardElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Create glowing aura around card
    const glow = document.createElement('div');
    glow.className = 'exhaust-glow';
    glow.style.left = centerX + 'px';
    glow.style.top = centerY + 'px';
    document.body.appendChild(glow);
    setTimeout(() => glow.remove(), 1000);
    
    // Create sparkle particles - MORE and SLOWER!
    const particleCount = 16; // was 8, now 16!
    for (let i = 0; i < particleCount; i++) {
        setTimeout(() => {
            const particle = document.createElement('div');
            particle.className = 'exhaust-sparkle';
            
            const angle = (Math.PI * 2 * i) / particleCount;
            const distance = 40 + Math.random() * 30; // Slightly larger spread
            const tx = Math.cos(angle) * distance;
            const ty = Math.sin(angle) * distance;
            
            particle.style.left = centerX + 'px';
            particle.style.top = centerY + 'px';
            particle.style.setProperty('--tx', tx + 'px');
            particle.style.setProperty('--ty', ty + 'px');
            
            document.body.appendChild(particle);
            setTimeout(() => particle.remove(), 1200); // was 800, now 1200ms - slower!
        }, i * 40); // Staggered by 40ms for wave effect
    }
}

// Show deck selection modal on page load
document.addEventListener('DOMContentLoaded', () => {
    const deckModal = document.getElementById('deck-selection-modal');
    const skyforgeBtn = document.getElementById('deck-skyforge-btn');
    const miasmaBtn = document.getElementById('deck-miasma-btn');
    
    // Show deck selection immediately instead of auto-starting
    if (deckModal) {
        deckModal.classList.add('active');
    }
    
    // Skyforge selected
    if (skyforgeBtn) {
        skyforgeBtn.addEventListener('click', () => {
            deckModal.classList.remove('active');
            startGameWithFaction('skyforge');
        });
    }
    
    // Miasma selected
    if (miasmaBtn) {
        miasmaBtn.addEventListener('click', () => {
            deckModal.classList.remove('active');
            startGameWithFaction('miasma');
        });
    }
});

// Start game with selected faction
async function startGameWithFaction(playerFaction) {
    const opponentFaction = playerFaction === 'skyforge' ? 'miasma' : 'skyforge';
    
    console.log(`Starting: You (${playerFaction}) vs AI (${opponentFaction})`);
    
    try {
        const response = await fetch('/api/game/new', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                player_faction: playerFaction,
                opponent_faction: opponentFaction
            })
        });
        
        const data = await response.json();
        gameId = data.game_id;
        console.log('✅ Game created:', gameId);
        
        // Now fetch game state
        const stateResponse = await fetch(`/api/game/${gameId}/state?player=0`);
        const stateData = await stateResponse.json();
        gameState = stateData;
        
        updateUI();
        addLog(`Game started! You are playing ${playerFaction.charAt(0).toUpperCase() + playerFaction.slice(1)} vs ${opponentFaction.charAt(0).toUpperCase() + opponentFaction.slice(1)} AI`);
        
    } catch (error) {
        console.error('Failed to create game:', error);
        addLog('❌ Failed to create game');
    }
}

// Show deck selection modal (used by New Game button too)
function showDeckSelection() {
    const deckModal = document.getElementById('deck-selection-modal');
    if (deckModal) {
        deckModal.classList.add('active');
    }
}

// ============================================================
// PARTICLE EFFECT SYSTEM
// ============================================================

// Particle configs per technique type
const TECHNIQUE_PARTICLES = {
    // ⚙️ SKYFORGE TECHNIQUES
    'skyforge_software_update':   { color: '#4a90e2', shape: '⚙️', count: 12, spread: 120, type: 'sparkle' },
    'skyforge_velocity_patch':    { color: '#00d4ff', shape: '⚡', count: 15, spread: 150, type: 'electric' },
    'skyforge_override':          { color: '#ff9500', shape: '⚡', count: 20, spread: 160, type: 'electric' },
    'skyforge_reboot':            { color: '#ffffff', shape: '✨', count: 25, spread: 200, type: 'burst' },

    // 💀 MIASMA TECHNIQUES
    'miasma_encroaching_fog':     { color: '#8b4789', shape: '💨', count: 20, spread: 200, type: 'fog' },
    'miasma_choking_spores':      { color: '#4a7a2e', shape: '🌿', count: 18, spread: 180, type: 'fog' },
    'miasma_petrify':             { color: '#888888', shape: '🪨', count: 12, spread: 100, type: 'burst' },
    'miasma_toxic_sludge':        { color: '#5a8a00', shape: '☠️', count: 15, spread: 140, type: 'fog' },

    // 🃏 GENERIC TECHNIQUES
    'generic_adrenal_rush':       { color: '#ff4444', shape: '❤️', count: 15, spread: 140, type: 'burst' },
    'generic_arcane_surge':       { color: '#ffd700', shape: '⭐', count: 20, spread: 180, type: 'burst' },
    'generic_emergency_repairs':  { color: '#6db465', shape: '💚', count: 12, spread: 120, type: 'sparkle' },
    'generic_eviction_notice':    { color: '#ff9500', shape: '📜', count: 10, spread: 100, type: 'sparkle' },
    'generic_food_rations':       { color: '#ffd700', shape: '🍖', count: 12, spread: 120, type: 'sparkle' },
    'generic_salvage_the_ruins':  { color: '#aaaaaa', shape: '🔩', count: 12, spread: 120, type: 'sparkle' },
    'generic_travelling_merchant':{ color: '#ffd700', shape: '💰', count: 10, spread: 100, type: 'sparkle' },
    'generic_veil_of_binding':    { color: '#9b59b6', shape: '🔮', count: 15, spread: 150, type: 'burst' },
};

// Default particle config
const DEFAULT_PARTICLES = { color: '#ffd700', shape: '✨', count: 12, spread: 120, type: 'sparkle' };

// Get center of screen
function getScreenCenter() {
    return {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
    };
}

// Create a single particle
function createParticle(x, y, config) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * config.spread;
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance - (Math.random() * 60); // Bias upward
    const size = Math.random() * 14 + 8;
    const duration = Math.random() * 0.5 + 0.7;
    const delay = Math.random() * 0.3;
    
    particle.style.cssText = `
        left: ${x}px;
        top: ${y}px;
        width: ${size}px;
        height: ${size}px;
        background: ${config.color};
        --tx: ${tx}px;
        --ty: ${ty}px;
        box-shadow: 0 0 ${size}px ${config.color};
        animation-duration: ${duration}s;
        animation-delay: ${delay}s;
        opacity: 0;
    `;
    
    // Some particles are emoji instead of circles
    if (Math.random() < 0.3) {
        particle.style.background = 'transparent';
        particle.style.boxShadow = 'none';
        particle.style.fontSize = `${size + 4}px`;
        particle.style.borderRadius = '0';
        particle.textContent = config.shape;
        particle.style.display = 'flex';
        particle.style.alignItems = 'center';
        particle.style.justifyContent = 'center';
    }
    
    document.body.appendChild(particle);
    setTimeout(() => particle.remove(), (duration + delay) * 1000);
}

// Flash screen with technique colour
function flashScreen(color) {
    const flash = document.createElement('div');
    flash.className = 'technique-flash';
    flash.style.background = color;
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 500);
}

// Screen shake (for destructive techniques)
function shakeScreen() {
    document.getElementById('game-container').classList.add('screen-shake');
    setTimeout(() => {
        document.getElementById('game-container').classList.remove('screen-shake');
    }, 500);
}

// Main function - play technique particles
// Fire just the particles (called after card arrives at centre)
function fireParticleEffect(cardId, x, y) {
    const config = TECHNIQUE_PARTICLES[cardId] || DEFAULT_PARTICLES;
    
    // Flash screen
    flashScreen(config.color);
    
    // Screen shake for explosions
    if (config.type === 'explosion') {
        shakeScreen();
    }
    
    // Burst particles from destination
    for (let i = 0; i < config.count; i++) {
        createParticle(x, y, config);
    }
    
    // Extra ring for burst/explosion
    if (config.type === 'burst' || config.type === 'explosion') {
        setTimeout(() => {
            for (let i = 0; i < Math.floor(config.count / 2); i++) {
                createParticle(x, y, { ...config, spread: config.spread * 1.5 });
            }
        }, 150);
    }
    
    // Slow drift for fog
    if (config.type === 'fog') {
        setTimeout(() => {
            for (let i = 0; i < 8; i++) {
                createParticle(x, y, { ...config, spread: config.spread * 0.5 });
            }
        }, 300);
    }
}

// Main function: card flies from hand to battlefield centre, fires particles, discards
function playTechniqueEffect(cardId, cardElement) {
    const config = TECHNIQUE_PARTICLES[cardId] || DEFAULT_PARTICLES;
    
    return new Promise((resolve) => {
        // Get start position (the card in hand, or screen centre if not found)
        let startX, startY, startW, startH;
        if (cardElement) {
            const rect = cardElement.getBoundingClientRect();
            startX = rect.left;
            startY = rect.top;
            startW = rect.width;
            startH = rect.height;
        } else {
            startX = window.innerWidth / 2 - 45;
            startY = window.innerHeight - 200;
            startW = 90;
            startH = 130;
        }
        
        // Target: centre of the game battlefield area
        const targetX = (window.innerWidth / 2) - 200;
        const targetY = window.innerHeight / 2 - 65;
        
        // Create flying card clone
        const flyCard = document.createElement('div');
        flyCard.className = 'technique-card-fly';
        flyCard.style.cssText = `
            left: ${startX}px;
            top: ${startY}px;
            width: ${startW}px;
            height: ${startH}px;
            --glow-color: ${config.color};
            overflow: hidden;
        `;
        
        // Add card image inside
        const img = document.createElement('img');
        img.src = `/static/images/cards/${cardId}.png`;
        img.style.cssText = `width: 100%; height: 100%; object-fit: cover; border-radius: 6px;`;
        img.onerror = () => {
            flyCard.style.background = 'linear-gradient(145deg, #2a2a2a, #1a1a1a)';
            flyCard.style.display = 'flex';
            flyCard.style.alignItems = 'center';
            flyCard.style.justifyContent = 'center';
            flyCard.style.fontSize = '32px';
            flyCard.textContent = config.shape;
        };
        flyCard.appendChild(img);
        document.body.appendChild(flyCard);
        
        // Animate: fly to centre using CSS transition
        requestAnimationFrame(() => {
            flyCard.style.transition = 'left 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94), top 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94), width 0.5s ease, height 0.5s ease, transform 0.5s ease';
            flyCard.style.left = `${targetX}px`;
            flyCard.style.top = `${targetY}px`;
            flyCard.style.width = '90px';
            flyCard.style.height = '130px';
            flyCard.style.transform = 'scale(1.3)';
        });
        
        // After flying - arrive and pulse
        setTimeout(() => {
            flyCard.style.transition = 'none';
            flyCard.classList.add('arrived');
            
            // Fire particles at arrival point
            const arrivalX = targetX + 45;
            const arrivalY = targetY + 65;
            fireParticleEffect(cardId, arrivalX, arrivalY);
            
            // Discard card after pulse
            setTimeout(() => {
                flyCard.classList.remove('arrived');
                flyCard.classList.add('discarding');
                setTimeout(() => {
                    flyCard.remove();
                    resolve();
                }, 300);
            }, 800);
            
        }, 550);
    });
}


// ============================================================
// ROTFALL EXPANSE MODAL
// ============================================================

function checkRotfall(state) {
    // Safety check: Ensure state and player exist
    if (!state || !state.you) {
        console.warn('⚠️ checkRotfall: Invalid state, skipping');
        return;
    }
    
    // Safety check: Ensure rotfall_must_destroy property exists
    const rotfall = state.you.rotfall_must_destroy ?? 0;
    if (rotfall > 0) {
        showRotfallModal(rotfall);
    }
}

function showRotfallModal(mustDestroy) {
    const modal = document.getElementById('rotfall-modal');
    const text = document.getElementById('rotfall-modal-text');
    const countText = document.getElementById('rotfall-count-text');
    const buttonsEl = document.getElementById('rotfall-unit-buttons');
    
    text.textContent = `Rotfall Expanse: You control more than 3 Units. Choose a Unit to destroy.`;
    countText.textContent = `Must destroy: ${mustDestroy} Unit${mustDestroy > 1 ? 's' : ''}`;
    
    // Build unit buttons from battlefield
    buttonsEl.innerHTML = '';
    gameState.you.battlefield.forEach((unit, index) => {
        if (unit) {
            const btn = document.createElement('button');
            btn.className = 'btn-rotfall-unit';
            btn.innerHTML = `
                <div style="font-size:12px; color:#aaa;">[Slot ${index + 1}]</div>
                <div>${unit.name}</div>
                <div style="font-size:11px; color:#888; margin-top:4px;">
                    ATK ${unit.atk_actual} / DEF ${unit.def_actual} / SPD ${unit.spd}
                </div>
            `;
            btn.addEventListener('click', () => rotfallDestroyUnit(index));
            buttonsEl.appendChild(btn);
        }
    });
    
    modal.classList.add('active');
}

async function rotfallDestroyUnit(unitIndex) {
    try {
        const response = await fetch(`/api/game/${gameId}/rotfall_destroy`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ player: 0, unit_index: unitIndex })
        });
        
        const data = await response.json();
        
        if (data.error) {
            addLog(`❌ ${data.error}`);
            return;
        }
        
        gameState = data;
        
        // Close modal
        document.getElementById('rotfall-modal').classList.remove('active');
        
        // If still more to destroy, show modal again
        if (gameState.you.rotfall_must_destroy > 0) {
            showRotfallModal(gameState.you.rotfall_must_destroy);
        } else {
            addLog('🌑 Rotfall satisfied. You may end turn now.');
        }
        
        updateUI();
    } catch (error) {
        console.error('Rotfall error:', error);
    }
}

// ============================================================
// FIELD CARD ANIMATION SYSTEM
// ============================================================

let activeFieldEffects = null;

// Play field card slam animation
function playFieldAnimation(fieldCardId, isReplacement = false, player = 'your') {
    return new Promise((resolve) => {
        const zoneSelector = player === 'your' ? '[data-zone="your-field"]' : '[data-zone="opponent-field"]';
        const fieldSlot = document.querySelector(zoneSelector);
        if (!fieldSlot) {
            resolve();
            return;
        }
        
        // Get field slot position BEFORE any changes
        const rect = fieldSlot.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        // Screen shake
        document.getElementById('game-container').classList.add('screen-shake');
        setTimeout(() => {
            document.getElementById('game-container').classList.remove('screen-shake');
        }, 500);
        
        // If replacing, shatter the old field first
        if (isReplacement) {
            const cards = fieldSlot.querySelectorAll('.card');
            let oldCard = null;
            let newCard = null;
            
            cards.forEach(card => {
                if (card.dataset.cardId === fieldCardId) {
                    newCard = card;
                } else {
                    oldCard = card;
                }
            });
            
            if (oldCard) {
                oldCard.classList.add('field-shattering');
                oldCard.style.zIndex = '5'; // Lower so it's visible shattering
                // Remove after animation
                setTimeout(() => oldCard.remove(), 600);
            }
        }
        
        // Wait for shatter if replacing, then do effects
        setTimeout(() => {
            // Create ripples centered on field slot (3 rings)
            for (let i = 0; i < 3; i++) {
                setTimeout(() => createFieldRipple(centerX, centerY), i * 200);
            }
            
            // Create sparks (8 directions)
            for (let i = 0; i < 8; i++) {
                const angle = (Math.PI * 2 / 8) * i;
                createFieldSpark(centerX, centerY, angle);
            }
            
            // Slam the new field card
            setTimeout(() => {
                const newCard = fieldSlot.querySelector(`.card[data-card-id="${fieldCardId}"]`);
                if (newCard) {
                    newCard.style.opacity = '1';
                    newCard.classList.add('field-slamming');
                    setTimeout(() => newCard.classList.remove('field-slamming'), 700);
                }
                
                // Start persistent effects for the appropriate player
                startFieldEffects(fieldCardId, player);
                resolve();
            }, 200);
        }, isReplacement ? 400 : 0);
    });
}

function createFieldRipple(x, y) {
    const ripple = document.createElement('div');
    ripple.className = 'field-ripple';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    ripple.style.transform = 'translate(-50%, -50%)';
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 1200);
}

function createFieldSpark(x, y, angle) {
    const spark = document.createElement('div');
    spark.className = 'field-spark';
    const distance = 200 + Math.random() * 100;
    const sparkX = Math.cos(angle) * distance;
    const sparkY = Math.sin(angle) * distance;
    spark.style.cssText = `
        left: ${x}px;
        top: ${y}px;
        --spark-x: ${sparkX}px;
        --spark-y: ${sparkY}px;
    `;
    document.body.appendChild(spark);
    setTimeout(() => spark.remove(), 800);
}

// Start persistent field effects
function startFieldEffects(fieldId, player = 'your') {
    // Update background tint for this player's zone
    updateBackgroundTint(fieldId, player);
}

// Stop field visual effects
function stopFieldEffects(player = 'your') {
    // Reset background for this player's zone
    updateBackgroundTint(null, player);
}

// Update background tint based on field type (for specific player zone)
function updateBackgroundTint(fieldId, player = 'your') {
    const zone = document.querySelector(player === 'your' ? '.your-zone' : '.opponent-zone');
    if (!zone) return;
    
    // Remove all field background classes
    zone.classList.remove('field-bg-skyforge', 'field-bg-miasma', 'field-bg-generic');
    
    if (!fieldId) return; // No field active
    
    // Add appropriate background class
    if (fieldId.startsWith('skyforge_')) {
        zone.classList.add('field-bg-skyforge');
    } else if (fieldId.startsWith('miasma_')) {
        zone.classList.add('field-bg-miasma');
    } else {
        zone.classList.add('field-bg-generic');
    }
}

// Shatter animation for destroyed field
function playFieldShatterAnimation() {
    const fieldSlot = document.querySelector('[data-zone="your-field"]');
    if (!fieldSlot) return;
    
    const card = fieldSlot.querySelector('.card');
    if (card) {
        card.classList.add('field-shattering');
        setTimeout(() => {
            card.remove();
            stopFieldEffects();
        }, 600);
    } else {
        stopFieldEffects();
    }
}

// ============================================================
// PHASE 2: SLOT HIGHLIGHTING SYSTEM (Traps, Units, Fields)
// ============================================================

// Highlight available slots based on selected card type
function highlightAvailableSlots() {
    // Clear all highlights first
    document.querySelectorAll('[data-zone="your-trap"]').forEach(slot => {
        slot.classList.remove('trap-slot-available');
    });
    document.querySelectorAll('[data-zone="your-unit"]').forEach(slot => {
        slot.classList.remove('unit-slot-available');
    });
    document.querySelectorAll('[data-zone="your-field"]').forEach(slot => {
        slot.classList.remove('field-slot-available');
    });
    
    if (!selectedCard) return; // No card selected, all highlights cleared
    
    const cardType = selectedCard.card.type;
    
    // TRAP CARDS → Highlight empty trap slots (white pulse)
    if (cardType === 'TRAP') {
        document.querySelectorAll('[data-zone="your-trap"]').forEach(slot => {
            if (!slot.querySelector('.card')) {
                slot.classList.add('trap-slot-available');
            }
        });
    }
    
    // UNIT CARDS → Highlight empty unit slots (red pulse)
    else if (cardType === 'UNIT' || cardType === 'UNIT - MYTHIC') {
        document.querySelectorAll('[data-zone="your-unit"]').forEach(slot => {
            if (!slot.querySelector('.card')) {
                slot.classList.add('unit-slot-available');
            }
        });
    }
    
    // FIELD CARDS → Highlight the field slot (yellow pulse, can replace)
    else if (cardType === 'FIELD') {
        document.querySelectorAll('[data-zone="your-field"]').forEach(slot => {
            slot.classList.add('field-slot-available');
        });
    }
}

// Legacy function name for backwards compatibility
function highlightAvailableTrapSlots() {
    highlightAvailableSlots();
}

// ============================================================
// PHASE 3D BATCH 3: TRAP PROMPT HANDLER (for non-attack traps)
// ============================================================

async function handleTrapPrompt(trapOwner, trapSlot, trap, triggerData, trapType, techniqueInLimbo = null) {
    console.log('🎭 handleTrapPrompt called:');
    console.log('   trapOwner:', trapOwner);
    console.log('   trapSlot:', trapSlot);
    console.log('   trap:', trap);
    console.log('   triggerData:', triggerData);
    console.log('   trapType:', trapType);
    
    if (trapOwner === 1) {
        // AI OWNS THE TRAP - Make automatic decision
        const willActivate = Math.random() < 0.8;
        
        addLog(`🎭 AI considers activating ${trap.name}...`);
        
        if (willActivate) {
            addLog(`✅ AI activates ${trap.name}!`);
        } else {
            addLog(`❌ AI chooses not to activate ${trap.name}`);
        }
        
        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // AI target selection: if multiple targets available, pick one randomly
        const availableTargets = triggerData?.available_targets || [];
        let aiTriggerData = triggerData;
        
        if (willActivate && availableTargets.length > 0) {
            // AI picks a random target
            const randomTarget = availableTargets[Math.floor(Math.random() * availableTargets.length)];
            aiTriggerData = {
                ...triggerData,
                selected_target_index: randomTarget.index
            };
            addLog(`🎯 AI targets: ${randomTarget.name}`);
        }
        
        // Send AI's decision to backend
        const response = await fetch(`/api/game/${gameId}/activate_trap`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                player: trapOwner,
                trap_slot: trapSlot,
                activate: willActivate,
                trigger_data: aiTriggerData
            })
        });
        
        const data = await response.json();
        
        console.log('📦 AI trap activation response received:', {
            trap: trap.name,
            activated: willActivate,
            state_included: !!data.state,
            effect_result: data.effect_result
        });
        
        if (willActivate) {
            // PHASE 3C: Play flip animation
            await playTrapFlipAnimation(trapOwner, trapSlot, trap);
            
            // Show trap effect messages
            if (data.effect_result && data.effect_result.messages) {
                data.effect_result.messages.forEach(msg => addLog(`⚡ ${msg}`));
            }
            
            // Check if attack was cancelled by the trap
            if (data.effect_result && data.effect_result.attack_cancelled) {
                addLog(`🛑 Attack cancelled by ${trap.name}!`);
                pendingAttackData = null;
                pendingTriggerData = null;
                console.log('✅ Updating state after attack cancellation');
                gameState = data.state;
                updateUI();
                return;
            }
            
            // Check if attack was redirected (Decoy Protocol)
            if (data.effect_result && data.effect_result.redirect_attack && data.effect_result.new_defender_index !== undefined) {
                addLog(`🔀 Attack redirected!`);
                if (pendingAttackData) {
                    pendingAttackData.defender_index = data.effect_result.new_defender_index;
                }
            }
            
            // Attack was NOT cancelled - continue with pending attack (possibly redirected)
            if (pendingAttackData) {
                addLog(`⚔️ Attack continues...`);
                console.log('⚔️ Continuing attack after trap activation');
                await continueAttack(pendingAttackData);
                pendingAttackData = null;
                pendingTriggerData = null;
                // Don't update state - continueAttack already did it
                return;
            }
            
            // For non-attack traps (Earthquake, Lockdown, etc.): Update state now
            console.log('✅ Non-attack trap - updating state immediately');
        } else {
            // AI chose NOT to activate trap
            addLog(`❌ AI declined ${trap.name}`);
            
            // CRITICAL: Continue the attack if there is one pending
            if (pendingAttackData) {
                console.log('⚔️ Trap declined - continuing attack');
                await continueAttack(pendingAttackData);
                pendingAttackData = null;
                pendingTriggerData = null;
                // Don't update state - continueAttack already did it
                return;
            }
            
            console.log('✅ Trap declined (no attack) - updating state');
        }
        
        // Update game state (for non-attack traps or when attack not in progress)
        console.log('📊 Updating gameState and UI after AI trap resolution');
        gameState = data.state;
        updateUI();
        console.log('✅ State and UI updated successfully');
        
    } else {
        // HUMAN OWNS THE TRAP - Show prompt
        const triggerMessage = getTrapTriggerMessage(trap, triggerData, trapType);
        addLog(`🎭 ${triggerMessage}`);
        
        // Determine if this trap triggered during AI's actions  
        // For ready traps: Check whose units are readying AND whose turn it is
        //   - If readied_player === 1 (AI units) at start of AI turn → wasAITurn = true
        //   - If readied_player === 0 (player units) at start of player turn → wasAITurn = false
        // For other traps: Check current active player
        let wasAITurn;
        if (trapType === 'ready') {
            // Ready traps trigger when units ready at start of their owner's turn
            // If AI units (readied_player=1) ready during AI turn (active_player=1) → wasAITurn = true
            // We check if it's currently AI's turn
            wasAITurn = (gameState.active_player === 1);
        } else {
            // For all other traps, check if it's currently AI's turn
            wasAITurn = (gameState.active_player === 1);
        }
        
        console.log('🔍 Trap timing check:', {
            trapType: trapType,
            active_player: gameState.active_player,
            readied_player: triggerData?.readied_player,
            wasAITurn: wasAITurn
        });
        
        // Set flag to prevent duplicate modals ONLY if AI turn needs to continue
        if (wasAITurn) {
            trapModalActive = true;
            console.log('🔒 Trap modal active - AI turn paused');
        }
        
        // Use the existing trap activation modal (await user's choice)
        await showTrapActivationPromptWithHandler(
            trap,
            trapSlot,
            triggerMessage,
            trapOwner,
            triggerData,
            wasAITurn  // Pass flag to resume AI turn after
        );
    }
}

// Helper to generate trigger messages for Batch 3 traps
function getTrapTriggerMessage(trap, triggerData, trapType) {
    if (trapType === 'deployment') {
        const targets = triggerData.available_targets || [];
        if (targets.length === 1) {
            return `Your ${trap.name} triggered! Target: ${targets[0].name}`;
        } else if (targets.length > 1) {
            return `Your ${trap.name} triggered! Choose one of ${targets.length} newly deployed units.`;
        }
        return `Your ${trap.name} triggered! Enemy deployed a unit.`;
    } else if (trapType === 'attack') {
        // Decoy Protocol and other attack traps
        const attacker_name = triggerData.attacker_name || 'Enemy';
        const targets = triggerData.available_targets || [];
        if (targets.length === 1) {
            return `Your ${trap.name} triggered! ${attacker_name} attacks. Redirect to: ${targets[0].name}`;
        } else if (targets.length > 1) {
            return `Your ${trap.name} triggered! ${attacker_name} attacks. Choose redirect target.`;
        }
        return `Your ${trap.name} triggered! ${attacker_name} attacks!`;
    } else if (trapType === 'field') {
        return `Your ${trap.name} triggered! Enemy activated a field card.`;
    } else if (trapType === 'technique') {
        return `Your ${trap.name} triggered! Enemy played a technique.`;
    } else if (trapType === 'ready') {
        return `Your ${trap.name} triggered! Enemy unit is becoming ready.`;
    } else if (trapType === 'counter_sigil') {
        return `Your ${trap.name} triggered! Enemy activated a trap.`;
    }
    return `Your ${trap.name} triggered!`;
}

// PHASE 3D BATCH 3: Handle Counter-Sigil prompts
async function handleCounterSigilPrompt(trapOwner, trapSlot, trap, triggerData, originalTrapActivation) {
    if (trapOwner === 1) {
        // AI decision
        const willActivate = Math.random() < 0.8;
        
        addLog(`🎭 AI considers activating Counter-Sigil...`);
        
        if (willActivate) {
            addLog(`✅ AI activates Counter-Sigil!`);
        } else {
            addLog(`❌ AI chooses not to activate Counter-Sigil`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Send decision
        const response = await fetch(`/api/game/${gameId}/activate_counter_sigil`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                player: trapOwner,
                trap_slot: trapSlot,
                activate: willActivate,
                trigger_data: triggerData,
                original_trap_activation: originalTrapActivation
            })
        });
        
        const data = await response.json();
        
        if (willActivate && data.effect_result) {
            await playTrapFlipAnimation(trapOwner, trapSlot, trap);
            if (data.effect_result.messages) {
                data.effect_result.messages.forEach(msg => addLog(`⚡ ${msg}`));
            }
        }
        
        gameState = data.state;
        updateUI();
        
    } else {
        // Human prompt
        const triggerMessage = `Your Counter-Sigil triggered! Enemy activated ${triggerData.enemy_trap_name}.`;
        addLog(`🎭 ${triggerMessage}`);
        
        await showTrapActivationPromptWithHandler(
            trap,
            trapSlot,
            triggerMessage,
            trapOwner,
            Object.assign({}, triggerData, {originalTrapActivation})
        );
    }
}

// ============================================================
// PHASE 3A: TRAP ACTIVATION UI
// ============================================================

// Show trap activation prompt with backend integration
function showTrapActivationPromptWithHandler(trap, trapSlot, triggerMessage, player, triggerData = null, wasAITurn = false) {
    // Return a Promise that resolves when user clicks a button
    return new Promise((resolve) => {
        // CRITICAL: Remove any existing trap modal first (prevent duplicates)
        const existingModal = document.getElementById('trap-activation-modal');
        if (existingModal) {
            console.warn('⚠️ Found existing trap modal - removing it first!');
            console.trace('Stack trace of duplicate modal creation:');
            document.body.removeChild(existingModal);
        }
        
        console.log('🎬 Creating new trap modal for:', trap.name);
        
        // Store trigger data for use in activation
        if (triggerData) {
            pendingTriggerData = triggerData;
        }
        
        // Check if this trap needs target selection
        const availableTargets = triggerData?.available_targets || [];
        console.log('🎯 Trap activation:', trap.name, 'Available targets:', availableTargets);
        
        // Show selection UI only if there are 2+ targets
        // For 1 target, auto-select it
        const needsTargetSelection = availableTargets.length > 1;
        
        const modal = document.createElement('div');
    modal.id = 'trap-activation-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: fadeIn 0.2s ease;
    `;
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: linear-gradient(145deg, #1a1a1a, #0d0d0d);
        border: 3px solid #666;
        border-radius: 15px;
        padding: 30px;
        max-width: 500px;
        text-align: center;
        box-shadow: 
            0 10px 40px rgba(0, 0, 0, 0.8),
            0 0 40px rgba(200, 200, 200, 0.3),
            inset 0 0 30px rgba(50, 50, 50, 0.5);
        animation: slideIn 0.3s ease;
    `;
    
    modalContent.innerHTML = `
        <h2 style="color: #ddd; margin: 0 0 10px 0; font-size: 28px; text-shadow: 0 0 10px rgba(255, 255, 255, 0.3);">
            🎭 Trap Activated!
        </h2>
        <p style="color: #999; margin: 0 0 20px 0; font-size: 14px; font-style: italic;">
            ${triggerMessage}
        </p>
        <div style="
            background: rgba(0, 0, 0, 0.5);
            padding: 20px;
            border-radius: 10px;
            margin: 20px 0;
            border: 2px solid rgba(200, 200, 200, 0.3);
            box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.8);
        ">
            <p style="margin: 0 0 5px 0; font-size: 22px; font-weight: bold; color: #fff; text-shadow: 0 0 8px rgba(255, 255, 255, 0.5);">
                ${trap.name}
            </p>
            <p style="margin: 5px 0; font-size: 14px; color: #ffc107; font-weight: bold;">
                Cost: ${trap.cost} Energy
            </p>
            <p style="margin: 15px 0 0 0; font-size: 15px; color: #ccc; line-height: 1.5; text-align: left;">
                ${trap.effect}
            </p>
        </div>
        ${needsTargetSelection ? `
            <div style="margin: 20px 0;">
                <p style="color: #ffc107; margin: 10px 0; font-size: 16px; font-weight: bold;">
                    Choose a target:
                </p>
                <div id="trap-target-selection" style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; max-width: 400px; margin: 10px auto;">
                    ${availableTargets.map((target, idx) => `
                        <button class="trap-target-btn" data-target-index="${target.index}" style="
                            padding: 10px 15px;
                            font-size: 14px;
                            border: 2px solid #ffc107;
                            border-radius: 6px;
                            cursor: pointer;
                            background: linear-gradient(145deg, #333, #222);
                            color: #ffc107;
                            transition: all 0.2s;
                        ">
                            ${target.name}
                        </button>
                    `).join('')}
                </div>
            </div>
        ` : ''}
        <p style="color: #ffc107; margin: 15px 0; font-size: 16px; font-weight: bold;">
            Activate this trap?
        </p>
        <div style="display: flex; gap: 15px; justify-content: center; margin-top: 25px;">
            <button id="trap-activate-yes" style="
                padding: 15px 40px;
                font-size: 18px;
                font-weight: bold;
                border: 2px solid #28a745;
                border-radius: 8px;
                cursor: pointer;
                background: linear-gradient(145deg, #28a745, #218838);
                color: white;
                box-shadow: 0 4px 12px rgba(40, 167, 69, 0.4);
                transition: all 0.2s;
            ">
                YES
            </button>
            <button id="trap-activate-no" style="
                padding: 15px 40px;
                font-size: 18px;
                font-weight: bold;
                border: 2px solid #666;
                border-radius: 8px;
                cursor: pointer;
                background: linear-gradient(145deg, #444, #222);
                color: white;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
                transition: all 0.2s;
            ">
                NO
            </button>
        </div>
    `;
    
    // Add hover effects
    const style = document.createElement('style');
    style.textContent = `
        #trap-activate-yes:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(40, 167, 69, 0.6);
            background: linear-gradient(145deg, #2ecc71, #27ae60);
        }
        #trap-activate-no:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(100, 100, 100, 0.6);
            background: linear-gradient(145deg, #555, #333);
        }
        .trap-target-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(255, 193, 7, 0.5);
            background: linear-gradient(145deg, #444, #333);
        }
        .trap-target-btn.selected {
            border-color: #4ade80;
            color: #4ade80;
            background: linear-gradient(145deg, #1e3a20, #15291a);
            box-shadow: 0 0 15px rgba(74, 222, 128, 0.5);
        }
    `;
    document.head.appendChild(style);
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Target selection logic
    let selectedTargetIndex = needsTargetSelection ? null : (availableTargets[0]?.index ?? null);
    console.log('🎯 Initial selectedTargetIndex:', selectedTargetIndex, 'needsTargetSelection:', needsTargetSelection);
    
    if (needsTargetSelection) {
        // Add click handlers to target buttons
        const targetButtons = modal.querySelectorAll('.trap-target-btn');
        console.log('🔘 Found', targetButtons.length, 'target buttons');
        
        targetButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove selected class from all buttons
                targetButtons.forEach(b => b.classList.remove('selected'));
                // Add selected class to clicked button
                btn.classList.add('selected');
                // Store selected index
                selectedTargetIndex = parseInt(btn.dataset.targetIndex);
                console.log('👆 User selected target index:', selectedTargetIndex);
            });
        });
        
        // Auto-select first target by default
        if (targetButtons.length > 0) {
            targetButtons[0].classList.add('selected');
            selectedTargetIndex = parseInt(targetButtons[0].dataset.targetIndex);
            console.log('✨ Auto-selected first target:', selectedTargetIndex);
        }
    }
    
    // Button handlers - Call backend
    document.getElementById('trap-activate-yes').addEventListener('click', async () => {
        try {
            // Check if target was selected (when needed)
            if (needsTargetSelection && selectedTargetIndex === null) {
                addLog('⚠️ Please select a target!');
                return;
            }
            
            console.log('✅ User clicked YES - Selected target index:', selectedTargetIndex);
            console.log('📦 Pending trigger data before adding target:', pendingTriggerData);
            
            // Remove modal FIRST to prevent double-clicking
            if (modal.parentNode) {
                document.body.removeChild(modal);
            }
            
            // Add selected target to trigger data before activation
            if (selectedTargetIndex !== null) {
                pendingTriggerData = {
                    ...pendingTriggerData,
                    selected_target_index: selectedTargetIndex
                };
                console.log('📦 Pending trigger data after adding target:', pendingTriggerData);
            } else {
                console.warn('⚠️ WARNING: selectedTargetIndex is null!');
            }
            
            console.log('🔄 Calling handleTrapActivation with activate=true...');
            await handleTrapActivation(trap, trapSlot, true, player);
            console.log('✅ handleTrapActivation completed successfully');
            
            // Clear modal active flag
            if (wasAITurn) {
                trapModalActive = false;
                console.log('🔓 Trap modal resolved - resuming AI turn');
            }
            
            // DON'T resume AI turn here - the original aiTurn loop is still running!
            // It's waiting for handleTrapPrompt to return, and will continue automatically
            console.log('✅ Trap resolved - original aiTurn loop will continue');
            
            // Resolve the promise
            resolve();
        } catch (error) {
            console.error('❌ ERROR in YES button handler:', error);
            addLog('❌ Error activating trap: ' + error.message);
            
            // Clear flag even on error
            if (wasAITurn) {
                trapModalActive = false;
                console.log('🔓 Error occurred - clearing trap modal flag');
            }
            
            resolve(); // Resolve anyway to prevent hanging
        }
    });
    
    document.getElementById('trap-activate-no').addEventListener('click', async () => {
        try {
            console.log('❌ User clicked NO on trap activation');
            
            // Remove modal FIRST to prevent double-clicking
            if (modal.parentNode) {
                document.body.removeChild(modal);
            }
            
            console.log('🔄 Calling handleTrapActivation with activate=false...');
            await handleTrapActivation(trap, trapSlot, false, player);
            console.log('✅ Trap NOT activated, state updated');
            
            // Clear modal active flag
            if (wasAITurn) {
                trapModalActive = false;
                console.log('🔓 Trap modal resolved - resuming AI turn');
            }
            
            // DON'T resume AI turn here - the original aiTurn loop is still running!
            // It's waiting for handleTrapPrompt to return, and will continue automatically
            console.log('✅ Trap declined - original aiTurn loop will continue');
            
            // Resolve the promise
            resolve();
        } catch (error) {
            console.error('❌ ERROR in NO button handler:', error);
            addLog('❌ Error handling trap response: ' + error.message);
            
            // Clear flag even on error
            if (wasAITurn) {
                trapModalActive = false;
                console.log('🔓 Error occurred - clearing trap modal flag');
            }
            
            resolve(); // Resolve anyway to prevent hanging
        }
    });
    });
}

// Handle trap activation response from backend
async function handleTrapActivation(trap, trapSlot, activate, player) {
    console.log(`📡 handleTrapActivation START - trap: ${trap.name}, activate: ${activate}, player: ${player}`);
    console.log('📡 Sending trigger data:', pendingTriggerData);
    
    try {
        const response = await fetch(`/api/game/${gameId}/activate_trap`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                player: player,
                trap_slot: trapSlot,
                activate: activate,
                trigger_data: pendingTriggerData  // PHASE 3D: Send trigger data for effects
            })
        });
        
        console.log('📡 Response received, status:', response.status);
        const data = await response.json();
        console.log('📡 Response data:', data);
        
        if (data.error) {
            console.error('❌ Backend returned error:', data.error);
            
            // Special case: Trap was already removed (e.g., by Counter-Sigil)
            if (data.trap_already_removed) {
                console.log('⚠️ Trap already removed - updating state and continuing');
                addLog(`⚠️ ${data.error} - trap was already negated`);
                
                // Update state if provided
                if (data.state) {
                    gameState = data.state;
                    updateUI();
                }
                
                // Return without showing error - this is expected after Counter-Sigil
                return;
            }
            
            // Other errors
            addLog(`❌ ${data.error}`);
            return;
        }
        
        // PHASE 3D BATCH 3: Check if Counter-Sigil triggered
        if (data.counter_sigil_trigger) {
            console.log('🎭 Counter-Sigil triggered!');
            addLog(`🎭 ${data.trigger_message}`);
            
            // Update state
            gameState = data.state;
            
            // Handle Counter-Sigil prompt
            await handleCounterSigilPrompt(
                data.trap_owner,
                data.trap_slot,
                data.trap,
                data.trigger_data,
                data.original_trap_activation
            );
            
            return;
        }
        
        if (activate) {
            console.log('✅ Processing trap activation (activate=true)');
            console.log('📦 Response data:', data);
            addLog(`✅ Activated: ${trap.name}`);
            
            // PHASE 3D BATCH 3: Check if this was a Counter-Sigil that was prompted
            if (data.counter_sigil_activated) {
                addLog(`🚫 Original trap negated by Counter-Sigil!`);
                
                // Play flip animation for Counter-Sigil
                await playTrapFlipAnimation(player, trapSlot, trap);
                
                // Update game state
                gameState = data.state;
                updateUI();
                
                return;
            }
            
            // PHASE 3D BATCH 3: Check if Counter-Sigil negated this trap
            if (data.trap_negated && data.counter_sigil_activated) {
                addLog(`🚫 ${trap.name} negated by Counter-Sigil!`);
                
                // Play flip animation for the negated trap
                await playTrapFlipAnimation(player, trapSlot, trap);
                
                // Update game state
                gameState = data.state;
                updateUI();
                
                // Clear pending data if attack trap was negated
                if (pendingAttackData) {
                    pendingAttackData = null;
                    pendingTriggerData = null;
                }
                
                return;
            }
            
            // PHASE 3C: Play flip animation
            await playTrapFlipAnimation(player, trapSlot, trap);
            
            // PHASE 3D: Handle trap effect results
            if (data.effect_result) {
                // Show effect messages
                if (data.effect_result.messages) {
                    data.effect_result.messages.forEach(msg => addLog(`⚡ ${msg}`));
                }
                
                // Update game state
                gameState = data.state;
                updateUI();
                
                // Check if attack was cancelled
                if (data.effect_result.attack_cancelled) {
                    // Attack was cancelled - clear pending data and stop
                    addLog(`🛑 Attack cancelled!`);
                    pendingAttackData = null;
                    pendingTriggerData = null;
                    return;
                }
                
                // DECOY PROTOCOL: Check if attack was redirected
                if (data.effect_result.redirect_attack && data.effect_result.new_defender_index !== undefined) {
                    addLog(`🔀 Attack redirected!`);
                    // Update pending attack data with new target
                    if (pendingAttackData) {
                        pendingAttackData.defender_index = data.effect_result.new_defender_index;
                    }
                }
                
                // Attack was NOT cancelled - continue with pending attack (possibly redirected)
                if (pendingAttackData) {
                    addLog(`⚔️ Attack continues...`);
                    
                    // Resume the attack
                    await continueAttack(pendingAttackData);
                    
                    // Clear pending data
                    pendingAttackData = null;
                    pendingTriggerData = null;
                    
                    // DON'T update state again - continueAttack already did it
                    return;
                }
            }
        } else {
            addLog(`❌ Did not activate: ${trap.name}`);
            
            // Trap not activated - continue with attack
            if (pendingAttackData) {
                await continueAttack(pendingAttackData);
                pendingAttackData = null;
                pendingTriggerData = null;
                
                // DON'T update state again - continueAttack already did it
                return;
            }
        }
        
        // Update game state (only if we didn't continue attack)
        gameState = data.state;
        updateUI();
        
    } catch (error) {
        console.error('Error activating trap:', error);
        addLog('Error activating trap');
    }
}

// Continue a pending attack after trap resolution
async function continueAttack(attackData) {
    try {
        const response = await fetch(`/api/game/${gameId}/attack`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                player: attackData.attacker_player,
                attacker_index: attackData.attacker_index,
                defender_index: attackData.defender_index
            })
        });
        
        const data = await response.json();
        
        if (data.result.error) {
            addLog(`❌ ${data.result.error}`);
        } else if (data.result.combat_log) {
            // Trigger combat animation if we have the data
            if (attackData.attacker_player !== undefined && attackData.attacker_index !== undefined && attackData.defender_index !== undefined) {
                const attackerZone = attackData.attacker_player === 0 ? 'your-unit' : 'opponent-unit';
                const defenderZone = attackData.attacker_player === 0 ? 'opponent-unit' : 'your-unit';
                
                const attackerEl = document.querySelector(`[data-zone="${attackerZone}"][data-index="${attackData.attacker_index}"] .card`);
                const defenderEl = document.querySelector(`[data-zone="${defenderZone}"][data-index="${attackData.defender_index}"] .card`);
                
                if (attackerEl && defenderEl) {
                    // Parse damage from combat log
                    const combatText = data.result.combat_log.join(' ');
                    const damageMatch = combatText.match(/(\d+) damage/) || combatText.match(/\((\d+) ATK/);
                    const damage = damageMatch ? parseInt(damageMatch[1]) : 0;
                    
                    if (damage > 0) {
                        await playCombatAnimation(attackerEl, defenderEl, damage);
                        showDamageNumber(damage, defenderEl);
                    }
                }
            }
            
            // Show combat results
            data.result.combat_log.forEach(msg => addLog(`⚔️ ${msg}`));
            
            // Update state
            gameState = data.state;
            updateUI();
        }
    } catch (error) {
        console.error('Error continuing attack:', error);
        addLog('Error continuing attack');
    }
}

// ============================================================
// PHASE 3C: TRAP FLIP ANIMATION - ENHANCED DRAMATIC REVEAL
// ============================================================

async function playTrapFlipAnimation(player, trapSlot, trap) {
    // Get the trap card element
    const zoneType = player === 0 ? 'your-trap' : 'opponent-trap';
    const trapSlotEl = document.querySelector(`[data-zone="${zoneType}"][data-index="${trapSlot}"]`);
    
    if (!trapSlotEl) {
        console.error('Could not find trap slot element');
        return;
    }
    
    const trapCardEl = trapSlotEl.querySelector('.card');
    if (!trapCardEl) {
        console.error('Could not find trap card element');
        return;
    }
    
    // STEP 1: Quick flip of the card in its slot (0.4s)
    trapCardEl.classList.add('trap-flipping');
    await new Promise(resolve => setTimeout(resolve, 400));
    trapCardEl.classList.remove('trap-flipping');
    
    // STEP 2: Create dramatic fullscreen reveal modal
    const modal = document.createElement('div');
    modal.className = 'trap-reveal-overlay';
    
    const cardContainer = document.createElement('div');
    cardContainer.className = 'trap-reveal-card';
    
    // Add speed lines background effect
    const speedLines = document.createElement('div');
    speedLines.className = 'speed-lines';
    cardContainer.appendChild(speedLines);
    
    // Add light sweep effect
    const lightSweep = document.createElement('div');
    lightSweep.className = 'light-sweep';
    cardContainer.appendChild(lightSweep);
    
    // Create trap reveal content
    cardContainer.innerHTML += `
        <div class="trap-reveal-header">
            <div class="trap-reveal-label">🎭 TRAP ACTIVATED 🎭</div>
            <h2 class="trap-reveal-title">${trap.name}</h2>
            <div class="trap-reveal-cost">⚡ ${trap.cost} Energy</div>
        </div>
        <div class="trap-reveal-effect">
            <div class="trap-reveal-effect-text">${trap.effect}</div>
        </div>
    `;
    
    modal.appendChild(cardContainer);
    document.body.appendChild(modal);
    
    // STEP 3: Display for 5 seconds (time to read)
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // STEP 4: Fade out modal
    modal.style.animation = 'overlayFadeIn 0.3s ease-out reverse';
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Remove modal
    document.body.removeChild(modal);
    
    // STEP 5: Quick discard animation on the actual card
    trapCardEl.classList.add('trap-discarding');
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Card will be removed by updateUI()
}

// Show trap activation prompt (original test function)
function showTrapActivationPrompt(trap, triggerMessage) {
    showTrapActivationPromptWithHandler(trap, 0, triggerMessage, 0);
}

// TEST FUNCTION - Remove later
function testTrapPrompt() {
    const dummyTrap = {
        name: "Counter Measure",
        cost: 2,
        effect: "When an enemy Unit declares an attack, target that Unit. Cancel its attack this turn."
    };
    showTrapActivationPrompt(dummyTrap, "Enemy unit 'Steel Sentinel' is attacking!");
}
