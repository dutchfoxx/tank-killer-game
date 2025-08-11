// Priority-based Update System for Network Optimization
// Sends critical data (player positions) more frequently than static data
// Designed to work safely with existing game state

export class PriorityUpdateManager {
  constructor() {
    this.updateFrequencies = {
      critical: 60,    // 60fps - positions, health, angle
      standard: 30,    // 30fps - velocity, attributes
      low: 10,        // 10fps - trees, upgrades
      static: 1       // 1fps - terrain, settings
    };
    
    this.lastUpdates = {
      critical: 0,
      standard: 0,
      low: 0,
      static: 0
    };
    
    this.stats = {
      criticalUpdates: 0,
      standardUpdates: 0,
      lowUpdates: 0,
      staticUpdates: 0,
      bandwidthSaved: 0
    };
  }

  // Check if an update type should be sent this frame
  shouldUpdate(priority, currentTime) {
    const frequency = this.updateFrequencies[priority];
    if (!frequency) return false;
    
    const timeSinceLastUpdate = currentTime - this.lastUpdates[priority];
    const updateInterval = 1000 / frequency;
    
    return timeSinceLastUpdate >= updateInterval;
  }

  // Mark an update as sent
  markUpdateSent(priority, currentTime) {
    if (this.lastUpdates.hasOwnProperty(priority)) {
      this.lastUpdates[priority] = currentTime;
      this.stats[`${priority}Updates`]++;
    }
  }

  // Get what needs to be updated this frame
  getUpdatesForFrame(currentTime) {
    const updates = [];
    
    for (const [priority, frequency] of Object.entries(this.updateFrequencies)) {
      if (this.shouldUpdate(priority, currentTime)) {
        updates.push({ priority, frequency });
      }
    }
    
    return updates;
  }

  // Create critical update (only essential data for smooth movement)
  createCriticalUpdate(gameState) {
    const criticalData = {
      type: 'critical',
      timestamp: Date.now(),
      tanks: {},
      shells: [],
      gameTime: gameState.gameTime
    };
    
    // Extract only critical tank data (position, angle, health)
    for (const [id, tank] of gameState.tanks) {
      if (tank.isAlive) {
        criticalData.tanks[id] = {
          id: tank.id,
          position: tank.position,
          angle: tank.angle,
          health: tank.attributes.health,
          isAlive: tank.isAlive
        };
      }
    }
    
    // Extract only critical shell data (position, velocity)
    criticalData.shells = gameState.shells.map(shell => ({
      id: shell.id,
      position: shell.position,
      velocity: shell.velocity
    }));
    
    return criticalData;
  }

  // Create standard update (includes more details)
  createStandardUpdate(gameState) {
    const standardData = {
      type: 'standard',
      timestamp: Date.now(),
      tanks: {},
      shells: [],
      gameTime: gameState.gameTime
    };
    
    // Extract standard tank data (includes velocity, attributes)
    for (const [id, tank] of gameState.tanks) {
      if (tank.isAlive) {
        standardData.tanks[id] = {
          id: tank.id,
          position: tank.position,
          angle: tank.angle,
          velocity: tank.velocity,
          attributes: {
            health: tank.attributes.health,
            ammunition: tank.attributes.ammunition,
            gasoline: tank.attributes.gasoline,
            speed: tank.attributes.speed,
            rotation: tank.attributes.rotation,
            kinetics: tank.attributes.kinetics
          },
          isAlive: tank.isAlive,
          isAI: tank.isAI,
          respawnTime: tank.respawnTime,
          reloadTime: tank.reloadTime
        };
      }
    }
    
    // Extract standard shell data
    standardData.shells = gameState.shells.map(shell => ({
      id: shell.id,
      position: shell.position,
      velocity: shell.velocity,
      shooterId: shell.shooterId,
      timestamp: shell.timestamp
    }));
    
    return standardData;
  }

  // Create low priority update (trees, upgrades)
  createLowPriorityUpdate(gameState) {
    const lowPriorityData = {
      type: 'low',
      timestamp: Date.now(),
      trees: [],
      upgrades: [],
      gameTime: gameState.gameTime
    };
    
    // Extract tree data
    lowPriorityData.trees = gameState.trees.map(tree => ({
      id: tree.id,
      position: tree.position,
      trunkSize: tree.trunkSize,
      isDestroyed: tree.isDestroyed
    }));
    
    // Extract upgrade data
    lowPriorityData.upgrades = gameState.upgrades
      .filter(upgrade => !upgrade.collected)
      .map(upgrade => ({
        id: upgrade.id,
        position: upgrade.position,
        type: upgrade.type,
        collected: upgrade.collected
      }));
    
    return lowPriorityData;
  }

  // Create static update (terrain, settings)
  createStaticUpdate(gameState) {
    const staticData = {
      type: 'static',
      timestamp: Date.now(),
      terrain: gameState.currentTerrainMap,
      settings: {
        gameParams: gameState.gameParams,
        upgradeSettings: gameState.upgradeSettings
      },
      gameTime: gameState.gameTime
    };
    
    return staticData;
  }

  // Create full update (complete game state for initial load)
  createFullUpdate(gameState) {
    return {
      type: 'full',
      timestamp: Date.now(),
      ...gameState
    };
  }

  // Get priority update based on type
  createUpdate(gameState, priority) {
    switch (priority) {
      case 'critical':
        return this.createCriticalUpdate(gameState);
      case 'standard':
        return this.createStandardUpdate(gameState);
      case 'low':
        return this.createLowPriorityUpdate(gameState);
      case 'static':
        return this.createStaticUpdate(gameState);
      case 'full':
        return this.createFullUpdate(gameState);
      default:
        return this.createStandardUpdate(gameState);
    }
  }

  // Calculate bandwidth savings
  calculateBandwidthSavings(originalSize, compressedSize) {
    const saved = originalSize - compressedSize;
    this.stats.bandwidthSaved += saved;
    return saved;
  }

  // Get priority update statistics
  getStats() {
    const totalUpdates = this.stats.criticalUpdates + this.stats.standardUpdates + 
                        this.stats.lowUpdates + this.stats.staticUpdates;
    
    return {
      ...this.stats,
      totalUpdates,
      bandwidthSavedKB: Math.round(this.stats.bandwidthSaved / 1024),
      updateFrequencies: {
        critical: this.updateFrequencies.critical + 'fps',
        standard: this.updateFrequencies.standard + 'fps',
        low: this.updateFrequencies.low + 'fps',
        static: this.updateFrequencies.static + 'fps'
      }
    };
  }

  // Reset statistics
  resetStats() {
    this.stats = {
      criticalUpdates: 0,
      standardUpdates: 0,
      lowUpdates: 0,
      staticUpdates: 0,
      bandwidthSaved: 0
    };
    
    this.lastUpdates = {
      critical: 0,
      standard: 0,
      low: 0,
      static: 0
    };
  }

  // Update priority frequencies dynamically
  updatePriorityFrequencies(newFrequencies) {
    for (const [priority, frequency] of Object.entries(newFrequencies)) {
      if (this.updateFrequencies.hasOwnProperty(priority)) {
        this.updateFrequencies[priority] = frequency;
      }
    }
  }
}

// Global priority update manager instance
export const priorityUpdateManager = new PriorityUpdateManager();
