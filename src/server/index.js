import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameEngine } from './gameEngine.js';
import { DAMAGE_PARAMS } from '../shared/constants.js';
import { getAllTerrainMaps, getTerrainMap } from '../shared/terrainMaps.js';

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

  // Handle terrain map change
  socket.on('changeTerrainMap', (data) => {
    const { mapName } = data;
    const success = gameEngine.changeTerrainMap(mapName);
    if (success) {
      // Broadcast updated game state to all clients
      const gameState = gameEngine.getGameState();
      io.emit('gameState', gameState);
      io.emit('terrainMapChanged', { mapName });
    }
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



  // Handle game reset
  socket.on('resetGame', () => {
    // Reset the game engine
    gameEngine.resetGame();
    
    // Notify all clients that the game has been reset
    io.emit('gameReset', { message: 'Game has been reset' });
  });

  // Handle game reset with new AI level
  socket.on('resetGameWithAILevel', (data) => {
    const { aiLevel } = data;
    
    // Reset the game engine
    gameEngine.resetGame();
    
    // Notify all clients that the game has been reset
    io.emit('gameReset', { message: 'Game has been reset with new AI level', aiLevel });
  });



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

// Broadcast game state to all clients every 100ms (10 FPS for network updates) with delta compression
setInterval(() => {
  const deltaState = gameEngine.getDeltaGameState();
  if (deltaState) {
    io.emit('gameState', deltaState);
  }
}, 100);

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

app.get('/terrain-builder', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/terrain-builder.html'));
});

// Terrain maps API endpoint
app.get('/api/terrain-maps', (req, res) => {
  const terrainMaps = getAllTerrainMaps();
  res.json(terrainMaps);
});

// Individual terrain map API endpoint
app.get('/api/terrain-maps/:mapId', (req, res) => {
  const mapId = req.params.mapId;
  const terrainMap = getTerrainMap(mapId);
  if (terrainMap) {
    res.json(terrainMap);
  } else {
    res.status(404).json({ error: 'Terrain map not found' });
  }
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



const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Tank Killer server running on port ${PORT}`);
  console.log(`Battlefield: http://localhost:${PORT}/battlefield`);
  console.log(`Controller: http://localhost:${PORT}/controller`);
  console.log(`Shell Designer: http://localhost:${PORT}/shell`);
  console.log(`Tank Designer: http://localhost:${PORT}/tank`);
  console.log(`Terrain Builder: http://localhost:${PORT}/terrain-builder`);
}); 