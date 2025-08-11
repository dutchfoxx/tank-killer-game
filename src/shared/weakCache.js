// WeakMap-based Caching System for Memory Management
// Allows garbage collection of unused cached objects to prevent memory leaks

export class WeakCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.cache = new WeakMap();
    this.keys = new Set(); // Track keys for size management
    this.accessCount = new Map(); // Track access frequency
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalRequests: 0
    };
  }

  // Set a value in the cache
  set(key, value) {
    // If we're at max size, evict least recently used
    if (this.keys.size >= this.maxSize) {
      this.evictLRU();
    }
    
    this.cache.set(key, value);
    this.keys.add(key);
    this.accessCount.set(key, Date.now());
  }

  // Get a value from the cache
  get(key) {
    this.stats.totalRequests++;
    
    if (this.cache.has(key)) {
      this.stats.hits++;
      this.accessCount.set(key, Date.now()); // Update access time
      return this.cache.get(key);
    } else {
      this.stats.misses++;
      return null;
    }
  }

  // Check if key exists in cache
  has(key) {
    return this.cache.has(key);
  }

  // Remove a specific key
  delete(key) {
    this.cache.delete(key);
    this.keys.delete(key);
    this.accessCount.delete(key);
  }

  // Evict least recently used item
  evictLRU() {
    if (this.keys.size === 0) return;
    
    let oldestKey = null;
    let oldestTime = Date.now();
    
    for (const key of this.keys) {
      const accessTime = this.accessCount.get(key) || 0;
      if (accessTime < oldestTime) {
        oldestTime = accessTime;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  // Clear all entries
  clear() {
    this.cache = new WeakMap();
    this.keys.clear();
    this.accessCount.clear();
  }

  // Get cache statistics
  getStats() {
    return {
      ...this.stats,
      size: this.keys.size,
      maxSize: this.maxSize,
      hitRate: this.stats.totalRequests > 0 ? 
        (this.stats.hits / this.stats.totalRequests * 100).toFixed(1) + '%' : '0%'
    };
  }
}

// Sprite Cache using WeakMap for automatic cleanup
export class SpriteCache extends WeakCache {
  constructor(maxSize = 200) {
    super(maxSize);
    this.spriteCanvas = new WeakMap(); // Canvas elements
    this.spriteData = new WeakMap();   // Metadata about sprites
  }

  // Cache a sprite with metadata
  setSprite(key, canvas, metadata = {}) {
    this.spriteCanvas.set(key, canvas);
    this.spriteData.set(key, {
      ...metadata,
      lastUsed: Date.now(),
      size: canvas.width * canvas.height * 4 // Approximate memory usage (RGBA)
    });
    
    // Also store in parent cache for key tracking
    super.set(key, { canvas, metadata: this.spriteData.get(key) });
  }

  // Get a sprite from cache
  getSprite(key) {
    const result = super.get(key);
    if (result) {
      // Update last used time
      const metadata = this.spriteData.get(key);
      if (metadata) {
        metadata.lastUsed = Date.now();
      }
      return result.canvas;
    }
    return null;
  }

  // Get sprite metadata
  getSpriteMetadata(key) {
    return this.spriteData.get(key);
  }

  // Get memory usage statistics
  getMemoryStats() {
    let totalMemory = 0;
    let spriteCount = 0;
    
    for (const key of this.keys) {
      const metadata = this.spriteData.get(key);
      if (metadata) {
        totalMemory += metadata.size;
        spriteCount++;
      }
    }
    
    return {
      totalMemory: Math.round(totalMemory / 1024), // KB
      spriteCount,
      averageMemory: spriteCount > 0 ? Math.round(totalMemory / spriteCount / 1024) : 0
    };
  }
}

// Gradient Cache for shell trails and effects
export class GradientCache extends WeakCache {
  constructor(maxSize = 50) {
    super(maxSize);
    this.gradientCanvas = new WeakMap();
  }

  // Cache a gradient
  setGradient(key, gradient, canvas) {
    this.gradientCanvas.set(key, canvas);
    super.set(key, { gradient, canvas });
  }

  // Get a gradient from cache
  getGradient(key) {
    const result = super.get(key);
    return result ? result.gradient : null;
  }
}

// Memory-aware cache manager
export class CacheManager {
  constructor() {
    this.caches = {
      sprites: new SpriteCache(200),
      gradients: new GradientCache(50),
      terrain: new WeakCache(10)
    };
    
    this.memoryThreshold = 50 * 1024 * 1024; // 50MB threshold
    this.lastCleanup = Date.now();
    this.cleanupInterval = 30000; // 30 seconds
  }

  // Get sprite cache
  getSpriteCache() {
    return this.caches.sprites;
  }

  // Get gradient cache
  getGradientCache() {
    return this.caches.gradients;
  }

  // Get terrain cache
  getTerrainCache() {
    return this.caches.terrain;
  }

  // Perform memory cleanup if needed
  cleanup() {
    const now = Date.now();
    
    // Only cleanup periodically
    if (now - this.lastCleanup < this.cleanupInterval) {
      return;
    }
    
    this.lastCleanup = now;
    
    // Check memory usage and cleanup if needed
    const memoryStats = this.caches.sprites.getMemoryStats();
    if (memoryStats.totalMemory > this.memoryThreshold / 1024) { // Convert to KB
      this.performCleanup();
    }
  }

  // Perform aggressive cleanup
  performCleanup() {
    // Clear least recently used items from all caches
    Object.values(this.caches).forEach(cache => {
      if (cache.evictLRU) {
        // Evict 20% of items
        const evictCount = Math.ceil(cache.keys.size * 0.2);
        for (let i = 0; i < evictCount; i++) {
          cache.evictLRU();
        }
      }
    });
  }

  // Get comprehensive cache statistics
  getStats() {
    const stats = {};
    
    for (const [name, cache] of Object.entries(this.caches)) {
      stats[name] = cache.getStats();
      
      // Add memory stats for sprite cache
      if (cache.getMemoryStats) {
        stats[name].memory = cache.getMemoryStats();
      }
    }
    
    return stats;
  }

  // Clear all caches
  clear() {
    Object.values(this.caches).forEach(cache => cache.clear());
  }
}

// Global cache manager instance
export const cacheManager = new CacheManager();
