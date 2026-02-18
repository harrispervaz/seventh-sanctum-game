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
    if (!gameState) return;
    
    // Check for Rotfall Expanse destruction requirement
    checkRotfall(gameState);
    
    // Update header info
    document.getElementById('turn-number').textContent = gameState.turn;
    document.getElementById('current-phase').textContent = capitalizeFirst(gameState.phase);
    
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
    
    // Update stats
    document.getElementById('your-energy').textContent = gameState.you.energy;
    document.getElementById('your-control-loss').textContent = gameState.you.control_loss;
    document.getElementById('opponent-energy').textContent = gameState.opponent.energy;
    document.getElementById('opponent-control-loss').textContent = gameState.opponent.control_loss;
    
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

// Render your hand
function renderHand() {
    console.log('🃏 Rendering hand...');
    const handEl = document.getElementById('your-hand');
    handEl.innerHTML = '';
    
    if (!gameState || !gameState.you || !gameState.you.hand) {
        console.error('❌ No hand data!', gameState);
        return;
    }
    
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
    });
    
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
function renderBattlefield(player, units) {
    for (let i = 0; i < 5; i++) {
        const slot = document.querySelector(`[data-zone="${player}-unit"][data-index="${i}"]`);
        const hadCard = slot.querySelector('.card') !== null;
        slot.innerHTML = '';
        
        if (units[i]) {
            const isOpponent = player === 'opponent';
            const cardEl = createBattlefieldCard(units[i], isOpponent);
            
            // Trigger slide-in animation for newly deployed cards (both players)
            if (!hadCard) {
                playSlideInAnimation(cardEl);
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
}

// Create battlefield card with proper icon positioning
function createBattlefieldCard(card, isOpponent = false) {
    if (!card) return null;
    
    const cardEl = document.createElement('div');
    cardEl.className = `card ${card.type.toLowerCase()}`;
    
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
        cardEl.style.transition = 'all 0.3s ease';
        cardEl.title = 'Exhausted - Cannot attack or retaliate';
    } else {
        cardEl.style.transform = 'rotate(0deg)';
        cardEl.style.transition = 'all 0.3s ease';
    }
    
    // Add artwork image (80x80)
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
        margin-top: auto;
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
        const atkDisplay = card.atk_buff ? `${card.atk_actual}<span style="color:#4ade80;font-size:9px;">↑</span>` : card.atk;
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
    
    return cardEl;
}

// Render field
function renderField(player, field) {
    const slot = document.querySelector(`[data-zone="${player}-field"]`);
    const hadCard = slot.querySelector('.card') !== null;
    const oldFieldId = hadCard ? slot.querySelector('.card')?.dataset?.cardId : null;
    
    const playerType = player === 'your' ? 'your' : 'opponent';
    const wasDestroyed = hadCard && !field;
    
    if (wasDestroyed) {
        const cardToDestroy = slot.querySelector('.card');
        if (cardToDestroy) {
            cardToDestroy.classList.add('field-shattering');
            setTimeout(() => {
                slot.innerHTML = '<small>FIELD</small>';
                stopFieldEffects(playerType);
            }, 600);
            return;
        }
    }
    
    slot.innerHTML = '';
    
    if (field) {
        const cardEl = createCardElement(field, false, true);
        cardEl.dataset.cardId = field.id;
        
        slot.appendChild(cardEl);
        
        // Start persistent effects - check against correct player's active effects
        if (field.id !== activeFieldEffects[playerType]) {
            startFieldEffects(field.id, playerType);
        }
    } else {
        slot.innerHTML = '<small>FIELD</small>';
        stopFieldEffects(playerType);
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
                
                // Trigger slide-in animation for newly set traps
                if (!hadCard) {
                    playSlideInAnimation(cardBack);
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
                
                // Trigger slide-in animation for newly set traps
                if (!hadCard) {
                    playSlideInAnimation(cardEl);
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
        cardEl.style.transition = 'all 0.3s ease';
        cardEl.title = 'Exhausted - Cannot attack or retaliate';
    } else {
        // Ready cards have normal orientation with smooth transition
        cardEl.style.transform = 'rotate(0deg)';
        cardEl.style.transition = 'all 0.3s ease';
    }
    
    // Add artwork image (80x80)
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
        margin-top: auto;
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
        const atkDisplay = card.atk_buff ? `${card.atk_actual}<span style="color:#4ade80;font-size:9px;">↑</span>` : card.atk;
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
    addLog(`Selected: ${card.name} - Click "Deploy/Play" to use`);
    
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
    
    // Show deploy button
    showDeployButton();
    // DON'T call updateUI() here - it re-renders hand and removes the selected class!
}

// Show/hide deploy button
function showDeployButton() {
    let btn = document.getElementById('deploy-card-btn');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'deploy-card-btn';
        btn.className = 'btn-primary';
        btn.textContent = 'Deploy/Play Card';
        btn.addEventListener('click', playSelectedCard);
        document.querySelector('.controls').insertBefore(btn, document.getElementById('attack-mode-btn'));
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
        } else {
            // Check what type of card was played
            const isField = selectedCard.card.type === 'FIELD';
            const isTechnique = selectedCard.card.type === 'TECHNIQUE';
            
            // Technique resolved - fly card to battlefield then fire particles!
            if (isTechnique) {
                const handCards = document.querySelectorAll('#your-hand .card');
                const cardEl = handCards[selectedCard.index] || null;
                await playTechniqueEffect(selectedCard.card.id, cardEl);
            }
            
            addLog(`✅ ${data.result.message}`);
            
            // Check if a field was replaced
            const wasReplacement = isField && gameState.you.field && gameState.you.field.id !== selectedCard.card.id;
            
            gameState = data.state;
            updateUI();
            
            // Field card - play slam animation AFTER state update
            if (isField) {
                await playFieldAnimation(selectedCard.card.id, wasReplacement);
            }
        }
        
        selectedCard = null;
        hideDeployButton();
        
        // Remove selection highlight
        document.querySelectorAll('.card.selected').forEach(el => {
            el.classList.remove('selected');
        });
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
    try {
        const response = await fetch(`/api/game/${gameId}/advance_phase`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({player: 0})
        });
        
        const data = await response.json();
        gameState = data;
        updateUI();
        
        // Simple AI: if it's opponent's turn, make them play
        if (gameState.active_player === 1) {
            setTimeout(aiTurn, 1000);
        }
    } catch (error) {
        console.error('Error advancing phase:', error);
    }
}

// Simple AI opponent
async function aiTurn() {
    // AI turn happens automatically on server
    // Just keep advancing until it's human's turn again
    
    while (gameState.active_player === 1 && !gameState.winner) {
        await new Promise(resolve => setTimeout(resolve, 800)); // Slight delay so we can see AI actions
        
        await advancePhase();
        
        if (gameState.winner !== null) {
            break;
        }
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
    return new Promise((resolve) => {
        // Attacker strikes
        attackerElement.classList.add('attacking');
        
        setTimeout(() => {
            // Defender gets hit
            defenderElement.classList.add('hit');
            
            // Show damage number
            showDamageNumber(damage, defenderElement);
            
            // Clean up after animations
            setTimeout(() => {
                attackerElement.classList.remove('attacking');
                defenderElement.classList.remove('hit');
                resolve();
            }, 600);
        }, 300);
    });
}

// Trigger card slide-in animation
function playSlideInAnimation(cardElement) {
    cardElement.classList.add('slide-in');
    setTimeout(() => {
        cardElement.classList.remove('slide-in');
    }, 600);
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
    const rotfall = state.you.rotfall_must_destroy || 0;
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

// Track active field effects per player
let activeFieldEffects = { your: null, opponent: null };
// Store interval IDs so we can properly clear them
let fieldIntervals = { your: [], opponent: [] };

// Play field card slam animation
function playFieldAnimation(fieldCardId, isReplacement = false) {
    return new Promise((resolve) => {
        const fieldSlot = document.querySelector('[data-zone="your-field"]');
        if (!fieldSlot) {
            resolve();
            return;
        }
        
        const rect = fieldSlot.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        // Screen shake
        document.getElementById('game-container').classList.add('screen-shake');
        setTimeout(() => {
            document.getElementById('game-container').classList.remove('screen-shake');
        }, 500);
        
        // If replacing, shatter old field first
        if (isReplacement) {
            const oldCard = fieldSlot.querySelector('.card');
            if (oldCard) {
                oldCard.classList.add('field-shattering');
                setTimeout(() => {
                    if (oldCard.parentNode && oldCard.classList.contains('field-shattering')) {
                        oldCard.remove();
                    }
                }, 600);
            }
        }
        
        setTimeout(() => {
            // Triple ripple rings
            for (let i = 0; i < 3; i++) {
                setTimeout(() => createFieldRipple(centerX, centerY), i * 200);
            }
            
            // 12 directional sparks (more than before)
            for (let i = 0; i < 12; i++) {
                const angle = (Math.PI * 2 / 12) * i;
                setTimeout(() => createFieldSpark(centerX, centerY, angle), Math.random() * 150);
            }
            
            // Impact flash
            const flash = document.createElement('div');
            flash.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: radial-gradient(circle at ${centerX}px ${centerY}px, rgba(255,215,0,0.3), transparent 60%);
                pointer-events: none; z-index: 55; opacity: 1;
                transition: opacity 0.6s ease-out;
            `;
            document.body.appendChild(flash);
            requestAnimationFrame(() => flash.style.opacity = '0');
            setTimeout(() => flash.remove(), 700);
            
            // Slam the new field card
            setTimeout(() => {
                const newCard = fieldSlot.querySelector('.card:not(.field-shattering)');
                if (newCard) {
                    newCard.classList.add('field-slamming');
                    setTimeout(() => newCard.classList.remove('field-slamming'), 700);
                }
                
                startFieldEffects(fieldCardId, 'your');
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
    const distance = 150 + Math.random() * 150;
    const sparkX = Math.cos(angle) * distance;
    const sparkY = Math.sin(angle) * distance;
    spark.style.cssText = `
        left: ${x}px; top: ${y}px;
        --spark-x: ${sparkX}px; --spark-y: ${sparkY}px;
    `;
    document.body.appendChild(spark);
    setTimeout(() => spark.remove(), 800);
}

// ---- START / STOP FIELD EFFECTS ----

function startFieldEffects(fieldId, player = 'your') {
    // Clear any existing effects for this player first
    stopFieldEffects(player);
    
    const overlay = document.getElementById('field-effects-overlay');
    overlay.classList.add('active');
    
    const zone = document.getElementById(`field-effects-${player}`);
    if (!zone) return;
    
    zone.innerHTML = '';
    
    switch(fieldId) {
        case 'skyforge_assembly_line':
            createAssemblyLineEffect(zone, player);
            break;
        case 'skyforge_relay_node':
            createRelayNodeEffect(zone, player);
            break;
        case 'skyforge_kill_zone':
            createKillZoneEffect(zone, player);
            break;
        case 'skyforge_rustfields':
            createRustfieldsEffect(zone, player);
            break;
        case 'miasma_lowlands_mist':
            createLowlandsMistEffect(zone, player);
            break;
        case 'miasma_blight_pools':
            createBlightPoolsEffect(zone, player);
            break;
        case 'miasma_rotfall_expanse':
            createRotfallExpanseEffect(zone, player);
            break;
    }
    
    activeFieldEffects[player] = fieldId;
}

function stopFieldEffects(player = 'your') {
    // Clear all intervals for this player
    if (fieldIntervals[player]) {
        fieldIntervals[player].forEach(id => clearInterval(id));
        fieldIntervals[player] = [];
    }
    
    const zone = document.getElementById(`field-effects-${player}`);
    if (zone) {
        zone.innerHTML = '';
    }
    
    activeFieldEffects[player] = null;
    
    // Hide overlay if BOTH zones are empty
    const yourZone = document.getElementById('field-effects-your');
    const oppZone = document.getElementById('field-effects-opponent');
    if (yourZone && oppZone && !yourZone.innerHTML && !oppZone.innerHTML) {
        document.getElementById('field-effects-overlay').classList.remove('active');
    }
}

// ---- INDIVIDUAL FIELD EFFECTS (ENHANCED) ----

// ⚙️ Assembly Line - floating gears + occasional sparks + mechanical pulse
function createAssemblyLineEffect(overlay, player) {
    // Static floating gears (varied sizes)
    const gearSymbols = ['⚙️', '🔩', '⚙️', '🔧', '⚙️'];
    for (let i = 0; i < 10; i++) {
        const gear = document.createElement('div');
        gear.className = 'gear-particle';
        gear.textContent = gearSymbols[i % gearSymbols.length];
        const size = 18 + Math.random() * 16;
        gear.style.fontSize = `${size}px`;
        gear.style.left = `${Math.random() * 90 + 5}%`;
        gear.style.top = `${Math.random() * 80 + 10}%`;
        gear.style.animationDelay = `${Math.random() * 4}s`;
        gear.style.animationDuration = `${3 + Math.random() * 3}s`;
        overlay.appendChild(gear);
    }
    
    // Drifting spark particles (interval)
    const sparkInterval = setInterval(() => {
        if (activeFieldEffects[player] !== 'skyforge_assembly_line') return;
        const spark = document.createElement('div');
        spark.style.cssText = `
            position: absolute;
            width: ${3 + Math.random() * 4}px;
            height: ${3 + Math.random() * 4}px;
            background: #ffa500;
            border-radius: 50%;
            box-shadow: 0 0 6px #ffa500, 0 0 12px rgba(255,165,0,0.4);
            left: ${Math.random() * 100}%;
            bottom: ${Math.random() * 30}%;
            opacity: 0.8;
            pointer-events: none;
            animation: assemblySparkFloat ${2 + Math.random() * 2}s ease-out forwards;
        `;
        overlay.appendChild(spark);
        setTimeout(() => spark.remove(), 4000);
    }, 400);
    fieldIntervals[player].push(sparkInterval);
}

// 📡 Relay Node - twinkling lights + energy pulse beams
function createRelayNodeEffect(overlay, player) {
    // Twinkling relay lights (more of them, varied color)
    for (let i = 0; i < 25; i++) {
        const light = document.createElement('div');
        light.className = 'relay-light';
        const hue = 200 + Math.random() * 40; // Blue to cyan range
        light.style.background = `hsl(${hue}, 80%, 60%)`;
        light.style.boxShadow = `0 0 ${8 + Math.random() * 8}px hsl(${hue}, 80%, 60%)`;
        light.style.width = `${4 + Math.random() * 5}px`;
        light.style.height = light.style.width;
        light.style.left = `${Math.random() * 95 + 2.5}%`;
        light.style.top = `${Math.random() * 90 + 5}%`;
        light.style.animationDelay = `${Math.random() * 2}s`;
        light.style.animationDuration = `${1.5 + Math.random() * 2}s`;
        overlay.appendChild(light);
    }
    
    // Pulse beams that travel across
    const beamInterval = setInterval(() => {
        if (activeFieldEffects[player] !== 'skyforge_relay_node') return;
        const beam = document.createElement('div');
        const startY = Math.random() * 80 + 10;
        beam.style.cssText = `
            position: absolute;
            width: 60px; height: 2px;
            background: linear-gradient(90deg, transparent, #4a90e2, #80d0ff, #4a90e2, transparent);
            box-shadow: 0 0 8px #4a90e2;
            left: -60px;
            top: ${startY}%;
            opacity: 0.6;
            pointer-events: none;
            animation: relayBeamTravel ${3 + Math.random() * 2}s linear forwards;
        `;
        overlay.appendChild(beam);
        setTimeout(() => beam.remove(), 6000);
    }, 1500);
    fieldIntervals[player].push(beamInterval);
}

// 🔥 Kill Zone - fire + rising embers + heat shimmer
function createKillZoneEffect(overlay, player) {
    // Base fire particles along the bottom
    for (let i = 0; i < 15; i++) {
        const fire = document.createElement('div');
        fire.className = 'fire-particle';
        const w = 15 + Math.random() * 20;
        fire.style.width = `${w}px`;
        fire.style.height = `${w * 1.5}px`;
        fire.style.left = `${Math.random() * 90 + 5}%`;
        fire.style.bottom = '0';
        fire.style.animationDelay = `${Math.random() * 1}s`;
        fire.style.animationDuration = `${0.6 + Math.random() * 0.8}s`;
        overlay.appendChild(fire);
    }
    
    // Rising ember particles
    const emberInterval = setInterval(() => {
        if (activeFieldEffects[player] !== 'skyforge_kill_zone') return;
        const ember = document.createElement('div');
        const size = 2 + Math.random() * 4;
        ember.style.cssText = `
            position: absolute;
            width: ${size}px; height: ${size}px;
            background: ${Math.random() > 0.5 ? '#ff4500' : '#ffa500'};
            border-radius: 50%;
            box-shadow: 0 0 ${size * 2}px ${Math.random() > 0.5 ? '#ff4500' : '#ff6b00'};
            left: ${Math.random() * 100}%;
            bottom: 0;
            pointer-events: none;
            animation: emberRise ${2 + Math.random() * 3}s ease-out forwards;
        `;
        overlay.appendChild(ember);
        setTimeout(() => ember.remove(), 5000);
    }, 200);
    fieldIntervals[player].push(emberInterval);
    
    // Subtle heat shimmer overlay
    const shimmer = document.createElement('div');
    shimmer.style.cssText = `
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        background: linear-gradient(0deg, rgba(255,69,0,0.08) 0%, transparent 60%);
        animation: heatShimmer 3s ease-in-out infinite;
        pointer-events: none;
    `;
    overlay.appendChild(shimmer);
}

// 🏜️ Rustfields - sand swirls + dust drift + sepia haze
function createRustfieldsEffect(overlay, player) {
    // Sepia/dust haze at the bottom
    const haze = document.createElement('div');
    haze.style.cssText = `
        position: absolute; bottom: 0; left: 0; width: 100%; height: 40%;
        background: linear-gradient(0deg, rgba(212,165,116,0.15) 0%, transparent 100%);
        pointer-events: none;
        animation: hazeBreath 5s ease-in-out infinite;
    `;
    overlay.appendChild(haze);
    
    // Drifting sand particles
    const sandInterval = setInterval(() => {
        if (activeFieldEffects[player] !== 'skyforge_rustfields') return;
        const sand = document.createElement('div');
        sand.className = 'sand-particle';
        const size = 2 + Math.random() * 4;
        sand.style.width = `${size}px`;
        sand.style.height = `${size}px`;
        sand.style.left = `${-5}%`;
        sand.style.top = `${Math.random() * 100}%`;
        sand.style.opacity = `${0.2 + Math.random() * 0.3}`;
        sand.style.animationDuration = `${4 + Math.random() * 3}s`;
        overlay.appendChild(sand);
        setTimeout(() => sand.remove(), 8000);
    }, 250);
    fieldIntervals[player].push(sandInterval);
    
    // Occasional sand swirl
    const swirlInterval = setInterval(() => {
        if (activeFieldEffects[player] !== 'skyforge_rustfields') return;
        const swirl = document.createElement('div');
        swirl.style.cssText = `
            position: absolute;
            width: 40px; height: 40px;
            border: 2px solid rgba(212,165,116,0.3);
            border-radius: 50%;
            left: ${Math.random() * 80 + 10}%;
            top: ${Math.random() * 60 + 20}%;
            pointer-events: none;
            animation: sandSwirl 2s ease-out forwards;
        `;
        overlay.appendChild(swirl);
        setTimeout(() => swirl.remove(), 2500);
    }, 3000);
    fieldIntervals[player].push(swirlInterval);
}

// 🌫️ Lowlands Mist - creeping green/purple fog + toxic bubbles
function createLowlandsMistEffect(overlay, player) {
    // Multiple fog layers for depth
    for (let layer = 0; layer < 3; layer++) {
        const fogBase = document.createElement('div');
        const opacity = 0.06 + layer * 0.03;
        fogBase.style.cssText = `
            position: absolute; bottom: ${layer * 15}%; left: 0; width: 100%; height: 50%;
            background: linear-gradient(0deg, rgba(100,60,120,${opacity}) 0%, transparent 100%);
            pointer-events: none;
            animation: fogLayerDrift ${8 + layer * 3}s ease-in-out infinite alternate;
        `;
        overlay.appendChild(fogBase);
    }
    
    // Drifting fog clouds
    const fogInterval = setInterval(() => {
        if (activeFieldEffects[player] !== 'miasma_lowlands_mist') return;
        const fog = document.createElement('div');
        fog.className = 'fog-particle';
        const size = 80 + Math.random() * 60;
        fog.style.width = `${size}px`;
        fog.style.height = `${size}px`;
        const green = Math.random() > 0.4;
        fog.style.background = green
            ? `radial-gradient(circle, rgba(100,180,100,0.25), transparent)`
            : `radial-gradient(circle, rgba(139,71,137,0.3), transparent)`;
        fog.style.left = `-${size}px`;
        fog.style.top = `${Math.random() * 80 + 10}%`;
        fog.style.animationDuration = `${8 + Math.random() * 5}s`;
        overlay.appendChild(fog);
        setTimeout(() => fog.remove(), 14000);
    }, 1800);
    fieldIntervals[player].push(fogInterval);
    
    // Occasional toxic bubble
    const bubbleInterval = setInterval(() => {
        if (activeFieldEffects[player] !== 'miasma_lowlands_mist') return;
        const bubble = document.createElement('div');
        const size = 6 + Math.random() * 8;
        bubble.style.cssText = `
            position: absolute;
            width: ${size}px; height: ${size}px;
            border: 1px solid rgba(100,200,100,0.4);
            border-radius: 50%;
            background: rgba(100,200,100,0.1);
            left: ${Math.random() * 90 + 5}%;
            bottom: 0;
            pointer-events: none;
            animation: toxicBubbleRise ${3 + Math.random() * 3}s ease-out forwards;
        `;
        overlay.appendChild(bubble);
        setTimeout(() => bubble.remove(), 6500);
    }, 2500);
    fieldIntervals[player].push(bubbleInterval);
}

// 🧪 Blight Pools - bubbling green ooze + drip + poison gas wisps
function createBlightPoolsEffect(overlay, player) {
    // Ooze pool base
    const pool = document.createElement('div');
    pool.style.cssText = `
        position: absolute; bottom: 0; left: 5%; width: 90%; height: 20%;
        background: linear-gradient(0deg, rgba(90,138,0,0.2) 0%, transparent 100%);
        border-radius: 50% 50% 0 0;
        pointer-events: none;
        animation: oozePoolPulse 4s ease-in-out infinite;
    `;
    overlay.appendChild(pool);
    
    // Rising bubbles
    const bubbleInterval = setInterval(() => {
        if (activeFieldEffects[player] !== 'miasma_blight_pools') return;
        const bubble = document.createElement('div');
        bubble.className = 'ooze-bubble';
        const size = 8 + Math.random() * 12;
        bubble.style.width = `${size}px`;
        bubble.style.height = `${size}px`;
        bubble.style.left = `${Math.random() * 80 + 10}%`;
        bubble.style.bottom = '5%';
        bubble.style.animationDuration = `${2 + Math.random() * 2}s`;
        overlay.appendChild(bubble);
        setTimeout(() => bubble.remove(), 4500);
    }, 400);
    fieldIntervals[player].push(bubbleInterval);
    
    // Poison gas wisps
    const wispInterval = setInterval(() => {
        if (activeFieldEffects[player] !== 'miasma_blight_pools') return;
        const wisp = document.createElement('div');
        wisp.style.cssText = `
            position: absolute;
            width: ${30 + Math.random() * 30}px;
            height: ${20 + Math.random() * 20}px;
            background: radial-gradient(ellipse, rgba(90,138,0,0.2), transparent);
            border-radius: 50%;
            left: ${Math.random() * 80 + 10}%;
            bottom: 15%;
            pointer-events: none;
            animation: poisonWispRise ${3 + Math.random() * 2}s ease-out forwards;
        `;
        overlay.appendChild(wisp);
        setTimeout(() => wisp.remove(), 5500);
    }, 1200);
    fieldIntervals[player].push(wispInterval);
}

// 🌧️ Rotfall Expanse - acid rain + splash + withering leaf particles
function createRotfallExpanseEffect(overlay, player) {
    // Acid rain drops
    const rainInterval = setInterval(() => {
        if (activeFieldEffects[player] !== 'miasma_rotfall_expanse') return;
        const rain = document.createElement('div');
        rain.className = 'rain-drop';
        rain.style.left = `${Math.random() * 100}%`;
        rain.style.top = '-20px';
        rain.style.animationDuration = `${0.8 + Math.random() * 0.6}s`;
        overlay.appendChild(rain);
        
        // Splash on impact
        const splashDelay = parseFloat(rain.style.animationDuration) * 900;
        setTimeout(() => {
            if (activeFieldEffects[player] !== 'miasma_rotfall_expanse') return;
            const splash = document.createElement('div');
            splash.style.cssText = `
                position: absolute;
                width: 6px; height: 3px;
                background: rgba(200,168,0,0.5);
                border-radius: 50%;
                left: ${rain.style.left};
                bottom: 5%;
                pointer-events: none;
                animation: acidSplash 0.4s ease-out forwards;
            `;
            overlay.appendChild(splash);
            setTimeout(() => splash.remove(), 500);
        }, splashDelay);
        
        setTimeout(() => rain.remove(), 2000);
    }, 80);
    fieldIntervals[player].push(rainInterval);
    
    // Withering leaf particles
    const leafInterval = setInterval(() => {
        if (activeFieldEffects[player] !== 'miasma_rotfall_expanse') return;
        const leaf = document.createElement('div');
        leaf.style.cssText = `
            position: absolute;
            width: 8px; height: 6px;
            background: ${Math.random() > 0.5 ? '#8a7a00' : '#6a5a00'};
            border-radius: 0 50% 50% 50%;
            left: ${Math.random() * 100}%;
            top: -10px;
            pointer-events: none;
            opacity: 0.5;
            animation: leafWither ${4 + Math.random() * 3}s ease-in forwards;
        `;
        overlay.appendChild(leaf);
        setTimeout(() => leaf.remove(), 8000);
    }, 800);
    fieldIntervals[player].push(leafInterval);
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
            stopFieldEffects('your');
        }, 600);
    } else {
        stopFieldEffects('your');
    }
}
