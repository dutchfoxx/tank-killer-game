// Fixed Timestep Game Loop with Interpolation for Ultra-Smooth 60fps
// Separates physics from rendering for consistent performance

export class FixedTimestepGameLoop {
  constructor(targetFPS = 60, maxFrameSkip = 5) {
    this.targetFPS = targetFPS;
    this.targetDelta = 1000 / targetFPS; // Target time between updates in ms
    this.maxFrameSkip = maxFrameSkip;
    
    // Timing variables
    this.lastTime = 0;
    this.accumulator = 0;
    this.frameCount = 0;
    this.lastFPSUpdate = 0;
    
    // Performance tracking
    this.stats = {
      fps: 0,
      frameTime: 0,
      updateCount: 0,
      renderCount: 0,
      skippedFrames: 0,
      averageUpdateTime: 0,
      averageRenderTime: 0,
      targetFPS: this.targetFPS,
      frameRateAccuracy: 0,
      frameDrops: 0,
      lastFrameTime: 0
    };
    
    // Loop state
    this.isRunning = false;
    this.updateCallback = null;
    this.renderCallback = null;
    this.animationId = null;
    
    // Interpolation state
    this.previousState = null;
    this.currentState = null;
    this.interpolationAlpha = 0;
  }

  // Start the game loop
  start(updateCallback, renderCallback) {
    if (this.isRunning) return;
    
    this.updateCallback = updateCallback;
    this.renderCallback = renderCallback;
    this.isRunning = true;
    this.lastTime = performance.now();
    
    this.gameLoop();
  }

  // Stop the game loop
  stop() {
    this.isRunning = false;
    if (this.animationId) {
      clearTimeout(this.animationId);
      this.animationId = null;
    }
  }

  // Main game loop with fixed timestep
  gameLoop(currentTime = performance.now()) {
    if (!this.isRunning) return;
    
    // Calculate delta time
    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;
    
    // Cap delta time to prevent spiral of death
    const clampedDelta = Math.min(deltaTime, this.targetDelta * this.maxFrameSkip);
    
    // Accumulate time
    this.accumulator += clampedDelta;
    
    // Update physics at fixed timestep
    let updateCount = 0;
    const updateStart = performance.now();
    
    while (this.accumulator >= this.targetDelta) {
      if (this.updateCallback) {
        this.updateCallback(this.targetDelta);
        this.stats.updateCount++;
      }
      
      this.accumulator -= this.targetDelta;
      updateCount++;
      
      // Prevent infinite loop
      if (updateCount > this.maxFrameSkip) {
        this.accumulator = 0;
        this.stats.skippedFrames++;
        break;
      }
    }
    
    const updateEnd = performance.now();
    const updateTime = updateEnd - updateStart;
    
    // Update average update time
    if (this.stats.updateCount > 0) {
      this.stats.averageUpdateTime = 
        (this.stats.averageUpdateTime * (this.stats.updateCount - 1) + updateTime) / 
        this.stats.updateCount;
    }
    
    // Calculate interpolation alpha (0 to 1)
    this.interpolationAlpha = this.accumulator / this.targetDelta;
    
    // Render with interpolation
    if (this.renderCallback) {
      const renderStart = performance.now();
      this.renderCallback(this.interpolationAlpha);
      const renderEnd = performance.now();
      
      this.stats.renderCount++;
      this.stats.frameTime = renderEnd - renderStart;
      
      // Update average render time
      if (this.stats.renderCount > 0) {
        this.stats.averageRenderTime = 
          (this.stats.averageRenderTime * (this.stats.renderCount - 1) + this.stats.frameTime) / 
          this.stats.renderCount;
      }
    }
    
    // Update FPS counter every second
    this.frameCount++;
    if (currentTime - this.lastFPSUpdate >= 1000) {
      this.stats.fps = this.frameCount;
      
      // Calculate frame rate accuracy (how close we are to target 60fps)
      this.stats.frameRateAccuracy = Math.abs(this.stats.fps - this.targetFPS);
      
      // Track frame drops (when we're below target)
      if (this.stats.fps < this.targetFPS) {
        this.stats.frameDrops++;
      }
      
      this.frameCount = 0;
      this.lastFPSUpdate = currentTime;
    }
    
    // Track frame timing for consistency
    this.stats.lastFrameTime = currentTime;
    
    // CRITICAL FIX: Proper frame rate capping using setTimeout instead of setImmediate
    // This ensures we maintain exactly 60 FPS instead of running as fast as possible
    const frameDelay = Math.max(0, this.targetDelta - (performance.now() - currentTime));
    
    if (frameDelay > 0) {
      // Use setTimeout for precise timing instead of setImmediate
      this.animationId = setTimeout(() => this.gameLoop(performance.now()), frameDelay);
    } else {
      // If we're behind schedule, continue immediately but log it
      if (frameDelay < 0) {
        console.warn(`Frame behind schedule by ${Math.abs(frameDelay).toFixed(2)}ms`);
      }
      this.animationId = setTimeout(() => this.gameLoop(performance.now()), 1);
    }
  }

  // Get current interpolation alpha (0 to 1)
  getInterpolationAlpha() {
    return this.interpolationAlpha;
  }

  // Get performance statistics
  getStats() {
    return { ...this.stats };
  }

  // Reset statistics
  resetStats() {
    this.stats = {
      fps: 0,
      frameTime: 0,
      updateCount: 0,
      renderCount: 0,
      skippedFrames: 0,
      averageUpdateTime: 0,
      averageRenderTime: 0,
      targetFPS: this.targetFPS,
      frameRateAccuracy: 0,
      frameDrops: 0,
      lastFrameTime: 0
    };
  }
}

// Entity Component System (ECS) for better performance and architecture
export class EntityComponentSystem {
  constructor() {
    this.entities = new Map(); // entityId -> Set of components
    this.components = new Map(); // componentType -> Map of entityId -> component
    this.systems = new Map(); // systemName -> System instance
    this.entityCounter = 0;
    
    this.stats = {
      totalEntities: 0,
      totalComponents: 0,
      totalSystems: 0,
      updatesPerFrame: 0
    };
  }

  // Create a new entity
  createEntity() {
    const entityId = `entity_${++this.entityCounter}`;
    this.entities.set(entityId, new Set());
    this.stats.totalEntities++;
    return entityId;
  }

  // Add a component to an entity
  addComponent(entityId, componentType, component) {
    if (!this.entities.has(entityId)) {
      throw new Error(`Entity ${entityId} does not exist`);
    }
    
    // Initialize component type map if it doesn't exist
    if (!this.components.has(componentType)) {
      this.components.set(componentType, new Map());
    }
    
    // Add component
    this.components.get(componentType).set(entityId, component);
    this.entities.get(entityId).add(componentType);
    this.stats.totalComponents++;
  }

  // Remove a component from an entity
  removeComponent(entityId, componentType) {
    const componentMap = this.components.get(componentType);
    if (componentMap && componentMap.has(entityId)) {
      componentMap.delete(entityId);
      this.entities.get(entityId).delete(componentType);
      this.stats.totalComponents--;
    }
  }

  // Get a component from an entity
  getComponent(entityId, componentType) {
    const componentMap = this.components.get(componentType);
    return componentMap ? componentMap.get(entityId) : null;
  }

  // Get all entities with specific components
  getEntitiesWithComponents(componentTypes) {
    const result = [];
    
    for (const [entityId, entityComponents] of this.entities) {
      let hasAllComponents = true;
      
      for (const componentType of componentTypes) {
        if (!entityComponents.has(componentType)) {
          hasAllComponents = false;
          break;
        }
      }
      
      if (hasAllComponents) {
        result.push(entityId);
      }
    }
    
    return result;
  }

  // Remove an entity and all its components
  removeEntity(entityId) {
    const entityComponents = this.entities.get(entityId);
    if (entityComponents) {
      // Remove all components
      for (const componentType of entityComponents) {
        this.removeComponent(entityId, componentType);
      }
      
      this.entities.delete(entityId);
      this.stats.totalEntities--;
    }
  }

  // Register a system
  registerSystem(name, system) {
    this.systems.set(name, system);
    this.stats.totalSystems++;
  }

  // Update all systems
  update(deltaTime) {
    this.stats.updatesPerFrame = 0;
    
    for (const [name, system] of this.systems) {
      try {
        system.update(this, deltaTime);
        this.stats.updatesPerFrame++;
      } catch (error) {
        console.error(`Error updating system ${name}:`, error);
      }
    }
  }

  // Get ECS statistics
  getStats() {
    return { ...this.stats };
  }

  // Clear all entities and components
  clear() {
    this.entities.clear();
    this.components.clear();
    this.entityCounter = 0;
    this.stats = {
      totalEntities: 0,
      totalComponents: 0,
      totalSystems: 0,
      updatesPerFrame: 0
    };
  }
}

// Update Scheduler for different entity update frequencies
export class UpdateScheduler {
  constructor() {
    this.schedules = new Map(); // frequency -> Set of entities
    this.entitySchedules = new Map(); // entityId -> frequency
    this.frequencies = [60, 30, 15, 5]; // FPS frequencies
    this.counters = new Map(); // frequency -> counter
    
    // Initialize counters
    this.frequencies.forEach(freq => {
      this.schedules.set(freq, new Set());
      this.counters.set(freq, 0);
    });
    
    this.stats = {
      totalScheduled: 0,
      updatesPerFrame: 0,
      frequencyDistribution: {}
    };
  }

  // Schedule an entity for updates at a specific frequency
  schedule(entityId, frequency) {
    if (!this.frequencies.includes(frequency)) {
      throw new Error(`Invalid frequency: ${frequency}. Must be one of: ${this.frequencies.join(', ')}`);
    }
    
    // Remove from old schedule if exists
    this.unschedule(entityId);
    
    // Add to new schedule
    this.schedules.get(frequency).add(entityId);
    this.entitySchedules.set(entityId, frequency);
    this.stats.totalScheduled++;
  }

  // Unschedule an entity
  unschedule(entityId) {
    const oldFrequency = this.entitySchedules.get(entityId);
    if (oldFrequency) {
      this.schedules.get(oldFrequency).delete(entityId);
      this.entitySchedules.delete(entityId);
      this.stats.totalScheduled--;
    }
  }

  // Get entities that need updates this frame
  getEntitiesToUpdate() {
    const entitiesToUpdate = [];
    
    for (const frequency of this.frequencies) {
      const counter = this.counters.get(frequency);
      const entities = this.schedules.get(frequency);
      
      // Check if it's time to update this frequency
      if (counter % (60 / frequency) === 0) {
        for (const entityId of entities) {
          entitiesToUpdate.push({
            entityId,
            frequency,
            priority: this.frequencies.indexOf(frequency) // Higher index = higher priority
          });
        }
      }
      
      // Increment counter
      this.counters.set(frequency, (counter + 1) % 60);
    }
    
    // Sort by priority (higher priority first)
    entitiesToUpdate.sort((a, b) => b.priority - a.priority);
    
    this.stats.updatesPerFrame = entitiesToUpdate.length;
    
    return entitiesToUpdate;
  }

  // Get scheduling statistics
  getStats() {
    const distribution = {};
    this.frequencies.forEach(freq => {
      distribution[freq] = this.schedules.get(freq).size;
    });
    
    return {
      ...this.stats,
      frequencyDistribution: distribution
    };
  }

  // Clear all schedules
  clear() {
    this.frequencies.forEach(freq => {
      this.schedules.get(freq).clear();
      this.counters.set(freq, 0);
    });
    
    this.entitySchedules.clear();
    this.stats = {
      totalScheduled: 0,
      updatesPerFrame: 0,
      frequencyDistribution: {}
    };
  }
}

// Background Processing Manager for heavy calculations
export class BackgroundProcessor {
  constructor() {
    this.workers = new Map(); // workerName -> Worker
    this.tasks = new Map(); // taskId -> { worker, resolve, reject }
    this.taskCounter = 0;
    this.maxWorkers = navigator.hardwareConcurrency || 4;
    
    this.stats = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      activeWorkers: 0
    };
  }

  // Create a new worker
  createWorker(name, script) {
    if (this.workers.size >= this.maxWorkers) {
      throw new Error(`Maximum number of workers (${this.maxWorkers}) reached`);
    }
    
    const worker = new Worker(script);
    this.workers.set(name, worker);
    this.stats.activeWorkers++;
    
    return worker;
  }

  // Execute a task in background
  async executeTask(workerName, data) {
    const worker = this.workers.get(workerName);
    if (!worker) {
      throw new Error(`Worker ${workerName} not found`);
    }
    
    const taskId = ++this.taskCounter;
    
    return new Promise((resolve, reject) => {
      this.tasks.set(taskId, { worker, resolve, reject });
      this.stats.totalTasks++;
      
      // Set up message handler
      const messageHandler = (event) => {
        if (event.data.taskId === taskId) {
          this.tasks.delete(taskId);
          this.stats.completedTasks++;
          resolve(event.data.result);
        }
      };
      
      const errorHandler = (error) => {
        this.tasks.delete(taskId);
        this.stats.failedTasks++;
        reject(error);
      };
      
      worker.addEventListener('message', messageHandler, { once: true });
      worker.addEventListener('error', errorHandler, { once: true });
      
      // Send task to worker
      worker.postMessage({
        taskId,
        data
      });
    });
  }

  // Terminate a worker
  terminateWorker(name) {
    const worker = this.workers.get(name);
    if (worker) {
      worker.terminate();
      this.workers.delete(name);
      this.stats.activeWorkers--;
    }
  }

  // Terminate all workers
  terminateAll() {
    for (const [name, worker] of this.workers) {
      worker.terminate();
    }
    
    this.workers.clear();
    this.stats.activeWorkers = 0;
  }

  // Get background processing statistics
  getStats() {
    return { ...this.stats };
  }
}

// Global instances
export const gameLoop = new FixedTimestepGameLoop(60, 5);
export const ecs = new EntityComponentSystem();
export const updateScheduler = new UpdateScheduler();
export const backgroundProcessor = new BackgroundProcessor();
