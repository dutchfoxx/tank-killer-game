// Collision Detection Utilities
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
      const distance = Math.sqrt(
        Math.pow(position.x - obstacle.position.x, 2) +
        Math.pow(position.y - obstacle.position.y, 2)
      );
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