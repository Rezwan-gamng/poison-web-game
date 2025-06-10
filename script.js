// --- Game State Variables (Client-side) ---
let socket = null;
let player_id = null;
let num_players = null;
let grid_size = 10;
let total_grapes = grid_size * grid_size;

// --- NEW: Multiple poison indices ---
let poison_indices = new Set(); // Store multiple poison indices
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

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    for (let i = 0; i < total_grapes; i++) {
        const button = document.createElement('button');
        button.classList.add('grape-button');
        button.dataset.index = i;
        button.disabled = true;

        const img = document.createElement('img');
        img.src = 'grape.png';
        img.alt = `Grape ${i + 1}`;
        button.appendChild(img);
        
        button.addEventListener('click', () => onGrapeClick(i));
        gameBoard.appendChild(button);
    }

    connectWebSocket();
    quitButton.addEventListener('click', quitGame);
});

// --- WebSocket Communication ---
function connectWebSocket() {
    socket = new WebSocket('https://c02b-114-130-144-194.ngrok-free.app'); // Use the URL ngrok gives you 

    socket.onopen = (event) => {
        logMessage('Connected to game server.');
        statusLabel.textContent = 'Waiting for all players to connect...';
    };

    socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
    };

    socket.onclose = (event) => {
        logMessage('Disconnected from server. Code: ' + event.code);
        statusLabel.textContent = 'Disconnected. Game Over.';
        endGame();
    };

    socket.onerror = (error) => {
        console.error('WebSocket Error:', error);
        logMessage('WebSocket connection error.');
        endGame();
    };
}

function sendToServer(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
    } else {
        logMessage('Cannot send message: Not connected to server.');
    }
}

// --- Handle Server Messages ---
function handleServerMessage(msg) {
    switch (msg.type) {
        case 'welcome':
            player_id = msg.player_id;
            num_players = msg.num_players;
            logMessage(`Welcome! You are Player ${player_id + 1} of ${num_players}.`);
            taken_grapes = new Array(total_grapes).fill(false);
            updateUI();
            break;

        // --- NEW: Initial setup for poison selection ---
        case 'initial_setup':
            poison_selection_phase = msg.is_poison_selection_phase;
            if (poison_selection_phase) {
                statusLabel.textContent = `Player ${player_id + 1}: Choose your poisoned grape!`;
                logMessage('It\'s time to choose your poisoned grape. Click a grape on the board.');
            }
            updateUI(); // Enable buttons for poison selection
            break;

        // --- NEW: Update during poison selection phase ---
        case 'poison_selection_update':
            logMessage(`Player ${msg.player_who_chose + 1} has chosen their poison grape. (${msg.poisons_set_count}/${msg.total_players_needed} chosen)`);
            if (msg.poisons_set_count < msg.total_players_needed && has_my_poison_been_chosen) {
                statusLabel.textContent = `Waiting for others to choose poison...`;
            }
            updateUI(); // May re-disable buttons if my poison is chosen
            break;

        // --- MODIFIED: Start game now includes multiple poison indices ---
        case 'start_game':
            poison_indices = new Set(msg.poison_indices); // Store multiple
            all_poisons_set = true;
            poison_selection_phase = false; // End this phase
            current_turn_player_id = msg.turn;
            taken_grapes = msg.taken;
            logMessage(`Game started! All ${poison_indices.size} poison grapes have been selected.`);
            updateUI();
            break;

        case 'update':
            current_turn_player_id = msg.turn;
            taken_grapes = msg.taken;
            if (msg.last_pick_index !== undefined) {
                logMessage(`Player ${msg.last_player_id + 1} picked grape #${msg.last_pick_index + 1}.`);
            }
            updateUI();
            break;

        // --- MODIFIED: Game over now shows ALL poison grapes ---
        case 'game_over':
            const loser = msg.loser;
            const poison_idx_picked = msg.poison_index_picked;
            const all_poison_indices_list = msg.all_poison_indices;
            
            // Highlight all poison grapes in red
            all_poison_indices_list.forEach(idx => {
                const poisonGrapeButton = gameBoard.children[idx];
                if (poisonGrapeButton) {
                    poisonGrapeButton.classList.add('poisoned');
                }
            });

            if (loser === player_id) {
                logMessage(`You picked grape #${poison_idx_picked + 1}, which was poisoned. You lose!`);
                alert('Game Over! You picked a poisoned grape. You lose!');
            } else {
                logMessage(`Player ${loser + 1} picked grape #${poison_idx_picked + 1}, which was poisoned. You win!`);
                alert(`Game Over! Player ${loser + 1} picked a poisoned grape. You win!`);
            }
            endGame();
            break;

        case 'draw':
            logMessage('Draw: All safe grapes have been picked!');
            alert('It\'s a Draw! All safe grapes have been picked.');
            endGame();
            break;
        case 'player_disconnected':
            logMessage(`Player ${msg.disconnected_player_id + 1} disconnected. Game ended.`);
            alert(`Player ${msg.disconnected_player_id + 1} disconnected. The game has ended.`);
            endGame();
            break;
        case 'error': // Handle server-side errors (e.g., trying to pick already poisoned grape during selection)
            logMessage(`Error: ${msg.message}`);
            // Re-enable buttons if it was a selection error and it's their turn
            updateUI(); 
            break;
        default:
            logMessage('Unknown message from server: ' + JSON.stringify(msg));
    }
}

// --- UI Updates ---
function updateUI() {
    const buttons = gameBoard.children;

    for (let i = 0; i < total_grapes; i++) {
        const button = buttons[i];
        
        button.classList.remove('taken', 'poisoned'); // Reset for updates
        button.style.backgroundColor = '#800080'; // Default purple color

        if (taken_grapes[i]) {
            button.classList.add('taken');
            button.disabled = true;
        } else {
            button.disabled = true; // Default to disabled
        }

        // --- NEW UI Logic for Poison Selection Phase ---
        if (poison_selection_phase) {
            if (!has_my_poison_been_chosen) {
                // If it's my turn to choose poison and I haven't chosen yet
                if (!taken_grapes[i]) { // Can't select an already picked grape
                    button.disabled = false;
                    button.style.backgroundColor = '#FFA500'; // Orange for selectable poison pick
                }
            } else {
                // If I have chosen my poison, disable my buttons and wait
                button.disabled = true;
            }
        } 
        // --- End NEW UI Logic for Poison Selection Phase ---
        
        // Normal Game Play Phase
        else if (all_poisons_set) { // Only enable if all poisons are set
            const isMyTurn = (current_turn_player_id === player_id);
            if (isMyTurn && !taken_grapes[i]) {
                button.disabled = false;
                button.style.backgroundColor = '#ADD8E6'; // Light blue for current player's turn
            } else if (taken_grapes[i]) {
                 button.classList.add('taken');
                 button.disabled = true;
            } else {
                button.disabled = true;
            }
        }
    }

    // Update status label
    if (poison_selection_phase) {
        if (!has_my_poison_been_chosen) {
            statusLabel.textContent = `Player ${player_id + 1}: Choose your poisoned grape!`;
        } else {
            statusLabel.textContent = `Player ${player_id + 1}: Waiting for others to choose poison...`;
        }
    } else if (all_poisons_set) {
        const currentPlayerDisplayName = (current_turn_player_id + 1);
        const youAreText = `(You are Player ${player_id + 1})`;
        if (current_turn_player_id === player_id) {
            statusLabel.textContent = `Your Turn! ${youAreText}`;
        } else {
            statusLabel.textContent = `Player ${currentPlayerDisplayName}'s turn ${youAreText}`;
        }
    } else {
        // Before game starts / players connect
        statusLabel.textContent = "Waiting for all players to connect...";
    }
}

// --- Game Actions ---
function onGrapeClick(index) {
    // --- NEW: Handle poison selection click ---
    if (poison_selection_phase && !has_my_poison_been_chosen) {
        if (taken_grapes[index]) { // Already picked in this initial state? (shouldn't happen)
            logMessage(`Grape #${index + 1} is already taken.`);
            return;
        }
        sendToServer({ type: 'poison_select', index: index });
        logMessage(`You are choosing grape #${index + 1} as your poison.`);
        has_my_poison_been_chosen = true; // Mark that this client has chosen
        // Temporarily disable all buttons after your pick until server confirms game start or updates status
        Array.from(gameBoard.children).forEach(button => button.disabled = true);
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
    // Optionally change the quit button text or appearance
}

function quitGame() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
    }
    alert('You have quit the game. Refresh the page to play again.');
    window.close();
}