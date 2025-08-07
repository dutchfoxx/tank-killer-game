import { GameState, Tank, Shell, Upgrade, Tree, Vector2 } from '../shared/types.js';
import { AIController } from '../shared/ai.js';
import { checkAABBCollision, getRandomPositionAvoidingObstacles } from '../shared/collision.js';
import { 
  GAME_TICK_RATE, 
  UPGRADE_TYPES, 
  TREE_PARAMS, 
  BATTLEFIELD,
  TANK_ATTRIBUTES,
  GAME_PARAMS,
  DAMAGE_PARAMS
} from '../shared/constants.js';

// Tank colors for AI tanks (hardcoded to avoid import issues)
const tankColors = {
    'forest': { hex: '#1f2e23' },
    'desert': { hex: '#D4A574' },
    'marines': { hex: '#333551' },
    'metal': { hex: '#6a6a6a' },
    'tradition': { hex: '#813D30' },
    'plains': { hex: '#50654D' },
    'arctic': { hex: '#cfc4c4' },
    'specops': { hex: '#191A1C' }
};

export class GameEngine {
  constructor() {
    this.gameState = new GameState();
    this.aiControllers = new Map();
    this.lastUpdate = Date.now();
    this.gameLoop = null;
    this.isRunning = false;
    
    // Initialize default settings
    this.gameSettings = {
      gameParams: {
        respawnTime: 5000,
        reloadTime: 1000,
        acceleration: 0.1,
        shellLifetime: 1000,
        gasolinePerUnit: GAME_PARAMS.GASOLINE_PER_UNIT,
        gasolineSpeedPenalty: GAME_PARAMS.GASOLINE_SPEED_PENALTY
      },
      damageParams: {
        health: DAMAGE_PARAMS.HEALTH,
        speed: DAMAGE_PARAMS.SPEED,
        rotation: DAMAGE_PARAMS.ROTATION,
        kinetics: DAMAGE_PARAMS.KINETICS,
        gasoline: DAMAGE_PARAMS.GASOLINE
      },
      upgradeTypes: {
        speed: { count: 1 },
        gasoline: { count: 1 },
        rotation: { count: 1 },
        ammunition: { count: 2 },
        kinetics: { count: 1 },
        health: { count: 0 }
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
      },
      attributeLimits: {
        health: TANK_ATTRIBUTES.HEALTH,
        speed: TANK_ATTRIBUTES.SPEED,
        gasoline: TANK_ATTRIBUTES.GASOLINE,
        rotation: TANK_ATTRIBUTES.ROTATION,
        ammunition: TANK_ATTRIBUTES.AMMUNITION,
        kinetics: TANK_ATTRIBUTES.KINETICS
      }
    };
    
    this.initializeBattlefield();
    
    // Helper method to get random tank color for AI tanks
    this.getRandomTankColor = () => {
      const colorKeys = Object.keys(tankColors);
      const randomKey = colorKeys[Math.floor(Math.random() * colorKeys.length)];
      return tankColors[randomKey].hex;
    };
  }

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.gameLoop = setInterval(() => {
      this.update();
    }, 1000 / GAME_TICK_RATE);
  }

  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.gameLoop) {
      clearInterval(this.gameLoop);
      this.gameLoop = null;
    }
  }

  update() {
    const currentTime = Date.now();
    const deltaTime = currentTime - this.lastUpdate;
    this.lastUpdate = currentTime;

    // Update game time
    this.gameState.gameTime += deltaTime;

    // Update all tanks
    for (const [id, tank] of this.gameState.tanks) {
      tank.update(deltaTime, this.gameSettings.gameParams.gasolinePerUnit, this.gameSettings.gameParams.gasolineSpeedPenalty, this.gameState.trees);
    }

    // Update AI controllers and handle their actions
    for (const [id, aiController] of this.aiControllers) {
      aiController.update(deltaTime);
      
      // Check if AI tank shot a shell
      const aiTank = this.gameState.tanks.get(id);
      if (aiTank && aiTank.lastShotShell) {
        // Add AI shell to game state
        this.gameState.shells.push(aiTank.lastShotShell);
        aiTank.lastShotShell = null; // Clear the shell reference
      }
    }

    // Update shells
    this.updateShells(deltaTime);



    // Update trees (swing animation)
    for (const tree of this.gameState.trees) {
      tree.update(deltaTime);
    }

    // Check collisions (this handles shell removal when they hit something)
    this.checkCollisions();

    // Spawn new upgrades if needed
    this.spawnUpgrades();

    // Clean up shells that went off-screen (only remove those that are off the arena)
    this.cleanupShells();
  }

  updateShells(deltaTime) {
    for (const shell of this.gameState.shells) {
      shell.update(deltaTime);
    }
  }



  checkCollisions() {
    // Check shell-tank collisions
    for (let i = this.gameState.shells.length - 1; i >= 0; i--) {
      const shell = this.gameState.shells[i];
      const shellBox = shell.getBoundingBox();
      let shellHit = false;

      // Check collision with tanks
      for (const [tankId, tank] of this.gameState.tanks) {
        if (!tank.isAlive) continue;

        const tankBox = tank.getBoundingBox();
        if (checkAABBCollision(shellBox, tankBox)) {
          console.log(`Shell from ${shell.shooterId} collided with tank ${tankId}`);
          
          // Use robust damage system that handles immunity
          const damageApplied = tank.takeDamage(shell);
          
          if (damageApplied) {
            console.log(`Damage applied to tank ${tankId}`);
            this.gameState.shells.splice(i, 1);
            shellHit = true;
            break;
          } else {
            console.log(`Damage blocked for tank ${tankId} (immunity)`);
          }
        }
      }

      // Only check tree collision if shell didn't hit a tank
      if (!shellHit) {
        for (const tree of this.gameState.trees) {
          const treeBox = tree.getBoundingBox();
          if (checkAABBCollision(shellBox, treeBox)) {
            console.log(`Shell hit tree at position:`, tree.position);
            // Trigger tree swing animation based on shell velocity and speed
            const shellSpeed = shell.velocity.magnitude();
            tree.impact(shell.velocity, shellSpeed);
            this.gameState.shells.splice(i, 1);
            break;
          }
        }
      }
    }

    // Check tank-upgrade collisions
    for (const tank of this.gameState.tanks.values()) {
      if (!tank.isAlive) continue;

      const tankBox = tank.getBoundingBox();
      for (let i = this.gameState.upgrades.length - 1; i >= 0; i--) {
        const upgrade = this.gameState.upgrades[i];
        if (upgrade.collected) continue;

        const upgradeBox = upgrade.getBoundingBox();
        if (checkAABBCollision(tankBox, upgradeBox)) {
          this.applyUpgrade(tank, upgrade.type);
          upgrade.collected = true;
          this.gameState.upgrades.splice(i, 1);
        }
      }
    }
  }

  applyUpgrade(tank, upgradeType) {
    const upgradeConfig = UPGRADE_TYPES[upgradeType];
    if (!upgradeConfig) return;

    switch (upgradeType) {
      case 'HEALTH':
        tank.attributes.health = Math.min(
          TANK_ATTRIBUTES.HEALTH.max,
          tank.attributes.health + upgradeConfig.value
        );
        break;
      case 'SPEED':
        tank.attributes.speed = Math.min(
          TANK_ATTRIBUTES.SPEED.max,
          tank.attributes.speed + upgradeConfig.value
        );
        break;
      case 'GASOLINE':
        tank.attributes.gasoline = Math.min(
          TANK_ATTRIBUTES.GASOLINE.max,
          tank.attributes.gasoline + upgradeConfig.value
        );
        break;
      case 'ROTATION':
        tank.attributes.rotation = Math.min(
          TANK_ATTRIBUTES.ROTATION.max,
          tank.attributes.rotation + upgradeConfig.value
        );
        break;
      case 'AMMUNITION':
        tank.attributes.ammunition = Math.min(
          TANK_ATTRIBUTES.AMMUNITION.max,
          tank.attributes.ammunition + upgradeConfig.value
        );
        break;
      case 'KINETICS':
        tank.attributes.kinetics = Math.min(
          TANK_ATTRIBUTES.KINETICS.max,
          tank.attributes.kinetics + upgradeConfig.value
        );
        break;
    }
  }

  spawnUpgrades() {
    // Count current upgrades by type
    const upgradeCounts = {};
    for (const upgrade of this.gameState.upgrades) {
      upgradeCounts[upgrade.type] = (upgradeCounts[upgrade.type] || 0) + 1;
    }

    // Spawn missing upgrades
    for (const [type, config] of Object.entries(UPGRADE_TYPES)) {
      const currentCount = upgradeCounts[type] || 0;
      if (currentCount < config.count) {
        const position = getRandomPositionAvoidingObstacles([
          ...this.gameState.trees.values(),
          ...this.gameState.upgrades,
          ...this.gameState.tanks.values()
        ]);
        
        this.gameState.upgrades.push(new Upgrade(type, new Vector2(position.x, position.y), this.gameSettings.upgradeParams.rotationRange));
      }
    }
  }

    cleanupShells() {
    // Only remove shells that are off the game arena, not those that expired due to lifetime
    this.gameState.shells = this.gameState.shells.filter(shell =>
      shell.position.x >= 0 &&
      shell.position.x <= 1500 &&
      shell.position.y >= 0 &&
      shell.position.y <= 900
    );
  }

  addPlayer(playerId, callname, tankColor, tankCamo, team) {
    const player = {
      id: playerId,
      callname,
      tankColor,
      tankCamo,
      team,
      lastUpdate: Date.now()
    };

    this.gameState.players.set(playerId, player);

    // Create tank for player
    const position = getRandomPositionAvoidingObstacles([
      ...this.gameState.trees,
      ...this.gameState.upgrades,
      ...this.gameState.tanks.values()
    ]);

    const tank = new Tank(playerId, new Vector2(position.x, position.y));
    
    // Apply current balance settings to new player

    
    // Apply max values from current balance settings as starting values
    tank.attributes.health = this.gameSettings.attributeLimits.health.max;
    tank.attributes.speed = this.gameSettings.attributeLimits.speed.max;
    tank.attributes.gasoline = this.gameSettings.attributeLimits.gasoline.max;
    tank.attributes.rotation = this.gameSettings.attributeLimits.rotation.max;
    tank.attributes.ammunition = this.gameSettings.attributeLimits.ammunition.max;
    tank.attributes.kinetics = this.gameSettings.attributeLimits.kinetics.max;
    

    

    
    this.gameState.tanks.set(playerId, tank);

    return { player, tank };
  }

  removePlayer(playerId) {
    this.gameState.players.delete(playerId);
    this.gameState.tanks.delete(playerId);
    this.aiControllers.delete(playerId);
  }

  setPlayerAttributes(attributes) {

    // Reduced debug logging to prevent spam
    
    let playerTanksFound = 0;
    let attributesSet = 0;
    
    // Set attributes for all player tanks (not AI tanks)
    for (const [playerId, tank] of this.gameState.tanks) {
      // Reduced debug logging to prevent spam
      
      if (!tank.isAI) {
        playerTanksFound++;
        // Reduced debug logging to prevent spam
        
        // Only update the attributes that were provided
        if (attributes.health !== undefined) {
          tank.attributes.health = attributes.health;
          attributesSet++;
          // Reduced debug logging to prevent spam
        }
        if (attributes.speed !== undefined) {
          tank.attributes.speed = attributes.speed;
          attributesSet++;
          // Reduced debug logging to prevent spam
        }
        if (attributes.gasoline !== undefined) {
          tank.attributes.gasoline = attributes.gasoline;
          attributesSet++;
          // Reduced debug logging to prevent spam
        }
        if (attributes.rotation !== undefined) {
          tank.attributes.rotation = attributes.rotation;
          attributesSet++;
          // Reduced debug logging to prevent spam
        }
        if (attributes.ammunition !== undefined) {
          tank.attributes.ammunition = attributes.ammunition;
          attributesSet++;
          // Reduced debug logging to prevent spam
        }
        if (attributes.kinetics !== undefined) {
          tank.attributes.kinetics = attributes.kinetics;
          attributesSet++;
          // Reduced debug logging to prevent spam
        }
        
        // Reduced debug logging to prevent spam
      }
    }
    
    // Reduced debug logging to prevent spam

  }



  addAITank(aiLevel = 'intermediate') {
    const aiId = `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create obstacle list with tank positions
    const tankObstacles = Array.from(this.gameState.tanks.values()).map(tank => ({
      position: tank.position
    }));
    
    const position = getRandomPositionAvoidingObstacles([
      ...this.gameState.trees,
      ...this.gameState.upgrades,
      ...tankObstacles
    ]);

    // Create AI tank with proper setup
    const tank = new Tank(aiId, new Vector2(position.x, position.y));
    tank.isAI = true;
    
    // Set AI level-specific attributes
    this.setAILevelAttributes(tank, aiLevel);
    
    // Add tank to game state
    this.gameState.tanks.set(aiId, tank);

    // Create AI player data for proper rendering
    const aiPlayer = {
      id: aiId,
      callname: `AI-${aiLevel.charAt(0).toUpperCase() + aiLevel.slice(1)}`,
      tankColor: this.getRandomTankColor(), // Random color for AI tanks
      tankCamo: 'none', // No camo for AI
      team: { name: 'AI', color: '#FF6B6B' }, // Red team indicator for AI
      isAI: true,
      aiLevel: aiLevel
    };
    this.gameState.players.set(aiId, aiPlayer);

    // Create AI controller with level-specific behavior
    const aiController = new AIController(tank, this.gameState, aiLevel);
    this.aiControllers.set(aiId, aiController);

    // Add strategy to player data for display
    aiPlayer.strategy = aiController.strategy;

    console.log(`AI tank ${aiId} added with player data (Level: ${aiLevel}, Strategy: ${aiController.strategy})`);
    return aiId;
  }

  setAILevelAttributes(tank, aiLevel) {
    // AI tanks start with EXACTLY the same stats as regular players
    // Apply max values from current balance settings as starting values (same as regular players)
    tank.attributes.health = this.gameSettings.attributeLimits.health.max;
    tank.attributes.speed = this.gameSettings.attributeLimits.speed.max;
    tank.attributes.gasoline = this.gameSettings.attributeLimits.gasoline.max;
    tank.attributes.rotation = this.gameSettings.attributeLimits.rotation.max;
    tank.attributes.ammunition = this.gameSettings.attributeLimits.ammunition.max;
    tank.attributes.kinetics = this.gameSettings.attributeLimits.kinetics.max;
    
    console.log(`AI tank ${tank.id} initialized with same stats as regular player:`, tank.attributes);
    console.log(`AI Level: ${aiLevel} - affects behavior, not starting stats`);
  }

  removeAITank(aiId) {
    // Clean up AI tank and associated data
    this.gameState.tanks.delete(aiId);
    this.gameState.players.delete(aiId);
    this.aiControllers.delete(aiId);
    console.log(`AI tank ${aiId} removed with cleanup`);
  }

  updatePlayerInput(playerId, input) {

    
    const tank = this.gameState.tanks.get(playerId);
    if (!tank) {
      // Reduced logging - only log once per player per session to prevent spam
      if (!this.loggedMissingTanks) {
        this.loggedMissingTanks = new Set();
      }
      if (!this.loggedMissingTanks.has(playerId)) {
        console.log(`No tank found for player ${playerId} (logging once per session)`);
        this.loggedMissingTanks.add(playerId);
      }
      return;
    }
    
    if (!tank.isAlive) {
      // Reduced logging - only log once per tank per session
      if (!this.loggedDeadTanks) {
        this.loggedDeadTanks = new Set();
      }
      if (!this.loggedDeadTanks.has(playerId)) {
        console.log(`Tank ${playerId} is not alive (logging once per session)`);
        this.loggedDeadTanks.add(playerId);
      }
      return;
    }

    // Ensure tank angle is never null
    if (tank.angle === null || tank.angle === undefined) {
      tank.angle = 0;
    }

    // Update tank movement
    if (input.movement) {
  
      // Scale the movement vector by tank speed
      const speed = tank.attributes.speed;
      tank.targetVelocity = new Vector2(input.movement.x * speed, input.movement.y * speed);
    }

    // Don't override rotation from client - let tank.update() handle rotation based on movement
    // Only set rotation if we're implementing manual rotation controls later

    // Handle shooting
    if (input.shoot) {
      // Reduced logging - only log shooting attempts occasionally
      if (!this.shootLogCounter) {
        this.shootLogCounter = 0;
      }
      this.shootLogCounter++;
      
      if (this.shootLogCounter % 10 === 0) { // Log every 10th attempt
        console.log(`Tank ${playerId} attempting to shoot (attempt #${this.shootLogCounter})`);
      }
      
      const shell = tank.shoot();
      if (shell) {
        if (this.shootLogCounter % 10 === 0) { // Log every 10th successful shot
          console.log(`Tank ${playerId} shot shell successfully`);
        }
        this.gameState.shells.push(shell);
      } else {
        // Don't log failed shots to reduce spam
      }
    }
  }

  initializeBattlefield() {
    // Get tree parameters from game settings, fallback to constants if not set
    const treeParams = this.gameSettings.treeParams || {
      minTrees: TREE_PARAMS.MIN_TREES,
      maxTrees: TREE_PARAMS.MAX_TREES,
      treeSize: TREE_PARAMS.TREE_SIZE,
      treeSizeVariance: TREE_PARAMS.TREE_SIZE_VARIANCE,
      clusterGroups: TREE_PARAMS.CLUSTER_GROUPS,
      clustering: TREE_PARAMS.CLUSTERING
    };

    // Generate trees using dynamic parameters
    const treeCount = Math.floor(
      Math.random() * (treeParams.maxTrees - treeParams.minTrees + 1) + 
      treeParams.minTrees
    );



    // Get clustering parameters from game settings
    const clustering = treeParams.clustering || 0;
    const clusterGroups = treeParams.clusterGroups || 1;
    
    // Generate cluster centers if clustering is enabled
    let clusterCenters = [];
    if (clustering > 0) {
      // Use the specified number of cluster groups
      const numClusters = Math.min(clusterGroups, treeCount);
      for (let i = 0; i < numClusters; i++) {
        clusterCenters.push({
          x: Math.random() * 1400 + 50, // 50 to 1450
          y: Math.random() * 800 + 50   // 50 to 850
        });
      }
    }

    for (let i = 0; i < treeCount; i++) {
      const size = treeParams.treeSize + 
        (Math.random() - 0.5) * treeParams.treeSizeVariance;
      
      let position;
      
      if (clustering > 0 && clusterCenters.length > 0) {
        // Use clustering
        const clusterIndex = i % clusterCenters.length;
        const center = clusterCenters[clusterIndex];
        
        // Calculate cluster radius based on clustering value (0-100)
        // At 0 clustering: radius = 200-400 pixels (very spread out)
        // At 100 clustering: radius = 10-50 pixels (very tight)
        const baseRadius = 400 - (clustering / 100) * 350; // 400 to 50 pixels
        const radius = Math.random() * baseRadius + 10; // Add 10px minimum
        const angle = Math.random() * 2 * Math.PI;
        
        position = {
          x: center.x + radius * Math.cos(angle),
          y: center.y + radius * Math.sin(angle)
        };
        
        // Ensure position is within bounds
        position.x = Math.max(50, Math.min(1450, position.x));
        position.y = Math.max(50, Math.min(850, position.y));
      } else {
        // Random placement
        position = getRandomPositionAvoidingObstacles([
          ...this.gameState.trees,
          ...this.gameState.upgrades
        ], 60, 50, 50, 1450, 850);
      }

      this.gameState.trees.push(new Tree(new Vector2(position.x, position.y), size));
    }

    // Spawn initial upgrades
    this.spawnUpgrades();
  }

  getGameState() {
    return {
      players: Array.from(this.gameState.players.values()),
      tanks: Array.from(this.gameState.tanks.values()),
      shells: this.gameState.shells,
      upgrades: this.gameState.upgrades,
      trees: this.gameState.trees,

      gameTime: this.gameState.gameTime
    };
  }

  getPlayerGameState(playerId) {
    const tank = this.gameState.tanks.get(playerId);
    if (!tank) return null;

    return {
      tank: tank,
      attributes: tank.attributes,
      isAlive: tank.isAlive,
      respawnTime: tank.respawnTime
    };
  }

  resetGame() {
    console.log('Resetting game state...');
    
    // Clear all game entities
    this.gameState.tanks.clear();
    this.gameState.players.clear();
    this.gameState.shells = [];
    this.gameState.upgrades = [];
    this.gameState.trees = [];

    this.aiControllers.clear();
    
    // Reset game time
    this.gameState.gameTime = 0;
    this.lastUpdate = Date.now();
    
    // Reinitialize battlefield with current settings
    this.initializeBattlefield();
    
    console.log('Game state reset complete');
  }

  updateSettings(newSettings) {
    console.log('Applying settings to game engine:', newSettings);
    
    // Update game parameters
    if (newSettings.gameParams) {
      // Store settings for future reference
      this.gameSettings = {
        ...this.gameSettings,
        gameParams: { ...newSettings.gameParams }
      };
    }

    // Update damage parameters
    if (newSettings.damageParams) {
      this.gameSettings = {
        ...this.gameSettings,
        damageParams: { ...newSettings.damageParams }
      };
    }

    // Update upgrade types and respawn upgrades if counts changed
    if (newSettings.upgradeTypes) {
      this.gameSettings = {
        ...this.gameSettings,
        upgradeTypes: { ...newSettings.upgradeTypes }
      };
      
      // Respawn upgrades to match new counts
      this.spawnUpgrades();
    }

    // Update tree parameters (affects future tree generation)
    if (newSettings.treeParams) {
      this.gameSettings = {
        ...this.gameSettings,
        treeParams: { ...newSettings.treeParams }
      };
    }

    // Update upgrade parameters
    if (newSettings.upgradeParams) {
      this.gameSettings = {
        ...this.gameSettings,
        upgradeParams: { ...newSettings.upgradeParams }
      };
    }

    // Update attribute limits
    if (newSettings.attributeLimits) {
      this.gameSettings = {
        ...this.gameSettings,
        attributeLimits: { ...newSettings.attributeLimits }
      };
    }

    console.log('Settings applied successfully');
  }
} 