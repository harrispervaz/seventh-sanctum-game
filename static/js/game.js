// The Seventh Sanctum - Game Client JavaScript

let gameState = null;
let gameId = null;
let selectedCard = null;
let attackMode = false;
let selectedAttacker = null;
let pierceMode = false;
let pierceData = null; // {damage, defender_player, attacker_player, attacker_index}

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
    
    gameState.you.hand.forEach((card, index) => {
        console.log(`  Card ${index}:`, card);
        const cardEl = createCardElement(card, true);
        cardEl.addEventListener('click', () => selectCard(card, index));
        handEl.appendChild(cardEl);
    });
    
    console.log('✅ Hand rendered');
}

// Render opponent's hand (card backs)
function renderOpponentHand() {
    const handEl = document.getElementById('opponent-hand');
    handEl.innerHTML = '';
    
    for (let i = 0; i < gameState.opponent.hand_count; i++) {
        const cardBack = document.createElement('div');
        cardBack.className = 'card card-back';
        cardBack.textContent = '?';
        handEl.appendChild(cardBack);
    }
}

// Render battlefield
function renderBattlefield(player, units) {
    for (let i = 0; i < 5; i++) {
        const slot = document.querySelector(`[data-zone="${player}-unit"][data-index="${i}"]`);
        slot.innerHTML = '';
        
        if (units[i]) {
            const isOpponent = player === 'opponent';
            const cardEl = createBattlefieldCard(units[i], isOpponent);
            
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
            right: -5px;
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
        
        statsEl.innerHTML = `
            <div class="stat">
                <div class="stat-label">ATK</div>
                <div class="stat-value atk">${card.atk}</div>
            </div>
            <div class="stat">
                <div class="stat-label">DEF</div>
                <div class="stat-value def">${card.def}</div>
            </div>
            <div class="stat">
                <div class="stat-label">SPD</div>
                <div class="stat-value spd">${card.spd}</div>
            </div>
        `;
        
        cardEl.appendChild(statsEl);
    }
    
    return cardEl;
}

// Render field
function renderField(player, field) {
    const slot = document.querySelector(`[data-zone="${player}-field"]`);
    slot.innerHTML = '';
    
    if (field) {
        const cardEl = createCardElement(field, false, true);
        slot.appendChild(cardEl);
    } else {
        slot.innerHTML = '<small>FIELD</small>';
    }
}

// Render traps
function renderTraps(player, traps) {
    if (player === 'opponent') {
        // Just show count for opponent
        for (let i = 0; i < 3; i++) {
            const slot = document.querySelector(`[data-zone="opponent-trap"][data-index="${i}"]`);
            if (i < traps) {
                slot.innerHTML = '<div class="card trap card-back">?</div>';
            } else {
                slot.innerHTML = '<small>TRAP</small>';
            }
        }
    } else {
        // Show actual traps for you
        for (let i = 0; i < 3; i++) {
            const slot = document.querySelector(`[data-zone="your-trap"][data-index="${i}"]`);
            slot.innerHTML = '';
            
            if (traps[i]) {
                const cardEl = createCardElement(traps[i], false, true);
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
            right: -5px;
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
        
        statsEl.innerHTML = `
            <div class="stat">
                <div class="stat-label">ATK</div>
                <div class="stat-value atk">${card.atk}</div>
            </div>
            <div class="stat">
                <div class="stat-label">DEF</div>
                <div class="stat-value def">${card.def}</div>
            </div>
            <div class="stat">
                <div class="stat-label">SPD</div>
                <div class="stat-value spd">${card.spd}</div>
            </div>
        `;
        
        cardEl.appendChild(statsEl);
    }
    
    return cardEl;
}

// Select a card from hand
function selectCard(card, index) {
    selectedCard = {card, index};
    addLog(`Selected: ${card.name}`);
    
    // Try to play it immediately
    playSelectedCard();
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
    selectedCard = {card, index};
    addLog(`Selected: ${card.name}`);
    
    // Try to play it immediately
    playSelectedCard();
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
        } else {
            addLog(`✅ ${data.result.message}`);
            gameState = data.state;
            updateUI();
        }
        
        selectedCard = null;
    } catch (error) {
        console.error('Error playing card:', error);
        addLog('Error playing card');
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

// Start game on load
window.addEventListener('load', initGame);
