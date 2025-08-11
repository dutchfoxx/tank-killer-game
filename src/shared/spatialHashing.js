// Spatial Hashing System for Ultra-Fast Collision Detection
// Provides O(1) collision detection for most scenarios - faster than QuadTree

export class SpatialHash {
  constructor(cellSize = 50) {
    this.cellSize = cellSize;
    this.grid = new Map(); // cellKey -> Set of entities
    this.entityCells = new Map(); // entityId -> Set of cell keys
    this.stats = {
      totalQueries: 0,
      totalInserts: 0,
      totalRemoves: 0,
      averageQuerySize: 0
    };
  }

  // Generate cell key from position
  getCellKey(x, y) {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    return `${cellX},${cellY}`;
  }

  // Get all cell keys that an entity occupies
  getEntityCells(entity) {
    if (!entity.bounds) return [];
    
    const cells = new Set();
    const minX = Math.floor(entity.bounds.x / this.cellSize);
    const maxX = Math.floor((entity.bounds.x + entity.bounds.width) / this.cellSize);
    const minY = Math.floor(entity.bounds.y / this.cellSize);
    const maxY = Math.floor((entity.bounds.y + entity.bounds.height) / this.cellSize);
    
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        cells.add(`${x},${y}`);
      }
    }
    
    return Array.from(cells);
  }

  // Insert an entity into the spatial hash
  insert(entity) {
    if (!entity.bounds || !entity.id) return;
    
    const cellKeys = this.getEntityCells(entity);
    
    // Remove from old cells if entity was already tracked
    this.remove(entity.id);
    
    // Add to new cells
    for (const cellKey of cellKeys) {
      if (!this.grid.has(cellKey)) {
        this.grid.set(cellKey, new Set());
      }
      this.grid.get(cellKey).add(entity);
    }
    
    // Track which cells this entity occupies
    this.entityCells.set(entity.id, new Set(cellKeys));
    
    this.stats.totalInserts++;
  }

  // Remove an entity from the spatial hash
  remove(entityId) {
    const cells = this.entityCells.get(entityId);
    if (!cells) return;
    
    // Remove from all cells
    for (const cellKey of cells) {
      const cell = this.grid.get(cellKey);
      if (cell) {
        // Find and remove the entity from this cell
        for (const entity of cell) {
          if (entity.id === entityId) {
            cell.delete(entity);
            break;
          }
        }
        
        // Remove empty cells
        if (cell.size === 0) {
          this.grid.delete(cellKey);
        }
      }
    }
    
    this.entityCells.delete(entityId);
    this.stats.totalRemoves++;
  }

  // Get potential collision candidates for an entity
  getCollisionCandidates(entity, searchRadius = 0) {
    this.stats.totalQueries++;
    
    const candidates = new Set();
    let searchBounds = entity.bounds;
    
    if (searchRadius > 0) {
      searchBounds = {
        x: entity.bounds.x - searchRadius,
        y: entity.bounds.y - searchRadius,
        width: entity.bounds.width + searchRadius * 2,
        height: entity.bounds.height + searchRadius * 2
      };
    }
    
    const cellKeys = this.getEntityCells({ bounds: searchBounds });
    
    for (const cellKey of cellKeys) {
      const cell = this.grid.get(cellKey);
      if (cell) {
        for (const candidate of cell) {
          if (candidate.id !== entity.id) {
            candidates.add(candidate);
          }
        }
      }
    }
    
    // Update stats
    this.stats.averageQuerySize = 
      (this.stats.averageQuerySize * (this.stats.totalQueries - 1) + candidates.size) / 
      this.stats.totalQueries;
    
    return Array.from(candidates);
  }

  // Get all entities in a specific area
  getEntitiesInArea(bounds) {
    const candidates = new Set();
    const cellKeys = this.getEntityCells({ bounds });
    
    for (const cellKey of cellKeys) {
      const cell = this.grid.get(cellKey);
      if (cell) {
        for (const entity of cell) {
          candidates.add(entity);
        }
      }
    }
    
    return Array.from(candidates);
  }

  // Clear all entities
  clear() {
    this.grid.clear();
    this.entityCells.clear();
    this.stats = {
      totalQueries: 0,
      totalInserts: 0,
      totalRemoves: 0,
      averageQuerySize: 0
    };
  }

  // Get performance statistics
  getStats() {
    let totalEntities = 0;
    let totalCells = this.grid.size;
    
    for (const cell of this.grid.values()) {
      totalEntities += cell.size;
    }
    
    return {
      ...this.stats,
      totalEntities,
      totalCells,
      averageEntitiesPerCell: totalCells > 0 ? (totalEntities / totalCells).toFixed(2) : 0,
      efficiency: this.stats.totalQueries > 0 ? 
        (this.stats.totalQueries / this.stats.averageQuerySize).toFixed(2) : 0
    };
  }
}

// Hybrid Spatial System - Combines Spatial Hash and QuadTree for best performance
export class HybridSpatialSystem {
  constructor(worldBounds, cellSize = 50, maxObjectsPerNode = 15, maxLevels = 4) {
    this.spatialHash = new SpatialHash(cellSize);
    this.quadTree = null; // Will be initialized when needed
    this.worldBounds = worldBounds;
    this.maxObjectsPerNode = maxObjectsPerNode;
    this.maxLevels = maxLevels;
    this.entityCount = 0;
    this.switchThreshold = 100; // Switch to QuadTree when entity count exceeds this
    
    this.stats = {
      mode: 'hash',
      totalQueries: 0,
      hashQueries: 0,
      quadTreeQueries: 0
    };
  }

  // Insert an entity
  insert(entity) {
    this.entityCount++;
    
    // Choose optimal spatial structure based on entity count
    if (this.entityCount > this.switchThreshold && !this.quadTree) {
      this.switchToQuadTree();
    }
    
    if (this.quadTree) {
      this.quadTree.insert(entity);
    } else {
      this.spatialHash.insert(entity);
    }
  }

  // Remove an entity
  remove(entityId) {
    this.entityCount--;
    
    if (this.quadTree) {
      // For QuadTree, we need to rebuild since we don't have individual removal
      // This is handled by the game engine's updateSpatialManager
    } else {
      this.spatialHash.remove(entityId);
    }
  }

  // Switch to QuadTree for better performance with many entities
  switchToQuadTree() {
    console.log('🔄 Switching to QuadTree for better performance with many entities');
    
    // Import QuadTree dynamically to avoid circular dependencies
    import('./spatialPartitioning.js').then(({ QuadTree, createBounds }) => {
      this.quadTree = new QuadTree(
        createBounds(this.worldBounds.x, this.worldBounds.y, this.worldBounds.width, this.worldBounds.height),
        this.maxObjectsPerNode,
        this.maxLevels
      );
      
      // Migrate all entities from spatial hash to quad tree
      for (const [cellKey, entities] of this.spatialHash.grid) {
        for (const entity of entities) {
          this.quadTree.insert(entity);
        }
      }
      
      this.spatialHash.clear();
      this.stats.mode = 'quadtree';
    });
  }

  // Get collision candidates
  getCollisionCandidates(entity, searchRadius = 0) {
    this.stats.totalQueries++;
    
    if (this.quadTree) {
      this.stats.quadTreeQueries++;
      return this.quadTree.retrieve(entity.bounds);
    } else {
      this.stats.hashQueries++;
      return this.spatialHash.getCollisionCandidates(entity, searchRadius);
    }
  }

  // Update all entities (rebuild spatial structures)
  update(entities) {
    this.entityCount = entities.length;
    
    if (this.quadTree) {
      this.quadTree.clear();
      for (const entity of entities) {
        if (entity.bounds) {
          this.quadTree.insert(entity);
        }
      }
    } else {
      this.spatialHash.clear();
      for (const entity of entities) {
        if (entity.bounds) {
          this.spatialHash.insert(entity);
        }
      }
    }
  }

  // Get comprehensive statistics
  getStats() {
    const baseStats = {
      ...this.stats,
      entityCount: this.entityCount,
      mode: this.stats.mode
    };
    
    if (this.quadTree) {
      return { ...baseStats, quadTree: this.quadTree.getStats() };
    } else {
      return { ...baseStats, spatialHash: this.spatialHash.getStats() };
    }
  }

  // Clear all entities
  clear() {
    this.entityCount = 0;
    
    if (this.quadTree) {
      this.quadTree.clear();
    } else {
      this.spatialHash.clear();
    }
  }
}
