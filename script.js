// --- Game State Variables (Client-side) ---
let socket = null;
let player_id = null;
let num_players = null;
let grid_size = 10;
let total_grapes = grid_size * grid_size;

// --- NEW: Multiple poison indices ---
let poison_indices = new Set(); // Store multiple poison indices (known by client after start_game, but hidden until game_over)
let poison_selection_phase = false; // Is the game in the poison selection phase?
let has_my_poison_been_chosen = false; // Has THIS specific client chosen their poison?
// --- END NEW ---

let all_poisons_set = false; // Corresponds to server's poison_set
let current_turn_player_id = null;
let taken_grapes = [];

// --- DOM Elements ---
const statusLabel = document.getElementById('status-label');
const gameBoard = document.getElementById('game-board');
const gameLog = document.getElementById('game-log');
const quitButton = document.getElementById('quit-button');
// REMOVED: const restartButton = document.getElementById('restart-button');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // --- START: WebSocket Connection ---
    // IMPORTANT: Replace 'wss://YOUR_NGROK_WEBSOCKET_URL_HERE' with the actual ngrok URL
    // that your ngrok client provides when you run 'ngrok http 5000'.
    // It will look something like 'wss://<random_string>.ngrok-free.app'
    // or 'ws://<random_string>.ngrok-free.app'. Make sure to use wss:// if ngrok gives you https://
    
    try {
        socket = new WebSocket('wss://a51f-114-130-144-194.ngrok-free.app'); // <<< CHANGE THIS LINE TO YOUR CURRENT NGROK URL
        
        socket.onopen = (event) => {
            statusLabel.textContent = "Connected to game server.";
            logMessage("WebSocket connected successfully.");
            quitButton.disabled = false;
            // REMOVED: restartButton.disabled = false;
        };

        socket.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            handleServerMessage(msg); // Call the main message handler
        };

        socket.onclose = (event) => {
            statusLabel.textContent = "Disconnected. Game Over.";
            logMessage(`Disconnected from server. Code: ${event.code}. Reason: ${event.reason}`);
            endGame(); 
        };

        socket.onerror = (error) => {
            logMessage(`WebSocket error: ${error.message}`);
            statusLabel.textContent = "Connection Error!";
            endGame(); 
        };
    } catch (error) {
        logMessage(`Error creating WebSocket: ${error.message}`);
        statusLabel.textContent = "Failed to connect!";
        endGame(); 
    }
    // --- END: WebSocket Connection ---


    // Populate the game board with grape buttons
    for (let i = 0; i < total_grapes; i++) {
        const button = document.createElement('button');
        button.classList.add('grape-button');
        button.dataset.index = i;
        button.disabled = true; // Disabled until game starts or it's player's turn/poison selection

        const img = document.createElement('img');
        img.src = 'grape.png'; // Make sure grape.png is in the same directory as index.html
        img.alt = `Grape ${i + 1}`;
        button.appendChild(img);

        button.addEventListener('click', () => onGrapeClick(i));
        gameBoard.appendChild(button);
    }

    quitButton.addEventListener('click', quitGame);
    // REMOVED: restartButton.addEventListener('click', requestRestart);
});


// --- Server Communication ---
function sendToServer(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
    } else {
        logMessage("Not connected to server. Message not sent.");
    }
}

// --- Server Message Handling ---
function handleServerMessage(msg) {
    const type = msg.type;

    if (type === 'welcome') {
        player_id = msg.player_id;
        num_players = msg.num_players;
        statusLabel.textContent = `Welcome, Player ${player_id + 1} of ${num_players}! Waiting for other players...`;
        logMessage(`You are Player ${player_id + 1}.`);

        resetClientUI(false); // Reset UI but don't clear log or enable restart
        
    } else if (type === 'initial_setup') {
        poison_selection_phase = true;
        has_my_poison_been_chosen = false; // Reset for a new phase
        logMessage('Poison selection phase started.');
        updateGUI();
    
    } else if (type === 'poison_selection_update') {
        const selected_index = msg.selected_index;
        const player_who_chose = msg.player_who_chose;
        logMessage(`Player ${player_who_chose + 1} has selected a poison grape.`);
        
        if (!has_my_poison_been_chosen) {
            updateGUI(); // Refresh GUI to show valid choices
        }

    } else if (type === 'start_game') {
        poison_indices = new Set(msg.poison_indices); // Client now knows all poison locations
        all_poisons_set = true;
        current_turn_player_id = msg.turn;
        taken_grapes = msg.taken;
        poison_selection_phase = false; // End poison selection phase
        logMessage(`Game started! It's Player ${current_turn_player_id + 1}'s turn.`);
        updateGUI();

    } else if (type === 'update') {
        current_turn_player_id = msg.turn;
        taken_grapes = msg.taken;
        const last_pick_index = msg.last_pick_index;
        const last_player_id = msg.last_player_id;
        if (last_pick_index !== undefined) {
            logMessage(`Player ${last_player_id + 1} picked grape #${last_pick_index + 1}.`);
        }
        updateGUI();

    } else if (type === 'game_over') {
        const loser_ids = msg.loser_ids;
        poison_indices = new Set(msg.all_poison_indices); // Ensure client has all poison locations from server
        
        // Reveal all poison grapes only at game over
        poison_indices.forEach(idx => {
            const grapeButton = gameBoard.children[idx];
            if (grapeButton) {
                grapeButton.classList.add('poisoned');
            }
        });

        if (loser_ids.includes(player_id)) {
            logMessage(`You picked a poisoned grape! You lose.`);
            statusLabel.textContent = `Game Over: You lose!`;
            alert("Game Over! You picked a poisoned grape. You lose.");
        } else {
            logMessage(`Player(s) ${loser_ids.map(id => id + 1).join(', ')} picked poison. You win!`);
            statusLabel.textContent = `Game Over: You win!`;
            alert(`Game Over! Player(s) ${loser_ids.map(id => id + 1).join(', ')} picked poison. You win!`);
        }
        endGame();

    } else if (type === 'draw') {
        logMessage("Draw: all safe grapes have been picked.");
        statusLabel.textContent = "Game Over: Draw!";
        alert("All safe grapes have been picked. It's a draw!");
        endGame();
    
    } else if (type === 'player_disconnected') {
        const disconnected_player_id = msg.disconnected_player_id;
        logMessage(`Player ${disconnected_player_id + 1} disconnected. Game ended.`);
        statusLabel.textContent = `Game Over: Player ${disconnected_player_id + 1} disconnected.`;
        alert(`Player ${disconnected_player_id + 1} disconnected. The game has ended.`);
        endGame();

    } else if (type === 'error') {
        logMessage(`SERVER ERROR: ${msg.message}`);
        statusLabel.textContent = "Error from server!";
    }
    // REMOVED: else if (type === 'game_restarted') handler
}

// --- GUI Update Logic ---
function updateGUI() {
    for (let i = 0; i < total_grapes; i++) {
        const button = gameBoard.children[i];
        
        // Clear previous states (EXCEPT 'poisoned' class here, it's applied only on game_over)
        // Ensure 'poisoned' class is removed on any UI update that isn't game_over
        button.classList.remove('taken', 'current-player-turn', 'poison-selection-active', 'poisoned');
        button.disabled = true; // Default to disabled

        // Apply 'taken' state if grape is taken
        if (taken_grapes[i]) {
            button.classList.add('taken');
            button.disabled = true;
        }
        
        // --- NEW Poison Selection Phase UI ---
        if (poison_selection_phase) {
            statusLabel.textContent = "POISON SELECTION PHASE: Select a grape to poison.";
            if (player_id !== null && !has_my_poison_been_chosen) {
                // Enable for selection if not taken and NOT already chosen as poison by self/others
                if (!taken_grapes[i] && !poison_indices.has(i)) {
                    button.disabled = false;
                    button.classList.add('poison-selection-active'); // Highlight for poison selection
                } else if (poison_indices.has(i)) {
                    // If it's a poison grape already (from another player), it should be disabled for selection
                    button.disabled = true; // Still disabled but not red
                }
            } else if (player_id !== null && has_my_poison_been_chosen) {
                statusLabel.textContent = `POISON SELECTION PHASE: Waiting for others to choose poison...`;
            }
        }
        // --- End NEW Poison Selection Phase UI ---
        
        // Normal game turn logic (after poison selection phase and all poisons set)
        else if (all_poisons_set && current_turn_player_id !== null) {
            if (current_turn_player_id === player_id) {
                statusLabel.textContent = "Your Turn! Pick a grape.";
                // Can only pick untaken, non-poisoned grapes
                if (!taken_grapes[i] && !poison_indices.has(i)) {
                    button.disabled = false;
                    button.classList.add('current-player-turn');
                }
            } else {
                statusLabel.textContent = `Player ${current_turn_player_id + 1}'s Turn.`;
            }
        }
    }
}

// --- Grape Click Handler ---
function onGrapeClick(index) {
    if (socket && socket.readyState !== WebSocket.OPEN) {
        logMessage("Not connected to server.");
        return;
    }

    // --- NEW Poison Selection Handling ---
    if (poison_selection_phase && player_id !== null && !has_my_poison_been_chosen) {
        if (taken_grapes[index]) {
            logMessage(`Grape #${index + 1} is already taken and cannot be poisoned.`);
            return;
        }
        if (poison_indices.has(index)) { // Prevent selecting an already chosen poison (from other players)
            logMessage(`Grape #${index + 1} has already been chosen as poison by another player.`);
            return;
        }
        
        sendToServer({ type: 'poison_select', player_id: player_id, index: index });
        logMessage(`You selected grape #${index + 1} as your poison.`);
        has_my_poison_been_chosen = true; // Mark that this client has chosen
        // Temporarily disable all buttons after your pick until server confirms game start or updates status
        Array.from(gameBoard.children).forEach(button => {
            button.disabled = true;
            button.classList.remove('poison-selection-active'); // Remove highlight after selection
        });
    } 
    // --- End NEW Poison Selection Handling ---

    // Normal Game Picking Logic
    else if (all_poisons_set && current_turn_player_id === player_id) {
        if (taken_grapes[index]) {
            logMessage(`Grape #${index + 1} is already taken.`);
            return;
        }
        sendToServer({ type: 'pick_select', player_id: player_id, index: index });
        logMessage(`You picked grape #${index + 1}.`);
        Array.from(gameBoard.children).forEach(button => button.disabled = true);
    } else {
        logMessage('It\'s not your turn, or game not ready for picking.');
    }
}

function logMessage(message) {
    const p = document.createElement('p');
    p.textContent = message;
    gameLog.appendChild(p);
    gameLog.scrollTop = gameLog.scrollHeight;
}

function endGame() {
    Array.from(gameBoard.children).forEach(button => button.disabled = true);
    quitButton.disabled = true; // Disable quit after game over
    // REMOVED: restartButton.disabled = false;
}

function quitGame() {
    if (socket) {
        socket.close(1000, "Player quit game"); // Code 1000 for normal closure
    }
    endGame(); // Call endGame to update UI
    statusLabel.textContent = "Game Over: You quit.";
    logMessage("You quit the game.");
    alert("You have quit the game.");
}

// REMOVED: requestRestart function

// Function to reset client-side UI and game state (now just for initial setup)
function resetClientUI(clearLog = false) {
    // Reset client-side game state variables
    poison_indices.clear();
    poison_selection_phase = false;
    has_my_poison_been_chosen = false;
    all_poisons_set = false;
    current_turn_player_id = null;
    taken_grapes = new Array(total_grapes).fill(false); // Reset all grapes to not taken

    // Clear the board visually and enable/disable buttons
    for (let i = 0; i < total_grapes; i++) {
        const button = gameBoard.children[i];
        // Ensure all classes are removed, including 'poisoned' from previous game
        button.classList.remove('taken', 'current-player-turn', 'poison-selection-active', 'poisoned'); 
        button.disabled = true; // Disable all until server sends initial_setup
    }

    if (clearLog) {
        gameLog.innerHTML = ''; // Clear game log
    }
    
    statusLabel.textContent = "Waiting for server to start a new game...";
    quitButton.disabled = false; // Re-enable quit button
    // REMOVED: restartButton.disabled = true;
}