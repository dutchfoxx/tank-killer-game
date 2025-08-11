// Spatial Partitioning System for Optimized Collision Detection
// Reduces collision detection from O(n²) to O(log n) complexity

export class QuadTree {
  constructor(bounds, maxObjects = 10, maxLevels = 4, level = 0) {
    // Ensure bounds is a Bounds instance
    this.bounds = bounds instanceof Bounds ? bounds : new Bounds(bounds.x, bounds.y, bounds.width, bounds.height);
    this.maxObjects = maxObjects;
    this.maxLevels = maxLevels;
    this.level = level;
    
    this.objects = []; // Objects in this node
    this.nodes = [];   // Child nodes (northwest, northeast, southwest, southeast)
    this.isSplit = false;
  }

  // Insert an object into the quadtree
  insert(object) {
    if (!this.bounds.contains(object.bounds)) {
      return false; // Object not in this quad
    }

    if (this.objects.length < this.maxObjects && !this.isSplit) {
      this.objects.push(object);
      return true;
    }

    // Split if we haven't already
    if (!this.isSplit) {
      this.split();
    }

    // Insert into child nodes
    for (const node of this.nodes) {
      if (node.insert(object)) {
        return true;
      }
    }

    // If object doesn't fit in any child, keep it in this node
    this.objects.push(object);
    return true;
  }

  // Split this node into 4 child nodes
  split() {
    const subWidth = this.bounds.width / 2;
    const subHeight = this.bounds.height / 2;
    const x = this.bounds.x;
    const y = this.bounds.y;

    this.nodes[0] = new QuadTree( // Northwest
      new Bounds(x, y, subWidth, subHeight),
      this.maxObjects,
      this.maxLevels,
      this.level + 1
    );

    this.nodes[1] = new QuadTree( // Northeast
      new Bounds(x + subWidth, y, subWidth, subHeight),
      this.maxObjects,
      this.maxLevels,
      this.level + 1
    );

    this.nodes[2] = new QuadTree( // Southwest
      new Bounds(x, y + subHeight, subWidth, subHeight),
      this.maxObjects,
      this.maxLevels,
      this.level + 1
    );

    this.nodes[3] = new QuadTree( // Southeast
      new Bounds(x + subWidth, y + subHeight, subWidth, subHeight),
      this.maxObjects,
      this.maxLevels,
      this.level + 1
    );

    this.isSplit = true;
  }

  // Retrieve all objects that could collide with the given bounds
  retrieve(bounds) {
    const returnObjects = [];
    
    if (!this.bounds.intersects(bounds)) {
      return returnObjects;
    }

    // Add objects from this node
    for (const object of this.objects) {
      returnObjects.push(object);
    }

    // Add objects from child nodes
    if (this.isSplit) {
      for (const node of this.nodes) {
        returnObjects.push(...node.retrieve(bounds));
      }
    }

    return returnObjects;
  }

  // Clear all objects and nodes
  clear() {
    this.objects = [];
    
    if (this.isSplit) {
      for (const node of this.nodes) {
        node.clear();
      }
      this.nodes = [];
      this.isSplit = false;
    }
  }

  // Get all objects in the quadtree
  getAllObjects() {
    let objects = [...this.objects];
    
    if (this.isSplit) {
      for (const node of this.nodes) {
        objects.push(...node.getAllObjects());
      }
    }
    
    return objects;
  }

  // Get statistics about the quadtree
  getStats() {
    let stats = {
      level: this.level,
      objects: this.objects.length,
      nodes: 0,
      totalObjects: this.objects.length
    };
    
    if (this.isSplit) {
      for (const node of this.nodes) {
        const nodeStats = node.getStats();
        stats.nodes += nodeStats.nodes + 1;
        stats.totalObjects += nodeStats.totalObjects;
      }
    }
    
    return stats;
  }
}

// Enhanced bounds object with collision detection methods
export class Bounds {
  constructor(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  // Check if this bounds contains another bounds
  contains(bounds) {
    return bounds.x >= this.x &&
           bounds.y >= this.y &&
           bounds.x + bounds.width <= this.x + this.width &&
           bounds.y + bounds.height <= this.y + this.height;
  }

  // Check if this bounds intersects with another bounds
  intersects(bounds) {
    return this.x < bounds.x + bounds.width &&
           this.x + this.width > bounds.x &&
           this.y < bounds.y + bounds.height &&
           this.y + this.height > bounds.y;
  }

  // Get the center point of these bounds
  getCenter() {
    return {
      x: this.x + this.width / 2,
      y: this.y + this.height / 2
    };
  }

  // Expand bounds by a given amount
  expand(amount) {
    return new Bounds(
      this.x - amount,
      this.y - amount,
      this.width + amount * 2,
      this.height + amount * 2
    );
  }
}

// Spatial Manager for the game world
export class SpatialManager {
  constructor(worldBounds, maxObjectsPerNode = 10, maxLevels = 4) {
    this.worldBounds = worldBounds;
    this.quadTree = new QuadTree(worldBounds, maxObjectsPerNode, maxLevels);
    this.entityMap = new Map(); // Track entities by ID for quick updates
    this.stats = {
      totalQueries: 0,
      totalEntities: 0,
      averageQuerySize: 0
    };
  }

  // Insert or update an entity in the spatial system
  insert(entity) {
    if (!entity.bounds) {
      console.warn('Entity missing bounds:', entity);
      return;
    }

    // Remove old entry if it exists
    this.remove(entity.id);
    
    // Add to entity map
    this.entityMap.set(entity.id, entity);
    
    // Insert into quadtree
    this.quadTree.insert(entity);
    
    this.stats.totalEntities = this.entityMap.size;
  }

  // Remove an entity from the spatial system
  remove(entityId) {
    const entity = this.entityMap.get(entityId);
    if (entity) {
      this.entityMap.delete(entityId);
      // Note: We don't remove from quadtree immediately for performance
      // Instead, we rebuild periodically or on major changes
    }
  }

  // Get potential collision candidates for an entity
  getCollisionCandidates(entity, searchRadius = 0) {
    this.stats.totalQueries++;
    
    // Ensure we have a proper Bounds instance
    let searchBounds = entity.bounds;
    if (!(searchBounds instanceof Bounds)) {
      // Convert to Bounds if it's not already
      searchBounds = new Bounds(
        searchBounds.x || 0,
        searchBounds.y || 0,
        searchBounds.width || 20,
        searchBounds.height || 20
      );
    }
    
    if (searchRadius > 0) {
      searchBounds = searchBounds.expand(searchRadius);
    }
    
    const candidates = this.quadTree.retrieve(searchBounds);
    
    // Update stats
    this.stats.averageQuerySize = 
      (this.stats.averageQuerySize * (this.stats.totalQueries - 1) + candidates.length) / 
      this.stats.totalQueries;
    
    return candidates.filter(candidate => candidate.id !== entity.id);
  }

  // Get all entities in a specific area
  getEntitiesInArea(bounds) {
    return this.quadTree.retrieve(bounds);
  }

  // Rebuild the entire quadtree (call this periodically or when many entities change)
  rebuild() {
    this.quadTree.clear();
    
    // Reinsert all entities
    for (const entity of this.entityMap.values()) {
      if (entity.bounds) {
        this.quadTree.insert(entity);
      }
    }
  }

  // Get performance statistics
  getStats() {
    const quadTreeStats = this.quadTree.getStats();
    return {
      ...this.stats,
      quadTree: quadTreeStats,
      efficiency: this.stats.totalQueries > 0 ? 
        (this.stats.totalQueries / this.stats.averageQuerySize).toFixed(2) : 0
    };
  }

  // Clear all entities
  clear() {
    this.quadTree.clear();
    this.entityMap.clear();
    this.stats = {
      totalQueries: 0,
      totalEntities: 0,
      averageQuerySize: 0
    };
  }
}

// Utility function to create bounds from entity position and size
export function createBoundsFromEntity(entity) {
  if (entity.bounds) {
    return entity.bounds;
  }
  
  // Fallback: create bounds from position and estimated size
  const size = entity.size || 20; // Default size
  return new Bounds(
    entity.position.x - size / 2,
    entity.position.y - size / 2,
    size,
    size
  );
}

// Utility function to create bounds from position and size
export function createBounds(x, y, width, height) {
  return new Bounds(x, y, width, height);
}
