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

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

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
    
    console.log(`[DEBUG] Player join - Trees before: ${gameEngine.gameState.trees.length}`);
    console.log(`[DEBUG] Player ID: ${playerId}`);
    console.log(`[DEBUG] Existing player: ${existingPlayer ? 'YES' : 'NO'}`);
    
    if (!existingPlayer) {
      // New player
      console.log(`[DEBUG] Adding new player: ${callname}`);
      const { player, tank } = gameEngine.addPlayer(playerId, callname, tankColor, tankCamo, team);
      console.log(`[DEBUG] Sending 'joined' event to client`);
      socket.emit('joined', { playerId, player, tank });
      console.log(`Player ${callname} joined the game`);
      
      // Force immediate broadcast of updated game state to all clients
      const gameState = gameEngine.getGameState();
      console.log(`[DEBUG] Broadcasting updated gameState with ${gameState.trees.length} trees and ${gameState.tanks.length} tanks`);
      io.emit('gameState', gameState);
    } else {
      // Reconnection
      console.log(`[DEBUG] Player reconnecting: ${existingPlayer.callname}`);
      console.log(`[DEBUG] Sending 'reconnected' event to client`);
      socket.emit('reconnected', { playerId, player: existingPlayer });
      console.log(`Player ${existingPlayer.callname} reconnected`);
    }

    console.log(`[DEBUG] Player join - Trees after: ${gameEngine.gameState.trees.length}`);
    
    // Send current game state to the joining player
    const gameState = gameEngine.getGameState();
    console.log(`[DEBUG] Sending gameState with ${gameState.trees.length} trees`);
    socket.emit('gameState', gameState);
  });

  // Handle player input
  socket.on('playerInput', (data) => {
    const { movement, rotation, shoot } = data;
    console.log(`Player ${socket.id} input:`, { movement, rotation, shoot });
    gameEngine.updatePlayerInput(socket.id, { movement, rotation, shoot });
  });

  // Handle AI toggle
  socket.on('toggleAI', (data) => {
    console.log('[SERVER DEBUG] toggleAI event received:', data);
    console.log('[SERVER DEBUG] Current game state before AI toggle:', {
      trees: gameEngine.gameState.trees.length,
      tanks: gameEngine.gameState.tanks.size,
      shells: gameEngine.gameState.shells.length,
      upgrades: gameEngine.gameState.upgrades.length
    });
    
    const { enabled } = data;
    if (enabled) {
      console.log('[SERVER DEBUG] Adding AI tank...');
      const aiId = gameEngine.addAITank();
      socket.emit('aiAdded', { aiId });
      console.log('[SERVER DEBUG] AI tank added:', aiId);
    } else {
      console.log('[SERVER DEBUG] Removing AI tank...');
      // Remove the most recent AI tank
      const aiTanks = Array.from(gameEngine.gameState.tanks.keys())
        .filter(id => id.startsWith('ai_'));
      
      if (aiTanks.length > 0) {
        const aiId = aiTanks[aiTanks.length - 1];
        gameEngine.removeAITank(aiId);
        socket.emit('aiRemoved', { aiId });
        console.log('[SERVER DEBUG] AI tank removed:', aiId);
      }
    }
    
    console.log('[SERVER DEBUG] Game state after AI toggle:', {
      trees: gameEngine.gameState.trees.length,
      tanks: gameEngine.gameState.tanks.size,
      shells: gameEngine.gameState.shells.length,
      upgrades: gameEngine.gameState.upgrades.length
    });
  });

  // Handle AI settings application
  socket.on('applyAISettings', (data) => {
    console.log('[SERVER DEBUG] applyAISettings event received:', data);
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
      console.log(`[SERVER DEBUG] AI tank ${i + 1}/${aiCount} added:`, aiId);
    }
    
    console.log('[SERVER DEBUG] AI settings applied - AI count:', aiCount, 'Level:', aiLevel);
  });

  // Handle balance update
  socket.on('updateSettings', (data) => {
    // This would update game parameters
    // For now, just acknowledge
    socket.emit('settingsUpdated', { success: true });
  });

  // Handle apply settings (update settings without forcing reconnects)
  socket.on('applySettings', (data) => {
    console.log('[SERVER DEBUG] applySettings event received:', data);
    console.log('[SERVER DEBUG] Current game state before settings apply:', {
      trees: gameEngine.gameState.trees.length,
      tanks: gameEngine.gameState.tanks.size,
      shells: gameEngine.gameState.shells.length,
      upgrades: gameEngine.gameState.upgrades.length
    });
    
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
    console.log('[SERVER DEBUG] resetGame event received');
    console.log('[SERVER DEBUG] Current game state before reset:', {
      trees: gameEngine.gameState.trees.length,
      tanks: gameEngine.gameState.tanks.size,
      bullets: gameEngine.gameState.bullets.length,
      upgrades: gameEngine.gameState.upgrades.length
    });
    
    // Reset the game engine
    gameEngine.resetGame();
    
    console.log('[SERVER DEBUG] Game state after reset:', {
      trees: gameEngine.gameState.trees.length,
      tanks: gameEngine.gameState.tanks.size,
      bullets: gameEngine.gameState.bullets.length,
      upgrades: gameEngine.gameState.upgrades.length
    });
    
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
    console.log('Client disconnected:', socket.id);
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
    console.log('=== SERVER: setPlayerAttributes received ===');
    console.log('Socket ID:', socket.id);
    console.log('Attributes received:', attributes);
    console.log('Game engine state before:', {
      players: gameEngine.gameState.players.size,
      tanks: gameEngine.gameState.tanks.size
    });
    
    try {
      gameEngine.setPlayerAttributes(attributes);
      console.log('Game engine setPlayerAttributes completed');
      socket.emit('attributesSet', { success: true });
      console.log('attributesSet response sent to client');
    } catch (error) {
      console.error('Error in setPlayerAttributes:', error);
      socket.emit('attributesSet', { success: false, error: error.message });
    }
    
    console.log('=== SERVER: setPlayerAttributes completed ===');
  });

  // Handle set player attribute limits (min/max balance settings)
  socket.on('setPlayerAttributeLimit', (attributeUpdate) => {
    console.log('=== SERVER: setPlayerAttributeLimit received ===');
    console.log('Socket ID:', socket.id);
    console.log('Attribute update:', attributeUpdate);
    
    try {
      gameEngine.setPlayerAttributeLimit(attributeUpdate.attributeName, attributeUpdate.type, attributeUpdate.value);
      console.log('Game engine setPlayerAttributeLimit completed');
      
      // Send updated balance settings to all clients
      const balanceSettings = gameEngine.gameSettings.attributeLimits;
      io.emit('balanceSettings', balanceSettings);
      console.log('Balance settings broadcast to all clients');
      
      socket.emit('attributeLimitSet', { success: true });
      console.log('attributeLimitSet response sent to client');
    } catch (error) {
      console.error('Error in setPlayerAttributeLimit:', error);
      socket.emit('attributeLimitSet', { success: false, error: error.message });
    }
    
    console.log('=== SERVER: setPlayerAttributeLimit completed ===');
  });
});

// Broadcast game state to all clients every 50ms (20 FPS for network updates)
setInterval(() => {
  const gameState = gameEngine.getGameState();
  // Only log tree count occasionally to avoid spam
  if (Math.random() < 0.01) { // 1% chance to log
    console.log(`[DEBUG] Broadcasting gameState with ${gameState.trees.length} trees and ${gameState.tanks.length} tanks`);
  }
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