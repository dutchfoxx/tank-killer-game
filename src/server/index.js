import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameEngine } from './gameEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, '../../public')));
app.use('/assets', express.static(path.join(__dirname, '../../assets')));
app.use('/src', express.static(path.join(__dirname, '../')));

// Game engine instance
const gameEngine = new GameEngine();
gameEngine.start();

// Connection counters for reduced logging
let connectionLogCounter = 0;
let disconnectionLogCounter = 0;

// Socket.io connection handling
io.on('connection', (socket) => {
  // Reduced connection logging to prevent spam
  connectionLogCounter++;
  
  if (connectionLogCounter % 5 === 0) { // Log every 5th connection
    console.log(`Client connected: ${socket.id} (connection #${connectionLogCounter})`);
  }

  // Handle player join
  socket.on('join', (data) => {
    const { callname, tankColor, tankCamo, teamName } = data;
    
    // Convert team name to team object
    const teamMap = {
      'NATO': { name: 'NATO', color: '#0033A0' },
      'CSTO': { name: 'CSTO', color: '#FFC700' },
      'PLA': { name: 'PLA', color: '#DE2910' }
    };
    const team = teamMap[teamName] || teamMap['NATO'];
    
    // Check if player already exists (reconnection)
    let playerId = socket.id;
    const existingPlayer = gameEngine.gameState.players.get(playerId);
    
    
    
    if (!existingPlayer) {
      // New player
      
      const { player, tank } = gameEngine.addPlayer(playerId, callname, tankColor, tankCamo, team);
      
      socket.emit('joined', { playerId, player, tank });
      console.log(`Player ${callname} joined the game`);
      
      // Force immediate broadcast of updated game state to all clients
      const gameState = gameEngine.getGameState();
      
      io.emit('gameState', gameState);
    } else {
      // Reconnection
      
      socket.emit('reconnected', { playerId, player: existingPlayer });
      console.log(`Player ${existingPlayer.callname} reconnected`);
    }

    // Send current game state to the joining player
    const gameState = gameEngine.getGameState();
    socket.emit('gameState', gameState);
  });

  // Handle player input
  socket.on('playerInput', (data) => {
    const { movement, rotation, shoot } = data;

    gameEngine.updatePlayerInput(socket.id, { movement, rotation, shoot });
  });

  // Handle AI toggle
  socket.on('toggleAI', (data) => {

    
    const { enabled } = data;
    if (enabled) {
      const aiId = gameEngine.addAITank();
      socket.emit('aiAdded', { aiId });
    } else {
      // Remove the most recent AI tank
      const aiTanks = Array.from(gameEngine.gameState.tanks.keys())
        .filter(id => id.startsWith('ai_'));
      
      if (aiTanks.length > 0) {
        const aiId = aiTanks[aiTanks.length - 1];
        gameEngine.removeAITank(aiId);
        socket.emit('aiRemoved', { aiId });
      }
    }
    

  });

  // Handle AI settings application
  socket.on('applyAISettings', (data) => {

    const { aiCount, aiLevel } = data;
    
    // Remove all existing AI tanks first
    const existingAiTanks = Array.from(gameEngine.gameState.tanks.keys())
      .filter(id => id.startsWith('ai_'));
    
    existingAiTanks.forEach(aiId => {
      gameEngine.removeAITank(aiId);
      socket.emit('aiRemoved', { aiId });
    });
    
    // Add new AI tanks based on count
    for (let i = 0; i < aiCount; i++) {
      const aiId = gameEngine.addAITank(aiLevel);
      socket.emit('aiAdded', { aiId });

    }
    

  });

  // Handle balance update
  socket.on('updateSettings', (data) => {
    // This would update game parameters
    // For now, just acknowledge
    socket.emit('settingsUpdated', { success: true });
  });

  // Handle apply settings (update settings without forcing reconnects)
  socket.on('applySettings', (data) => {

    
    console.log('Applying new settings:', data);
    gameEngine.updateSettings(data);
    
    // Only reset if specifically requested or if it's a major structural change
    const needsReset = data.forceReset || 
                      (data.treeParams && (data.treeParams.minTrees !== undefined || 
                                          data.treeParams.maxTrees !== undefined ||
                                          data.treeParams.clustering !== undefined));
    
    if (needsReset) {
      console.log('Resetting game due to structural changes');
      gameEngine.resetGame();
      
      // Only emit settings updated, no forced reconnection
      io.emit('settingsApplied', { message: 'Game settings updated and reset' });
    } else {
      // Just update settings without reset
      console.log('Settings updated without reset');
      io.emit('settingsApplied', { message: 'Game settings updated' });
    }
    
    console.log('[SERVER DEBUG] Game state after settings apply:', {
      trees: gameEngine.gameState.trees.length,
      tanks: gameEngine.gameState.tanks.size,
      bullets: gameEngine.gameState.bullets.length,
      upgrades: gameEngine.gameState.upgrades.length
    });
  });

  // Handle game reset
  socket.on('resetGame', () => {
    // Reset the game engine
    gameEngine.resetGame();
    
    // Notify all clients that the game has been reset
    io.emit('gameReset', { message: 'Game has been reset' });
  });

  // Send balance settings to new client
  socket.emit('balanceSettings', gameEngine.gameSettings.attributeLimits);

  // Handle damage feedback
  socket.on('damageTaken', () => {
    // Player took damage, trigger feedback
    socket.emit('damageFeedback');
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    // Reduced disconnection logging to prevent spam
    disconnectionLogCounter++;
    
    if (disconnectionLogCounter % 5 === 0) { // Log every 5th disconnection
      console.log(`Client disconnected: ${socket.id} (disconnection #${disconnectionLogCounter})`);
    }
    gameEngine.removePlayer(socket.id);
    
    // Notify other clients
    socket.broadcast.emit('playerLeft', { playerId: socket.id });
  });

  // Handle battlefield page requests
  socket.on('requestGameState', () => {
    socket.emit('gameState', gameEngine.getGameState());
    // Also send balance settings to battlefield
    socket.emit('balanceSettings', gameEngine.gameSettings.attributeLimits);
  });

  // Handle controller page requests
  socket.on('requestPlayerState', () => {
    const playerState = gameEngine.getPlayerGameState(socket.id);
    if (playerState) {
      socket.emit('playerState', playerState);
    }
  });

  // Handle set player attributes
  socket.on('setPlayerAttributes', (attributes) => {

    // Reduced debug logging to prevent spam
    console.log(`Setting attributes for player ${socket.id}`);
    
    try {
      gameEngine.setPlayerAttributes(attributes);
          socket.emit('attributesSet', { success: true });
    } catch (error) {
      console.error('Error in setPlayerAttributes:', error);
      socket.emit('attributesSet', { success: false, error: error.message });
    }
    

  });

  // Handle set player attribute limits (min/max balance settings)
  socket.on('setPlayerAttributeLimit', (attributeUpdate) => {
    console.log(`Setting attribute limit for player ${socket.id}`);
    
    try {
      gameEngine.setPlayerAttributeLimit(attributeUpdate.attributeName, attributeUpdate.type, attributeUpdate.value);
      // Send updated balance settings to all clients
      const balanceSettings = gameEngine.gameSettings.attributeLimits;
      io.emit('balanceSettings', balanceSettings);
      
      socket.emit('attributeLimitSet', { success: true });
    } catch (error) {
      console.error('Error in setPlayerAttributeLimit:', error);
      socket.emit('attributeLimitSet', { success: false, error: error.message });
    }
    
    // Removed excessive debug logging
  });
});

// Broadcast game state to all clients every 50ms (20 FPS for network updates)
setInterval(() => {
  const gameState = gameEngine.getGameState();
  io.emit('gameState', gameState);
}, 50);

// Broadcast player states to controllers every 100ms
setInterval(() => {
  for (const [playerId, player] of gameEngine.gameState.players) {
    const playerState = gameEngine.getPlayerGameState(playerId);
    if (playerState) {
      io.to(playerId).emit('playerState', playerState);
    }
  }
}, 100);

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

app.get('/battlefield', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/battlefield.html'));
});

app.get('/controller', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/controller.html'));
});

app.get('/shell', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/shell.html'));
});

app.get('/tank', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/tank.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    players: gameEngine.gameState.players.size,
    tanks: gameEngine.gameState.tanks.size,
    shells: gameEngine.gameState.shells.length,
    upgrades: gameEngine.gameState.upgrades.length,
    trees: gameEngine.gameState.trees.length
  });
});

// Balance endpoint
app.get('/settings', (req, res) => {
  res.json({
    gameParams: {
      respawnTime: 5000,
      reloadTime: 1000,
      acceleration: 0.1,
      shellLifetime: 1000,
      damageFeedbackDuration: 300,
      gasolineSpeedPenalty: 0.5
    },
    damageParams: {
      health: 1,
      speed: 5,
      rotation: 5,
      kinetics: 10,
      gasoline: 5
    },
    upgradeTypes: {
      speed: { value: 20, count: 1 },
      gasoline: { value: 80, count: 1 },
      rotation: { value: 20, count: 1 },
      ammunition: { value: 7, count: 2 },
      kinetics: { value: 30, count: 1 },
      health: { value: 10, count: 0 }
    },
    treeParams: {
  minTrees: 10,
  maxTrees: 25,
  treeSize: 36, // Increased by 20% from 30
  treeSizeVariance: 18, // Increased by 20% from 15
  clusterGroups: 1, // Number of cluster groups
  clustering: 0 // 0 = random, 100 = highly clustered
},
    upgradeParams: {
  size: 22.5,
  rotationRange: 30
}
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Tank Killer server running on port ${PORT}`);
  console.log(`Battlefield: http://localhost:${PORT}/battlefield`);
  console.log(`Controller: http://localhost:${PORT}/controller`);
  console.log(`Shell Designer: http://localhost:${PORT}/shell`);
  console.log(`Tank Designer: http://localhost:${PORT}/tank`);
}); 