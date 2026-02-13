// The Seventh Sanctum - Game Client JavaScript

let gameState = null;
let gameId = null;
let selectedCard = null;
let attackMode = false;
let selectedAttacker = null;

// Initialize game
async function initGame() {
    try {
        const response = await fetch('/api/new_game', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                faction1: 'Skyforge',
                faction2: 'Miasma'
            })
        });
        
        const data = await response.json();
        gameId = data.game_id;
        gameState = data.state;
        
        updateUI();
        addLog('Game started! You are playing Skyforge vs Miasma AI');
    } catch (error) {
        console.error('Error starting game:', error);
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
    const handEl = document.getElementById('your-hand');
    handEl.innerHTML = '';
    
    gameState.you.hand.forEach((card, index) => {
        const cardEl = createCardElement(card, true);
        cardEl.addEventListener('click', () => selectCard(card, index));
        handEl.appendChild(cardEl);
    });
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
            const cardEl = createCardElement(units[i], false, true);
            
            // Add attack functionality for your units
            if (player === 'your' && attackMode) {
                cardEl.style.cursor = 'pointer';
                cardEl.style.border = '3px solid gold';
                cardEl.addEventListener('click', () => selectAttacker(i));
            }
            
            // Add defend functionality for opponent units
            if (player === 'opponent' && attackMode && selectedAttacker !== null) {
                cardEl.style.cursor = 'crosshair';
                cardEl.style.border = '3px solid red';
                cardEl.addEventListener('click', () => declareAttack(selectedAttacker, i));
            }
            
            slot.appendChild(cardEl);
        } else {
            slot.innerHTML = '<small>UNIT</small>';
        }
    }
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
            
            // Reset attack mode
            attackMode = false;
            selectedAttacker = null;
            document.getElementById('attack-mode-btn').textContent = 'Declare Attacks';
            document.getElementById('attack-mode-btn').classList.remove('btn-danger');
            document.getElementById('attack-mode-btn').classList.add('btn-secondary');
            
            updateUI();
        }
    } catch (error) {
        console.error('Error attacking:', error);
        addLog('Error declaring attack');
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
