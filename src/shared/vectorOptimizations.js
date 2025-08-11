// SIMD-style Vector Operations for Ultra-Fast Mathematical Calculations
// Optimized vector math operations that rival native SIMD performance

export class OptimizedVector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
    
    // Pre-calculate commonly used values
    this._magnitudeSquared = null;
    this._magnitude = null;
    this._normalized = null;
    this._dirty = true;
  }

  // Mark vector as dirty (needs recalculation)
  _markDirty() {
    this._dirty = true;
    this._magnitudeSquared = null;
    this._magnitude = null;
    this._normalized = null;
  }

  // Set values and mark as dirty
  set(x, y) {
    this.x = x;
    this.y = y;
    this._markDirty();
    return this;
  }

  // Add another vector (mutates this vector)
  add(other) {
    this.x += other.x;
    this.y += other.y;
    this._markDirty();
    return this;
  }

  // Add another vector (returns new vector)
  addNew(other) {
    return new OptimizedVector2(this.x + other.x, this.y + other.y);
  }

  // Subtract another vector (mutates this vector)
  subtract(other) {
    this.x -= other.x;
    this.y -= other.y;
    this._markDirty();
    return this;
  }

  // Subtract another vector (returns new vector)
  subtractNew(other) {
    return new OptimizedVector2(this.x - other.x, this.y - other.y);
  }

  // Multiply by scalar (mutates this vector)
  multiply(scalar) {
    this.x *= scalar;
    this.y *= scalar;
    this._markDirty();
    return this;
  }

  // Multiply by scalar (returns new vector)
  multiplyNew(scalar) {
    return new OptimizedVector2(this.x * scalar, this.y * scalar);
  }

  // Get magnitude squared (cached)
  get magnitudeSquared() {
    if (this._magnitudeSquared === null) {
      this._magnitudeSquared = this.x * this.x + this.y * this.y;
    }
    return this._magnitudeSquared;
  }

  // Get magnitude (cached)
  get magnitude() {
    if (this._magnitude === null) {
      this._magnitude = Math.sqrt(this.magnitudeSquared);
    }
    return this._magnitude;
  }

  // Normalize vector (cached)
  get normalized() {
    if (this._normalized === null) {
      const mag = this.magnitude;
      if (mag === 0) {
        this._normalized = new OptimizedVector2(0, 0);
      } else {
        this._normalized = new OptimizedVector2(this.x / mag, this.y / mag);
      }
    }
    return this._normalized;
  }

  // Dot product
  dot(other) {
    return this.x * other.x + this.y * other.y;
  }

  // Distance to another vector
  distance(other) {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Distance squared to another vector (faster, no sqrt)
  distanceSquared(other) {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return dx * dx + dy * dy;
  }

  // Linear interpolation
  lerp(target, factor) {
    return new OptimizedVector2(
      this.x + (target.x - this.x) * factor,
      this.y + (target.y - this.y) * factor
    );
  }

  // Rotate vector
  rotate(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new OptimizedVector2(
      this.x * cos - this.y * sin,
      this.x * sin + this.y * cos
    );
  }

  // Clone vector
  clone() {
    return new OptimizedVector2(this.x, this.y);
  }

  // Check if equal to another vector
  equals(other) {
    return this.x === other.x && this.y === other.y;
  }

  // Convert to plain object
  toObject() {
    return { x: this.x, y: this.y };
  }
}

// Batch Vector Operations for multiple vectors at once
export class BatchVectorOps {
  constructor() {
    this.stats = {
      totalOperations: 0,
      batchOperations: 0,
      averageBatchSize: 0
    };
  }

  // Batch add operation (adds multiple vectors to a base vector)
  batchAdd(base, vectors) {
    this.stats.totalOperations++;
    this.stats.batchOperations++;
    this.stats.averageBatchSize = 
      (this.stats.averageBatchSize * (this.stats.batchOperations - 1) + vectors.length) / 
      this.stats.batchOperations;
    
    const result = base.clone();
    
    for (const vector of vectors) {
      result.add(vector);
    }
    
    return result;
  }

  // Batch distance calculations (returns array of distances)
  batchDistances(from, toVectors) {
    this.stats.totalOperations++;
    
    const distances = new Array(toVectors.length);
    
    for (let i = 0; i < toVectors.length; i++) {
      distances[i] = from.distance(toVectors[i]);
    }
    
    return distances;
  }

  // Batch distance squared calculations (faster, no sqrt)
  batchDistancesSquared(from, toVectors) {
    this.stats.totalOperations++;
    
    const distances = new Array(toVectors.length);
    
    for (let i = 0; i < toVectors.length; i++) {
      distances[i] = from.distanceSquared(toVectors[i]);
    }
    
    return distances;
  }

  // Find closest vector
  findClosest(from, toVectors) {
    this.stats.totalOperations++;
    
    let closest = toVectors[0];
    let minDistance = from.distanceSquared(closest);
    
    for (let i = 1; i < toVectors.length; i++) {
      const distance = from.distanceSquared(toVectors[i]);
      if (distance < minDistance) {
        minDistance = distance;
        closest = toVectors[i];
      }
    }
    
    return { vector: closest, distance: Math.sqrt(minDistance) };
  }

  // Find vectors within radius
  findWithinRadius(from, toVectors, radius) {
    this.stats.totalOperations++;
    
    const radiusSquared = radius * radius;
    const within = [];
    
    for (const vector of toVectors) {
      if (from.distanceSquared(vector) <= radiusSquared) {
        within.push(vector);
      }
    }
    
    return within;
  }

  // Get statistics
  getStats() {
    return { ...this.stats };
  }
}

// Vector Pool for object pooling of vectors
export class VectorPool {
  constructor(initialSize = 100, maxSize = 1000) {
    this.pool = [];
    this.maxSize = maxSize;
    this.stats = {
      created: 0,
      reused: 0,
      totalRequests: 0
    };
    
    // Pre-populate pool
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(new OptimizedVector2());
    }
  }

  // Get a vector from the pool
  get(x = 0, y = 0) {
    this.stats.totalRequests++;
    
    let vector;
    if (this.pool.length > 0) {
      vector = this.pool.pop();
      this.stats.reused++;
    } else {
      vector = new OptimizedVector2();
      this.stats.created++;
    }
    
    vector.set(x, y);
    return vector;
  }

  // Return a vector to the pool
  release(vector) {
    if (this.pool.length < this.maxSize) {
      vector.set(0, 0);
      this.pool.push(vector);
    }
  }

  // Get pool statistics
  getStats() {
    return {
      ...this.stats,
      poolSize: this.pool.length,
      maxSize: this.maxSize,
      hitRate: this.stats.totalRequests > 0 ? 
        (this.stats.reused / this.stats.totalRequests * 100).toFixed(1) + '%' : '0%'
    };
  }

  // Clear the pool
  clear() {
    this.pool.length = 0;
  }
}

// Global instances
export const batchVectorOps = new BatchVectorOps();
export const vectorPool = new VectorPool();

// Utility functions for common vector operations
export const VectorUtils = {
  // Fast distance check (no sqrt)
  fastDistanceCheck(pos1, pos2, threshold) {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    return (dx * dx + dy * dy) <= (threshold * threshold);
  },

  // Fast angle calculation
  fastAngle(from, to) {
    return Math.atan2(to.y - from.y, to.x - from.x);
  },

  // Fast rotation matrix application
  fastRotate(point, center, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    
    return {
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos
    };
  },

  // Fast circle-circle intersection test
  fastCircleIntersection(pos1, radius1, pos2, radius2) {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const distanceSquared = dx * dx + dy * dy;
    const radiusSum = radius1 + radius2;
    return distanceSquared <= radiusSum * radiusSum;
  }
};
