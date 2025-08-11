// Object Pooling System for Memory Management Optimization
// Eliminates garbage collection spikes and reduces memory allocation/deallocation

export class ObjectPool {
  constructor(createFn, resetFn, initialSize = 50, maxSize = 200) {
    this.createFn = createFn;      // Function to create new objects
    this.resetFn = resetFn;        // Function to reset objects for reuse
    this.initialSize = initialSize;
    this.maxSize = maxSize;
    this.pool = [];               // Available objects
    this.activeObjects = new Set(); // Currently in-use objects
    this.stats = {
      created: 0,
      reused: 0,
      totalRequests: 0,
      poolHits: 0,
      poolMisses: 0
    };
    
    // Pre-populate the pool
    this.prePopulate();
  }

  // Pre-populate the pool with initial objects
  prePopulate() {
    for (let i = 0; i < this.initialSize; i++) {
      this.pool.push(this.createFn());
    }
  }

  // Get an object from the pool
  get() {
    this.stats.totalRequests++;
    
    let obj;
    if (this.pool.length > 0) {
      // Reuse existing object
      obj = this.pool.pop();
      this.stats.poolHits++;
      this.stats.reused++;
    } else {
      // Create new object if pool is empty
      obj = this.createFn();
      this.stats.poolMisses++;
      this.stats.created++;
    }
    
    // Reset the object for use
    this.resetFn(obj);
    
    // Track active objects
    this.activeObjects.add(obj);
    
    return obj;
  }

  // Return an object to the pool
  release(obj) {
    if (this.activeObjects.has(obj)) {
      this.activeObjects.delete(obj);
      
      // Only add back to pool if we haven't reached max size
      if (this.pool.length < this.maxSize) {
        this.pool.push(obj);
      }
    }
  }

  // Release all active objects
  releaseAll() {
    for (const obj of this.activeObjects) {
      this.release(obj);
    }
  }

  // Get pool statistics
  getStats() {
    return {
      ...this.stats,
      poolSize: this.pool.length,
      activeCount: this.activeObjects.size,
      hitRate: this.stats.totalRequests > 0 ? 
        (this.stats.poolHits / this.stats.totalRequests * 100).toFixed(1) + '%' : '0%'
    };
  }

  // Clear the pool
  clear() {
    this.pool.length = 0;
    this.activeObjects.clear();
    this.stats = {
      created: 0,
      reused: 0,
      totalRequests: 0,
      poolHits: 0,
      poolMisses: 0
    };
  }
}

// Shell Object Pool - Most critical for performance
export class ShellPool extends ObjectPool {
  constructor() {
    super(
      // Create function - create actual Shell instances
      () => {
        const shell = {
          id: null,
          shooterId: null,
          position: { x: 0, y: 0 },
          velocity: { x: 0, y: 0 },
          timestamp: 0,
          shooterImmunity: 0,
          bounds: null
        };
        
        // Add required methods to match Shell class interface
        shell.update = function(deltaTime) {
          this.position.x += this.velocity.x * (deltaTime / 1000);
          this.position.y += this.velocity.y * (deltaTime / 1000);
          
          // Update bounds when position changes
          if (this.bounds) {
            this.bounds.x = this.position.x - 2.5;
            this.bounds.y = this.position.y - 2.5;
          }
        };
        
        // Add velocity methods to match Vector2 interface
        shell.velocity.magnitude = function() {
          return Math.sqrt(this.x * this.x + this.y * this.y);
        };
        
        shell.velocity.normalize = function() {
          const mag = this.magnitude();
          if (mag === 0) return { x: 0, y: 0 };
          return { x: this.x / mag, y: this.y / mag };
        };
        
        shell.isExpired = function() {
          return this.position.x < 0 || 
                 this.position.x > 1500 ||
                 this.position.y < 0 || 
                 this.position.y > 900;
        };
        
        shell.getBoundingBox = function() {
          return this.bounds || {
            x: this.position.x - 2.5,
            y: this.position.y - 2.5,
            width: 5,
            height: 5
          };
        };
        
        return shell;
      },
      // Reset function
      (shell) => {
        shell.id = null;
        shell.shooterId = null;
        shell.position.x = 0;
        shell.position.y = 0;
        shell.velocity.x = 0;
        shell.velocity.y = 0;
        shell.timestamp = 0;
        shell.shooterImmunity = 0;
        shell.bounds = null;
      },
      100,  // Initial size (more shells needed)
      500   // Max size
    );
  }

  // Get a shell with specific properties
  getShell(shooterId, position, velocity, timestamp, shooterImmunity = 0) {
    const shell = this.get();
    shell.shooterId = shooterId;
    shell.position.x = position.x;
    shell.position.y = position.y;
    shell.velocity.x = velocity.x;
    shell.velocity.y = velocity.y;
    shell.timestamp = timestamp;
    shell.shooterImmunity = shooterImmunity;
    
    // Generate unique ID
    shell.id = `shell_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Update bounds
    shell.bounds = {
      x: position.x - 2.5,
      y: position.y - 2.5,
      width: 5,
      height: 5
    };
    
    return shell;
  }
}

// Vector2 Object Pool for mathematical operations
export class Vector2Pool extends ObjectPool {
  constructor() {
    super(
      // Create function
      () => ({ x: 0, y: 0 }),
      // Reset function
      (vector) => {
        vector.x = 0;
        vector.y = 0;
      },
      200,  // Initial size (many vectors needed)
      1000  // Max size
    );
  }

  // Get a vector with specific coordinates
  getVector(x = 0, y = 0) {
    const vector = this.get();
    vector.x = x;
    vector.y = y;
    return vector;
  }

  // Get a vector from another vector (copy)
  getVectorFrom(other) {
    const vector = this.get();
    vector.x = other.x;
    vector.y = other.y;
    return vector;
  }
}

// Bounds Object Pool for collision detection
export class BoundsPool extends ObjectPool {
  constructor() {
    super(
      // Create function
      () => ({ x: 0, y: 0, width: 0, height: 0 }),
      // Reset function
      (bounds) => {
        bounds.x = 0;
        bounds.y = 0;
        bounds.width = 0;
        bounds.height = 0;
      },
      100,  // Initial size
      500   // Max size
    );
  }

  // Get bounds with specific dimensions
  getBounds(x, y, width, height) {
    const bounds = this.get();
    bounds.x = x;
    bounds.y = y;
    bounds.width = width;
    bounds.height = height;
    return bounds;
  }
}

// Memory Manager for coordinating all pools
export class MemoryManager {
  constructor() {
    this.pools = {
      shell: new ShellPool(),
      vector2: new Vector2Pool(),
      bounds: new BoundsPool()
    };
    
    this.stats = {
      totalMemory: 0,
      activeObjects: 0,
      poolEfficiency: 0
    };
  }

  // Get a shell from the pool
  getShell(shooterId, position, velocity, timestamp, shooterImmunity = 0) {
    return this.pools.shell.getShell(shooterId, position, velocity, timestamp, shooterImmunity);
  }

  // Get a vector from the pool
  getVector(x = 0, y = 0) {
    return this.pools.vector2.getVector(x, y);
  }

  // Get bounds from the pool
  getBounds(x, y, width, height) {
    return this.pools.bounds.getBounds(x, y, width, height);
  }

  // Release an object back to its appropriate pool
  release(obj) {
    if (obj.shooterId !== undefined) {
      // It's a shell
      this.pools.shell.release(obj);
    } else if (obj.x !== undefined && obj.y !== undefined && obj.width !== undefined && obj.height !== undefined) {
      // It's bounds
      this.pools.bounds.release(obj);
    } else if (obj.x !== undefined && obj.y !== undefined) {
      // It's a vector
      this.pools.vector2.release(obj);
    }
  }

  // Release all objects from all pools
  releaseAll() {
    Object.values(this.pools).forEach(pool => pool.releaseAll());
  }

  // Get comprehensive memory statistics
  getStats() {
    const poolStats = {};
    let totalActive = 0;
    let totalPooled = 0;
    
    for (const [name, pool] of Object.entries(this.pools)) {
      const stats = pool.getStats();
      poolStats[name] = stats;
      totalActive += stats.activeCount;
      totalPooled += stats.poolSize;
    }
    
    return {
      pools: poolStats,
      totalActive,
      totalPooled,
      totalObjects: totalActive + totalPooled,
      efficiency: totalActive > 0 ? 
        (totalPooled / totalActive * 100).toFixed(1) + '%' : '0%'
    };
  }

  // Clear all pools
  clear() {
    Object.values(this.pools).forEach(pool => pool.clear());
  }
}

// Global memory manager instance
export const memoryManager = new MemoryManager();
