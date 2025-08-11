// Event-Driven Update System for Algorithm Optimization
// Only updates entities that have actually changed, dramatically reducing CPU usage

export class EventSystem {
  constructor() {
    this.events = new Map(); // eventType -> Set of handlers
    this.entityChanges = new Map(); // entityId -> Set of changed properties
    this.updateQueue = new Set(); // Entities that need updates
    this.stats = {
      totalEvents: 0,
      totalUpdates: 0,
      skippedUpdates: 0,
      eventTypes: new Set()
    };
  }

  // Register an event handler
  on(eventType, handler) {
    if (!this.events.has(eventType)) {
      this.events.set(eventType, new Set());
    }
    this.events.get(eventType).add(handler);
    this.stats.eventTypes.add(eventType);
  }

  // Remove an event handler
  off(eventType, handler) {
    const handlers = this.events.get(eventType);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.events.delete(eventType);
      }
    }
  }

  // Emit an event
  emit(eventType, data) {
    this.stats.totalEvents++;
    
    const handlers = this.events.get(eventType);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${eventType}:`, error);
        }
      }
    }
  }

  // Mark an entity as changed
  markEntityChanged(entityId, properties = []) {
    if (!this.entityChanges.has(entityId)) {
      this.entityChanges.set(entityId, new Set());
    }
    
    const changes = this.entityChanges.get(entityId);
    properties.forEach(prop => changes.add(prop));
    
    // Add to update queue
    this.updateQueue.add(entityId);
  }

  // Check if an entity has changed
  hasEntityChanged(entityId, property = null) {
    const changes = this.entityChanges.get(entityId);
    if (!changes) return false;
    
    if (property) {
      return changes.has(property);
    }
    
    return changes.size > 0;
  }

  // Get all changed entities
  getChangedEntities() {
    return Array.from(this.updateQueue);
  }

  // Clear change tracking for an entity
  clearEntityChanges(entityId) {
    this.entityChanges.delete(entityId);
    this.updateQueue.delete(entityId);
  }

  // Clear all change tracking
  clearAllChanges() {
    this.entityChanges.clear();
    this.updateQueue.clear();
  }

  // Get change statistics
  getChangeStats() {
    return {
      totalChanged: this.updateQueue.size,
      totalChanges: Array.from(this.entityChanges.values()).reduce((sum, changes) => sum + changes.size, 0),
      eventStats: this.stats
    };
  }
}

// Entity Change Tracker for efficient updates
export class EntityChangeTracker {
  constructor() {
    this.trackedEntities = new Map(); // entityId -> { entity, lastState, changeFlags }
    this.changeThreshold = 0.1; // Minimum change to trigger update
    this.stats = {
      totalTracked: 0,
      totalChanges: 0,
      skippedUpdates: 0
    };
  }

  // Start tracking an entity
  track(entity) {
    if (!entity.id) return;
    
    const lastState = this.captureEntityState(entity);
    this.trackedEntities.set(entity.id, {
      entity,
      lastState,
      changeFlags: new Set(),
      lastUpdate: Date.now()
    });
    
    this.stats.totalTracked++;
  }

  // Stop tracking an entity
  untrack(entityId) {
    this.trackedEntities.delete(entityId);
  }

  // Capture current state of an entity
  captureEntityState(entity) {
    return {
      position: { x: entity.position.x, y: entity.position.y },
      angle: entity.angle,
      velocity: { x: entity.velocity.x, y: entity.velocity.y },
      health: entity.attributes?.health,
      ammunition: entity.attributes?.ammunition,
      gasoline: entity.attributes?.gasoline,
      isAlive: entity.isAlive,
      timestamp: Date.now()
    };
  }

  // Check if entity has meaningful changes
  hasSignificantChanges(entityId) {
    const tracked = this.trackedEntities.get(entityId);
    if (!tracked) return false;
    
    const currentState = this.captureEntityState(tracked.entity);
    const lastState = tracked.lastState;
    
    // Check position changes (most important)
    const positionDelta = Math.sqrt(
      Math.pow(currentState.position.x - lastState.position.x, 2) +
      Math.pow(currentState.position.y - lastState.position.y, 2)
    );
    
    if (positionDelta > this.changeThreshold) {
      tracked.changeFlags.add('position');
      return true;
    }
    
    // Check other important changes
    if (currentState.angle !== lastState.angle) {
      tracked.changeFlags.add('angle');
      return true;
    }
    
    if (currentState.isAlive !== lastState.isAlive) {
      tracked.changeFlags.add('alive');
      return true;
    }
    
    if (currentState.health !== lastState.health) {
      tracked.changeFlags.add('health');
      return true;
    }
    
    return false;
  }

  // Get entities that need updates
  getEntitiesNeedingUpdates() {
    const needsUpdate = [];
    
    for (const [entityId, tracked] of this.trackedEntities) {
      if (this.hasSignificantChanges(entityId)) {
        needsUpdate.push({
          entity: tracked.entity,
          changes: Array.from(tracked.changeFlags),
          lastUpdate: tracked.lastUpdate
        });
        
        // Update last state
        tracked.lastState = this.captureEntityState(tracked.entity);
        tracked.changeFlags.clear();
        tracked.lastUpdate = Date.now();
        
        this.stats.totalChanges++;
      } else {
        this.stats.skippedUpdates++;
      }
    }
    
    return needsUpdate;
  }

  // Get tracking statistics
  getStats() {
    return {
      ...this.stats,
      trackedCount: this.trackedEntities.size
    };
  }

  // Clear all tracking
  clear() {
    this.trackedEntities.clear();
    this.stats = {
      totalTracked: 0,
      totalChanges: 0,
      skippedUpdates: 0
    };
  }
}

// Lazy Evaluation System for expensive calculations
export class LazyEvaluator {
  constructor() {
    this.cache = new Map(); // key -> { value, timestamp, ttl }
    this.evaluators = new Map(); // key -> evaluation function
    this.defaultTTL = 1000; // 1 second default TTL
    this.stats = {
      totalEvaluations: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  // Register an evaluator function
  register(key, evaluator, ttl = this.defaultTTL) {
    this.evaluators.set(key, { evaluator, ttl });
  }

  // Evaluate a value (lazy)
  evaluate(key, ...args) {
    const cached = this.cache.get(key);
    const now = Date.now();
    
    // Check if we have a valid cached value
    if (cached && (now - cached.timestamp) < cached.ttl) {
      this.stats.cacheHits++;
      return cached.value;
    }
    
    // Need to evaluate
    this.stats.cacheMisses++;
    this.stats.totalEvaluations++;
    
    const evaluator = this.evaluators.get(key);
    if (!evaluator) {
      throw new Error(`No evaluator registered for key: ${key}`);
    }
    
    const value = evaluator.evaluator(...args);
    
    // Cache the result
    this.cache.set(key, {
      value,
      timestamp: now,
      ttl: evaluator.ttl
    });
    
    return value;
  }

  // Invalidate a cached value
  invalidate(key) {
    this.cache.delete(key);
  }

  // Clear all cached values
  clear() {
    this.cache.clear();
  }

  // Get evaluation statistics
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      hitRate: this.stats.totalEvaluations > 0 ? 
        (this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) * 100).toFixed(1) + '%' : '0%'
    };
  }
}

// Global event system instance
export const eventSystem = new EventSystem();
export const changeTracker = new EntityChangeTracker();
export const lazyEvaluator = new LazyEvaluator();
