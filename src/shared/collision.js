// Collision Detection Utilities with Spatial Partitioning Integration
import { createBounds } from './spatialPartitioning.js';

export function checkAABBCollision(box1, box2) {
  return box1.x < box2.x + box2.width &&
         box1.x + box1.width > box2.x &&
         box1.y < box2.y + box2.height &&
         box1.y + box1.height > box2.y;
}

export function checkPointInAABB(point, box) {
  return point.x >= box.x &&
         point.x <= box.x + box.width &&
         point.y >= box.y &&
         point.y <= box.y + box.height;
}

export function checkLineIntersectsAABB(start, end, box) {
  // Check if line segment intersects with AABB
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  
  // Check horizontal edges
  if (dx !== 0) {
    const t1 = (box.x - start.x) / dx;
    const t2 = (box.x + box.width - start.x) / dx;
    const tmin = Math.min(t1, t2);
    const tmax = Math.max(t1, t2);
    
    if (tmin >= 0 && tmin <= 1 && start.y + dy * tmin >= box.y && start.y + dy * tmin <= box.y + box.height) {
      return true;
    }
    if (tmax >= 0 && tmax <= 1 && start.y + dy * tmax >= box.y && start.y + dy * tmax <= box.y + box.height) {
      return true;
    }
  }
  
  // Check vertical edges
  if (dy !== 0) {
    const t1 = (box.y - start.y) / dy;
    const t2 = (box.y + box.height - start.y) / dy;
    const tmin = Math.min(t1, t2);
    const tmax = Math.max(t1, t2);
    
    if (tmin >= 0 && tmin <= 1 && start.x + dx * tmin >= box.x && start.x + dx * tmin <= box.x + box.width) {
      return true;
    }
    if (tmax >= 0 && tmax <= 1 && start.x + dx * tmax >= box.x && start.x + dx * tmax <= box.x + box.width) {
      return true;
    }
  }
  
  return false;
}

// OPTIMIZED: Fast distance check using squared distance (avoids square root)
export function getSquaredDistance(pos1, pos2) {
  const dx = pos1.x - pos2.x;
  const dy = pos1.y - pos2.y;
  return dx * dx + dy * dy;
}

// OPTIMIZED: Fast distance check with early exit for collision detection
export function getDistance(pos1, pos2) {
  const dx = pos1.x - pos2.x;
  const dy = pos1.y - pos2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// OPTIMIZED: Circle-circle collision using squared distance
export function checkCircleCollision(pos1, radius1, pos2, radius2) {
  const minDistance = radius1 + radius2;
  const squaredDistance = getSquaredDistance(pos1, pos2);
  return squaredDistance <= minDistance * minDistance;
}

// OPTIMIZED: Fast shell-tank collision with early exit
export function checkShellTankCollision(shell, tank) {
  // First check: AABB collision (fastest)
  const shellBox = shell.getBoundingBox();
  const tankBox = tank.getBoundingBox();
  
  if (!checkAABBCollision(shellBox, tankBox)) {
    return false;
  }
  
  // Second check: High-velocity shell pass-through detection
  const shellSpeed = shell.velocity.magnitude();
  if (shellSpeed > 10) {
    const shellRadius = 2.5;
    const tankCenter = { x: tank.position.x, y: tank.position.y };
    const distance = getDistance(shell.position, tankCenter);
    
    // If shell is very close to tank center, consider it a hit
    if (distance < 20) {
      return true;
    }
  }
  
  return true; // AABB collision detected
}

// OPTIMIZED: Batch collision detection for multiple entities
export function checkBatchCollisions(entities, spatialManager) {
  const collisions = [];
  
  for (const entity of entities) {
    if (!entity.bounds) continue;
    
    // Get potential collision candidates using spatial partitioning
    const candidates = spatialManager.getCollisionCandidates(entity);
    
    for (const candidate of candidates) {
      if (checkAABBCollision(entity.bounds, candidate.bounds)) {
        collisions.push({
          entity1: entity,
          entity2: candidate,
          type: 'aabb'
        });
      }
    }
  }
  
  return collisions;
}

// OPTIMIZED: Create bounds for different entity types
export function createEntityBounds(entity) {
  if (entity.bounds) {
    return entity.bounds;
  }
  
  // Tank bounds
  if (entity.position && entity.attributes) {
    const size = 44; // Tank collision size (22 * 2)
    return createBounds(
      entity.position.x - size / 2,
      entity.position.y - size / 2,
      size,
      size
    );
  }
  
  // Shell bounds
  if (entity.position && entity.velocity) {
    const size = 5; // Shell size
    return createBounds(
      entity.position.x - size / 2,
      entity.position.y - size / 2,
      size,
      size
    );
  }
  
  // Tree bounds
  if (entity.position && entity.size) {
    const trunkSize = entity.size / 8; // Tree trunk collision size
    return createBounds(
      entity.position.x - trunkSize / 2,
      entity.position.y - entity.size / 2 - trunkSize / 2,
      trunkSize,
      trunkSize
    );
  }
  
  // Upgrade bounds
  if (entity.position) {
    const size = 22.5; // Upgrade size
    return createBounds(
      entity.position.x - size / 2,
      entity.position.y - size / 2,
      size,
      size
    );
  }
  
  // Fallback
  return createBounds(0, 0, 20, 20);
}

export function getRandomPositionAvoidingObstacles(obstacles, minDistance = 50, minX = 50, minY = 50, maxX = 1450, maxY = 850) {
  const maxAttempts = 100;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    const position = {
      x: Math.random() * (maxX - minX) + minX,
      y: Math.random() * (maxY - minY) + minY
    };
    
    let tooClose = false;
    for (const obstacle of obstacles) {
      const distance = getDistance(position, obstacle.position);
      if (distance < minDistance) {
        tooClose = true;
        break;
      }
    }
    
    if (!tooClose) {
      return position;
    }
    
    attempts++;
  }
  
  // Fallback to random position if no good spot found
  return {
    x: Math.random() * (maxX - minX) + minX,
    y: Math.random() * (maxY - minY) + minY
  };
} 