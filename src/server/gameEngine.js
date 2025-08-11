import { GameState, Tank, Shell, Upgrade, Tree, Patch, Vector2 } from '../shared/types.js';
import { AIController } from '../shared/ai.js';
import { checkAABBCollision, getRandomPositionAvoidingObstacles } from '../shared/collision.js';
import { SpatialManager, createBounds } from '../shared/spatialPartitioning.js';
import { memoryManager } from '../shared/objectPools.js';
import { HybridSpatialSystem } from '../shared/spatialHashing.js';
import { changeTracker, lazyEvaluator } from '../shared/eventSystem.js';
import { VectorUtils } from '../shared/vectorOptimizations.js';
import { gameLoop, updateScheduler } from '../shared/gameLoop.js';
import { priorityUpdateManager } from '../shared/priorityUpdates.js';
import { 
  GAME_TICK_RATE, 
  UPGRADE_TYPES, 
  TREE_PARAMS, 
  BATTLEFIELD,
  TANK_ATTRIBUTES,
  GAME_PARAMS,
  DAMAGE_PARAMS
} from '../shared/constants.js';
import { defaultNames, ranks } from '../shared/defaultNames.js';
import { getTerrainMap } from '../shared/terrainMaps.js';

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
    
    // Network optimization: track last sent state for delta compression
    this.lastSentState = null;
    this.lastSentTime = 0;
    this.networkUpdateInterval = 100; // Reduced from 50ms to 100ms (10 FPS)
    
        // Initialize default settings with Mudlands terrain map
        const mudlandsMap = getTerrainMap('mudlands');
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
      treeParams: mudlandsMap.treeParams,
      patchParams: mudlandsMap.patchParams,
      groundParams: mudlandsMap.groundParams,
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
    
    // OPTIMIZATION: Initialize hybrid spatial system for ultra-fast collision detection
    this.spatialManager = new HybridSpatialSystem(
      createBounds(0, 0, 1500, 900), // World bounds (game arena)
      50, // Cell size for spatial hashing
      15, // Max objects per node for QuadTree
      5   // Max levels deep for QuadTree
    );
    
    // Helper method to get random tank color for AI tanks
    this.getRandomTankColor = () => {
      const colorKeys = Object.keys(tankColors);
      const randomKey = colorKeys[Math.floor(Math.random() * colorKeys.length)];
      return tankColors[randomKey].hex;
    };
    
    // 🚀 CRITICAL OPTIMIZATION: AI frame-skipping system
    this.aiUpdateFrameCounter = 0;
    this.aiUpdateInterval = 3; // Update AI every 3 frames instead of every frame
    this.aiUpdateStats = {
      totalUpdates: 0,
      skippedUpdates: 0,
      lastUpdateTime: 0
    };
  }

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    
    // OPTIMIZATION: Use fixed timestep game loop for consistent 60fps
    gameLoop.start(
      (deltaTime) => this.update(deltaTime), // Update callback
      (interpolationAlpha) => this.render(interpolationAlpha) // Render callback
    );
  }

  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    // OPTIMIZATION: Stop fixed timestep game loop
    gameLoop.stop();
  }

  update(deltaTime) {
    // OPTIMIZATION: Use fixed timestep deltaTime instead of calculating from current time
    // const currentTime = Date.now();
    // const deltaTime = currentTime - this.lastUpdate;
    // this.lastUpdate = currentTime;

    // Update game time
    this.gameState.gameTime += deltaTime;

    // Update all tanks
    for (const [id, tank] of this.gameState.tanks) {
      tank.update(deltaTime, this.gameSettings.gameParams.gasolinePerUnit, this.gameSettings.gameParams.gasolineSpeedPenalty, this.gameState.trees);
    }

    // 🚀 CRITICAL OPTIMIZATION: AI frame-skipping system
    this.aiUpdateFrameCounter++;
    
    // Only update AI controllers every few frames to spread the load
    if (this.aiUpdateFrameCounter >= this.aiUpdateInterval) {
      this.aiUpdateFrameCounter = 0;
      
      const aiUpdateStart = performance.now();
      
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
      
      const aiUpdateEnd = performance.now();
      const aiUpdateTime = aiUpdateEnd - aiUpdateStart;
      
      // Track AI update performance
      this.aiUpdateStats.totalUpdates++;
      this.aiUpdateStats.lastUpdateTime = aiUpdateTime;
      
      // Log slow AI updates for debugging
      if (aiUpdateTime > 5) {
        console.log(`⚠️ Slow AI update: ${aiUpdateTime.toFixed(1)}ms for ${this.aiControllers.size} AI tanks`);
      }
    } else {
      // Skip AI updates this frame - count as skipped
      this.aiUpdateStats.skippedUpdates++;
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

  // OPTIMIZATION: Render method for interpolation
  render(interpolationAlpha) {
    // This method is called by the fixed timestep game loop
    // It can be used for client-side rendering interpolation
    // For now, it's a placeholder for future client-side optimizations
  }

  updateShells(deltaTime) {
    for (const shell of this.gameState.shells) {
      shell.update(deltaTime);
    }
  }



  checkCollisions() {
    // OPTIMIZATION: Use spatial partitioning for collision detection (O(log n) instead of O(n²))
    
    // Update spatial manager with current entity positions
    this.updateSpatialManager();
    
    // Check shell-tank collisions using spatial partitioning
    for (let i = this.gameState.shells.length - 1; i >= 0; i--) {
      const shell = this.gameState.shells[i];
      let shellHit = false;

      // Get potential tank collision candidates using spatial partitioning
      const tankCandidates = this.spatialManager.getCollisionCandidates(shell, 25); // 25px search radius
      
      for (const tank of tankCandidates) {
        if (!tank.isAlive || tank.constructor.name !== 'Tank') continue;

        if (checkAABBCollision(shell.bounds, tank.bounds)) {
          // Use robust damage system that handles immunity
          const damageApplied = tank.takeDamage(shell);
          
          if (damageApplied) {
            // OPTIMIZATION: Release shell back to object pool instead of destroying it
            memoryManager.release(this.gameState.shells[i]);
            this.gameState.shells.splice(i, 1);
            shellHit = true;
            break;
          }
        } else {
          // OPTIMIZATION: Use fast distance check (no sqrt) for high-velocity shells
          const shellSpeed = shell.velocity.magnitude();
          if (shellSpeed > 10) { // Only check for fast shells
            // Use fast distance check without square root
            if (VectorUtils.fastDistanceCheck(shell.position, tank.position, 20)) {
              const damageApplied = tank.takeDamage(shell);
              if (damageApplied) {
                // OPTIMIZATION: Release shell back to object pool
                memoryManager.release(this.gameState.shells[i]);
                this.gameState.shells.splice(i, 1);
                shellHit = true;
                break;
              }
            }
          }
        }
      }

      // Only check tree collision if shell didn't hit a tank
      if (!shellHit) {
        const treeCandidates = this.spatialManager.getCollisionCandidates(shell, 15); // 15px search radius
        
        for (const tree of treeCandidates) {
          if (tree.constructor.name !== 'Tree') continue;
          
          if (checkAABBCollision(shell.bounds, tree.bounds)) {
            // OPTIMIZATION: Use object pool for tree impact velocity
            const impactVelocity = memoryManager.getVector(shell.velocity.x, shell.velocity.y);
            const shellSpeed = shell.velocity.magnitude();
            tree.impact(impactVelocity, shellSpeed);
            memoryManager.release(impactVelocity);
            
            // OPTIMIZATION: Release shell back to object pool
            memoryManager.release(this.gameState.shells[i]);
            this.gameState.shells.splice(i, 1);
            break;
          }
        }
      }
    }

    // Check tank-upgrade collisions using spatial partitioning
    for (const tank of this.gameState.tanks.values()) {
      if (!tank.isAlive) continue;

      // SIMPLIFIED: Direct upgrade collision check (bypass spatial manager for now)
      for (const upgrade of this.gameState.upgrades) {
        if (upgrade.collected) continue;
        
        // Ensure upgrade has bounds
        if (!upgrade.bounds) {
          console.warn(`⚠️ Upgrade ${upgrade.type} missing bounds, forcing update`);
          upgrade.updateBounds();
        }
        
        // Use more forgiving collision detection: check if upgrade bounds overlap with tank bounds
        // This is more appropriate since upgrades have size and tanks have collision areas
        
        // 🚀 DEBUG: Log collision detection details
        console.log(`🔍 Checking collision: Tank ${tank.id} at (${tank.position.x.toFixed(1)}, ${tank.position.y.toFixed(1)}) vs Upgrade ${upgrade.type} at (${upgrade.position.x.toFixed(1)}, ${upgrade.position.y.toFixed(1)})`);
        console.log(`🔍 Tank bounds:`, tank.bounds);
        console.log(`🔍 Upgrade bounds:`, upgrade.bounds);
        
        if (this.checkTankUpgradeCollision(tank, upgrade)) {
          console.log(`🎯 COLLISION: Tank ${tank.id} collected ${upgrade.type} upgrade!`);
          this.applyUpgrade(tank, upgrade.type);
          upgrade.collected = true;
          
          // Remove from upgrades array
          const upgradeIndex = this.gameState.upgrades.findIndex(u => u === upgrade);
          if (upgradeIndex >= 0) {
            this.gameState.upgrades.splice(upgradeIndex, 1);
          }
        } else {
          console.log(`❌ NO COLLISION: Tank ${tank.id} did not collect ${upgrade.type} upgrade`);
        }
      }
    }
  }

  // OPTIMIZATION: Update spatial manager with current entity positions
  updateSpatialManager() {
    // Collect all entities that need spatial tracking
    const allEntities = [];
    
    // Add all tanks
    for (const tank of this.gameState.tanks.values()) {
      if (tank.isAlive && tank.bounds) {
        allEntities.push(tank);
      }
    }
    
    // Add all shells
    for (const shell of this.gameState.shells) {
      if (shell.bounds) {
        allEntities.push(shell);
      }
    }
    
    // Add all trees
    for (const tree of this.gameState.trees) {
      if (tree.bounds) {
        allEntities.push(tree);
      }
    }
    
    // Add all upgrades (still needed for other collision types)
    for (const upgrade of this.gameState.upgrades) {
      if (!upgrade.collected && upgrade.bounds) {
        allEntities.push(upgrade);
      }
    }
    
    // OPTIMIZATION: Use hybrid spatial system update for better performance
    this.spatialManager.update(allEntities);
    
    // OPTIMIZATION: Track entity changes for event-driven updates
    for (const entity of allEntities) {
      changeTracker.track(entity);
    }
    
    // OPTIMIZATION: Schedule entities for different update frequencies
    this.scheduleEntities();
  }

  // OPTIMIZATION: Schedule entities for different update frequencies
  scheduleEntities() {
    // Clear existing schedules
    updateScheduler.clear();
    
    // Schedule tanks at 60fps (highest priority)
    for (const [id, tank] of this.gameState.tanks) {
      if (tank.isAlive) {
        updateScheduler.schedule(id, 60);
      }
    }
    
    // Schedule AI controllers at 30fps
    for (const [id, aiController] of this.aiControllers) {
      updateScheduler.schedule(id, 30);
    }
    
    // Schedule shells at 60fps
    for (const shell of this.gameState.shells) {
      updateScheduler.schedule(shell.id, 60);
    }
    
    // Schedule trees at 15fps (less frequent for animations)
    for (const tree of this.gameState.trees) {
      updateScheduler.schedule(tree.id, 15);
    }
    
    // Schedule upgrade spawning at 5fps (very low priority)
    updateScheduler.schedule('upgrade_spawner', 5);
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

  // Check collision between tank and upgrade using more forgiving bounds overlap
  checkTankUpgradeCollision(tank, upgrade) {
    // Get tank's collision bounds (oriented bounding box)
    const tankBounds = tank.getOrientedBoundingBox();
    
    // Get upgrade's collision bounds (axis-aligned bounding box)
    const upgradeBounds = upgrade.bounds;
    
    if (!upgradeBounds) return false;
    
    // Use a more forgiving collision detection approach
    // Check if the upgrade's bounds overlap with the tank's collision area
    // This is better than just checking if the upgrade center is inside the tank
    
    // First, do a simple AABB check for performance
    const tankAABB = tank.bounds;
    if (!tankAABB) return false;
    
    // Check if AABB bounds overlap
    if (tankAABB.x < upgradeBounds.x + upgradeBounds.width &&
        tankAABB.x + tankAABB.width > upgradeBounds.x &&
        tankAABB.y < upgradeBounds.y + upgradeBounds.height &&
        tankAABB.y + tankAABB.height > upgradeBounds.y) {
      
      // If AABB overlaps, do a more precise check using the upgrade's center
      // but with a larger tolerance area around the tank
      const upgradeCenter = upgrade.position;
      const tankCenter = tank.position;
      
      // Calculate distance between centers
      const dx = upgradeCenter.x - tankCenter.x;
      const dy = upgradeCenter.y - tankCenter.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Use a more forgiving collision radius: tank collision radius + upgrade radius + buffer
      const tankCollisionRadius = Math.max(tank.collisionWidth, tank.collisionHeight) / 2;
      const upgradeRadius = upgradeBounds.width / 2;
      const collisionDistance = tankCollisionRadius + upgradeRadius + 5; // 5px buffer
      
      return distance <= collisionDistance;
    }
    
    return false;
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
        
        const newUpgrade = new Upgrade(type, new Vector2(position.x, position.y), this.gameSettings.upgradeParams.rotationRange);
        this.gameState.upgrades.push(newUpgrade);
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

    // Assign random team and name
    const teamNames = ['NATO', 'CSTO', 'PLA'];
    const randomTeam = teamNames[Math.floor(Math.random() * teamNames.length)];
    const randomRank = ranks[Math.floor(Math.random() * ranks.length)];
    const teamNamesList = defaultNames[randomTeam];
    const randomName = teamNamesList[Math.floor(Math.random() * teamNamesList.length)];
    const fullName = `${randomRank} ${randomName}`;

    // Create AI player data for proper rendering
    const aiPlayer = {
      id: aiId,
      callname: `${fullName} (AI)`,
      tankColor: this.getRandomTankColor(), // Random color for AI tanks
      tankCamo: 'none', // No camo for AI
      team: { name: randomTeam, color: '#FF6B6B' }, // Random team for AI
      isAI: true,
      aiLevel: aiLevel
    };
    this.gameState.players.set(aiId, aiPlayer);

    // Create AI controller with level-specific behavior
    const aiController = new AIController(tank, this.gameState, aiLevel);
    this.aiControllers.set(aiId, aiController);

    // Add strategy to player data for display
    aiPlayer.strategy = aiController.strategy;

    // AI tank added successfully
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
    
    // AI tank initialized with player stats
  }

  removeAITank(aiId) {
    // Clean up AI tank and associated data
    this.gameState.tanks.delete(aiId);
    this.gameState.players.delete(aiId);
    this.aiControllers.delete(aiId);
    // AI tank removed successfully
  }

  updatePlayerInput(playerId, input) {

    
    const tank = this.gameState.tanks.get(playerId);
    if (!tank) {
      // Reduced logging - only log once per player per session to prevent spam
      if (!this.loggedMissingTanks) {
        this.loggedMissingTanks = new Set();
      }
      if (!this.loggedMissingTanks.has(playerId)) {
        // No tank found for player
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
        // Tank is not alive
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
        // Tank attempting to shoot
      }
      
      const shell = tank.shoot();
      if (shell) {
        if (this.shootLogCounter % 10 === 0) { // Log every 10th successful shot
          // Tank shot shell successfully
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

    // Generate patches using dynamic parameters
    const patchParams = this.gameSettings.patchParams || { patchTypes: {} };
    
    Object.keys(patchParams.patchTypes).forEach(patchType => {
        const patchConfig = patchParams.patchTypes[patchType];
        
        if (patchConfig.enabled) {
            for (let i = 0; i < patchConfig.quantity; i++) {
                const size = patchConfig.size + 
                    (Math.random() - 0.5) * patchConfig.sizeVariance;
                
                const position = getRandomPositionAvoidingObstacles([
                    ...this.gameState.trees,
                    ...this.gameState.upgrades,
                    ...this.gameState.patches
                ], 60, 50, 50, 1450, 850);

                this.gameState.patches.push(new Patch(
                    new Vector2(position.x, position.y), 
                    size, 
                    patchType, 
                    Math.random() * 2 * Math.PI // 360 degrees of rotation
                ));
            }
        }
    });

    // Spawn initial upgrades
    this.spawnUpgrades();
  }

  getGameState() {
    const gameState = {
      players: Array.from(this.gameState.players.values()),
      tanks: Array.from(this.gameState.tanks.values()),
      shells: this.gameState.shells,
      upgrades: this.gameState.upgrades,
      trees: this.gameState.trees,
      patches: this.gameState.patches,
      patchConfigs: this.gameSettings.patchParams.patchTypes,
      treeParams: this.gameSettings.treeParams,
      gameTime: this.gameState.gameTime
    };
    
    return gameState;
  }

  getOptimizedGameState() {
    // Create optimized game state with reduced data size
    const optimizedTanks = Array.from(this.gameState.tanks.values()).map(tank => ({
      id: tank.id,
      position: { x: Math.round(tank.position.x * 10) / 10, y: Math.round(tank.position.y * 10) / 10 },
      angle: Math.round(tank.angle * 100) / 100,
      velocity: { x: Math.round(tank.velocity.x * 10) / 10, y: Math.round(tank.velocity.y * 10) / 10 },
      attributes: {
        health: Math.round(tank.attributes.health),
        ammunition: tank.attributes.ammunition,
        gasoline: Math.round(tank.attributes.gasoline * 10) / 10,
        speed: Math.round(tank.attributes.speed),
        rotation: Math.round(tank.attributes.rotation),
        kinetics: Math.round(tank.attributes.kinetics)
      },
      isAlive: tank.isAlive,
      isAI: tank.isAI,
      respawnTime: tank.respawnTime,
      reloadTime: tank.reloadTime
    }));

    const optimizedShells = this.gameState.shells.map(shell => ({
      id: shell.id,
      position: { x: Math.round(shell.position.x * 10) / 10, y: Math.round(shell.position.y * 10) / 10 },
      velocity: { x: Math.round(shell.velocity.x * 10) / 10, y: Math.round(shell.velocity.y * 10) / 10 },
      shooterId: shell.shooterId,
      timestamp: shell.timestamp
    }));

    return {
      players: Array.from(this.gameState.players.values()),
      tanks: optimizedTanks,
      shells: optimizedShells,
      upgrades: this.gameState.upgrades,
      trees: this.gameState.trees,
      patches: this.gameState.patches,
      patchConfigs: this.gameSettings.patchParams.patchTypes,
      treeParams: this.gameSettings.treeParams,
      gameTime: this.gameState.gameTime
    };
  }

  getDeltaGameState() {
    const currentTime = Date.now();
    const currentState = this.getOptimizedGameState();
    
    // If this is the first time or enough time has passed, send full state
    if (!this.lastSentState || (currentTime - this.lastSentTime) > this.networkUpdateInterval) {
      this.lastSentState = currentState;
      this.lastSentTime = currentTime;
      return { type: 'full', data: currentState };
    }
    
    // Calculate delta (only changed entities)
    const delta = {
      type: 'delta',
      timestamp: currentTime,
      tanks: [],
      shells: [],
      upgrades: [],
      players: [],
      patches: currentState.patches,
      patchConfigs: currentState.patchConfigs,
      treeParams: currentState.treeParams
    };
    
    // Check for changed tanks
    for (const tank of currentState.tanks) {
      const lastTank = this.lastSentState.tanks.find(t => t.id === tank.id);
      if (!lastTank || this.hasTankChanged(tank, lastTank)) {
        delta.tanks.push(tank);
      }
    }
    
    // Check for changed shells - send all shells since they're always moving
    if (currentState.shells.length > 0) {
      delta.shells = currentState.shells;
    }
    
    // Check for changed upgrades
    for (const upgrade of currentState.upgrades) {
      const lastUpgrade = this.lastSentState.upgrades.find(u => 
        u.position.x === upgrade.position.x && u.position.y === upgrade.position.y);
      if (!lastUpgrade || lastUpgrade.collected !== upgrade.collected) {
        delta.upgrades.push(upgrade);
      }
    }
    
    // Check for changed players
    for (const player of currentState.players) {
      const lastPlayer = this.lastSentState.players.find(p => p.id === player.id);
      if (!lastPlayer || JSON.stringify(player) !== JSON.stringify(lastPlayer)) {
        delta.players.push(player);
      }
    }
    
    // Only send delta if there are changes
    if (delta.tanks.length > 0 || delta.shells.length > 0 || 
        delta.upgrades.length > 0 || delta.players.length > 0) {
      this.lastSentState = currentState;
      this.lastSentTime = currentTime;
      return delta;
    }
    
    return null; // No changes
  }

  // OPTIMIZATION: Get priority-based game state updates
  getPriorityGameState() {
    const currentTime = Date.now();
    const updates = priorityUpdateManager.getUpdatesForFrame(currentTime);
    
    // If no updates needed, return null
    if (updates.length === 0) {
      return null;
    }
    
    // Create priority-based updates
    const priorityUpdates = [];
    
    for (const update of updates) {
      const updateData = priorityUpdateManager.createUpdate(
        this.gameState, 
        update.priority
      );
      
      // Mark update as sent
      priorityUpdateManager.markUpdateSent(update.priority, currentTime);
      
      priorityUpdates.push({
        priority: update.priority,
        frequency: update.frequency,
        data: updateData,
        timestamp: currentTime
      });
    }
    
    return priorityUpdates;
  }

  hasTankChanged(currentTank, lastTank) {
    // Check if tank position, health, or other critical attributes changed
    return currentTank.position.x !== lastTank.position.x ||
           currentTank.position.y !== lastTank.position.y ||
           currentTank.angle !== lastTank.angle ||
           currentTank.attributes.health !== lastTank.attributes.health ||
           currentTank.attributes.ammunition !== lastTank.attributes.ammunition ||
           currentTank.attributes.gasoline !== lastTank.attributes.gasoline ||
           currentTank.isAlive !== lastTank.isAlive;
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
    // Resetting game state...
    
    // Clear all game entities
    this.gameState.tanks.clear();
    this.gameState.players.clear();
    this.gameState.shells = [];
    this.gameState.upgrades = [];
    this.gameState.trees = [];
    this.gameState.patches = [];

    this.aiControllers.clear();
    
    // OPTIMIZATION: Clear spatial manager
    this.spatialManager.clear();
    
    // Reset game time
    this.gameState.gameTime = 0;
    this.lastUpdate = Date.now();
    
    // Reset network optimization state
    this.lastSentState = null;
    this.lastSentTime = 0;
    
    // Reinitialize battlefield with current settings
    this.initializeBattlefield();
    
    // Game state reset complete
  }

  updateSettings(newSettings) {
    // Applying settings to game engine
    
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

    // Update patch parameters (affects future patch generation)
    if (newSettings.patchParams) {
      this.gameSettings = {
        ...this.gameSettings,
        patchParams: { ...newSettings.patchParams }
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

    // Settings applied successfully
  }

  // Change terrain map
  changeTerrainMap(mapName) {
    const terrainMap = getTerrainMap(mapName);
    if (!terrainMap) {
      console.error(`Terrain map '${mapName}' not found`);
      return false;
    }

    // Update terrain settings
    this.gameSettings.treeParams = terrainMap.treeParams;
    this.gameSettings.patchParams = terrainMap.patchParams;
    this.gameSettings.groundParams = terrainMap.groundParams;

    // Reinitialize battlefield with new terrain
    this.gameState.trees = [];
    this.gameState.patches = [];
    this.initializeBattlefield();

    console.log(`✅ Terrain map changed to: ${terrainMap.name}`);
    return true;
  }

  // Get current terrain map name
  getCurrentTerrainMap() {
    // This is a simple implementation - you might want to store the current map name
    // For now, we'll return 'mudlands' as default since that's what we're using
    return 'mudlands';
  }

  // OPTIMIZATION: Get spatial partitioning performance statistics
  getSpatialStats() {
    return this.spatialManager.getStats();
  }
  
  // 🚀 Get AI update performance statistics
  getAIUpdateStats() {
    return {
      frameCounter: this.aiUpdateFrameCounter,
      updateInterval: this.aiUpdateInterval,
      stats: this.aiUpdateStats,
      efficiency: this.aiUpdateStats.totalUpdates > 0 ? 
        ((this.aiUpdateStats.skippedUpdates / this.aiUpdateStats.totalUpdates) * 100).toFixed(1) + '%' : '0%'
    };
  }
} 