// The Seventh Sanctum - Game Client JavaScript

let gameState = null;
let gameId = null;
let selectedCard = null;

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
    addLog("AI is thinking...");
    
    // AI just advances through phases quickly
    setTimeout(async () => {
        await advancePhase();
    }, 500);
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
document.getElementById('new-game-btn').addEventListener('click', () => location.reload());

// Start game on load
window.addEventListener('load', initGame);
