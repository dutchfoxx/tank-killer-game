import { Vector2 } from './types.js';
import { AI_PARAMS, TANK_ATTRIBUTES } from './constants.js';

export class AIController {
  constructor(tank, gameState, aiLevel = 'intermediate') {
    this.tank = tank;
    this.gameState = gameState;
    this.aiLevel = aiLevel;
    this.target = null;
    this.targetType = null; // 'enemy' or 'upgrade'
    this.lastDecisionTime = 0;
    this.lastShotTime = 0;
    this.stuckPosition = null;
    this.stuckTimer = 0;
    this.wanderTarget = null;
    
    // Performance optimization: cache frequently accessed values
    this.cachedEnemies = null;
    this.cachedUpgrades = null;
    this.lastCacheTime = 0;
    this.cacheValidityTime = 500; // Cache is valid for 500ms
    
    this.setAILevelBehavior();
  }

  setAILevelBehavior() {
    switch (this.aiLevel) {
      case 'easy':
        this.decisionInterval = 1000; // Increased for better performance
        this.minShotInterval = 800;
        this.accuracy = 0.6;
        this.aggressionLevel = 0.3;
        this.retreatThreshold = 0.7;
        this.engagementRange = 200;
        break;
      case 'intermediate':
        this.decisionInterval = 600; // Reduced for more responsive AI
        this.minShotInterval = 300; // Reduced for more frequent shooting
        this.accuracy = 0.8;
        this.aggressionLevel = 0.7; // Increased aggression
        this.retreatThreshold = 0.4; // More aggressive (lower retreat threshold)
        this.engagementRange = 350; // Increased engagement range
        break;
      case 'hard':
        this.decisionInterval = 500; // Reduced for more responsive AI
        this.minShotInterval = 250; // Reduced for more frequent shooting
        this.accuracy = 0.9;
        this.aggressionLevel = 0.85; // Increased aggression
        this.retreatThreshold = 0.25; // More aggressive
        this.engagementRange = 450; // Increased engagement range
        break;
      case 'insane':
        this.decisionInterval = 500; // Increased for better performance
        this.minShotInterval = 200;
        this.accuracy = 0.95;
        this.aggressionLevel = 1.0;
        this.retreatThreshold = 0.1;
        this.engagementRange = 500;
        break;
      default:
        this.decisionInterval = 800; // Increased for better performance
        this.minShotInterval = 400;
        this.accuracy = 0.8;
        this.aggressionLevel = 0.6;
        this.retreatThreshold = 0.5;
        this.engagementRange = 300;
    }
  }

  update(deltaTime) {
    if (!this.tank.isAlive) return;

    const currentTime = Date.now();
    
    // Check if stuck
    this.checkIfStuck(currentTime);
    
    // Make decisions at intervals
    if (currentTime - this.lastDecisionTime > this.decisionInterval) {
      this.makeDecision();
      this.lastDecisionTime = currentTime;
    }

    // Execute current action
    this.executeAction(currentTime, deltaTime);
  }

  checkIfStuck(currentTime) {
    if (!this.stuckPosition) {
      // OPTIMIZATION: Store position values instead of cloning Vector2
      this.stuckPosition = { x: this.tank.position.x, y: this.tank.position.y };
      this.stuckTimer = currentTime;
      return;
    }

    // OPTIMIZATION: Calculate distance in-place instead of using Vector2.distance
    const dx = this.tank.position.x - this.stuckPosition.x;
    const dy = this.tank.position.y - this.stuckPosition.y;
    const distanceMoved = Math.sqrt(dx * dx + dy * dy);
    
    if (distanceMoved < 20 && currentTime - this.stuckTimer > 3000) {
      // Increased stuck time to 3 seconds to avoid false positives
      this.performEmergencyManeuver();
      this.stuckPosition.x = this.tank.position.x;
      this.stuckPosition.y = this.tank.position.y;
      this.stuckTimer = currentTime;
    } else if (distanceMoved > 50) {
      this.stuckPosition.x = this.tank.position.x;
      this.stuckPosition.y = this.tank.position.y;
      this.stuckTimer = currentTime;
    }
  }

  performEmergencyManeuver() {
    // Move in a random direction (no backward movement)
    const randomAngle = Math.random() * Math.PI * 2;
    const cosAngle = Math.cos(randomAngle);
    const sinAngle = Math.sin(randomAngle);
    
    // OPTIMIZATION: Set target velocity in-place instead of creating new Vector2
    this.tank.targetVelocity.x = cosAngle * this.tank.attributes.speed * 0.8;
    this.tank.targetVelocity.y = sinAngle * this.tank.attributes.speed * 0.8;
    
    // Clear current target to force new decision
    this.target = null;
    this.targetType = null;
  }

  makeDecision() {
    // Cache frequently accessed values
    const ammo = this.tank.attributes.ammunition;
    const health = this.tank.attributes.health;
    const gasoline = this.tank.attributes.gasoline;
    const speed = this.tank.attributes.speed;
    const rotation = this.tank.attributes.rotation;
    const kinetics = this.tank.attributes.kinetics;
    
    // Check for critical red levels (< 25% of max)
    const criticalHealth = health < (TANK_ATTRIBUTES.HEALTH.max * 0.25);
    const criticalAmmo = ammo < (TANK_ATTRIBUTES.AMMUNITION.max * 0.25);
    const criticalGasoline = gasoline < (TANK_ATTRIBUTES.GASOLINE.max * 0.25);
    const criticalSpeed = speed < (TANK_ATTRIBUTES.SPEED.max * 0.25);
    const criticalRotation = rotation < (TANK_ATTRIBUTES.ROTATION.max * 0.25);
    const criticalKinetics = kinetics < (TANK_ATTRIBUTES.KINETICS.max * 0.25);
    
    // Quick early exit for critical needs
    if (ammo === 0) {
      const ammoUpgrade = this.findUpgradeByType(this.gameState.upgrades, 'AMMUNITION');
      if (ammoUpgrade && !ammoUpgrade.collected) {
        this.target = ammoUpgrade;
        this.targetType = 'upgrade';
        this.invalidateCache(); // Invalidate cache when target changes
        return;
      }
    }
    
    // Check for low resources (yellow levels)
    const lowAmmo = ammo < 5;
    const lowGasoline = gasoline < 30;
    const shouldRetreat = health < (TANK_ATTRIBUTES.HEALTH.max * this.retreatThreshold);
    
    // Get enemies and upgrades only if needed
    let enemies = null;
    let upgrades = null;
    
    // Priority 1: Critical red level needs (highest priority)
    if (criticalHealth || criticalAmmo || criticalGasoline || criticalSpeed || criticalRotation || criticalKinetics) {
      upgrades = this.getAvailableUpgrades();
      if (upgrades.length > 0) {
        const newTarget = this.findMostNeededUpgrade(upgrades);
        if (newTarget && (!this.target || this.target.id !== newTarget.id)) {
          // AI switching to critical upgrade
        }
        this.target = newTarget;
        this.targetType = 'upgrade';
        this.invalidateCache(); // Invalidate cache when target changes
        return;
      }
    }
    
    // Priority 2: Critical resource needs (gasoline/ammo)
    if (lowGasoline) {
      upgrades = this.getAvailableUpgrades();
      const gasUpgrade = this.findUpgradeByType(upgrades, 'GASOLINE');
      if (gasUpgrade) {
        this.target = gasUpgrade;
        this.targetType = 'upgrade';
        this.invalidateCache(); // Invalidate cache when target changes
        return;
      }
    }
    
    if (lowAmmo) {
      if (!upgrades) upgrades = this.getAvailableUpgrades();
      const ammoUpgrade = this.findUpgradeByType(upgrades, 'AMMUNITION');
      if (ammoUpgrade) {
        this.target = ammoUpgrade;
        this.targetType = 'upgrade';
        this.invalidateCache(); // Invalidate cache when target changes
        return;
      }
    }
    
    // Priority 3: Combat (only if we have sufficient ammo and no critical needs)
    if (ammo > 3 && !criticalHealth && !criticalAmmo && !criticalGasoline) {
      enemies = this.getEnemies();
      if (enemies.length > 0) {
        this.target = this.selectBestTarget(enemies);
        this.targetType = 'enemy';
        this.invalidateCache(); // Invalidate cache when target changes
        return;
      }
    }
    
    // Priority 4: General upgrades (only if retreating or low resources)
    if (shouldRetreat || lowAmmo || lowGasoline) {
      if (!upgrades) upgrades = this.getAvailableUpgrades();
      if (upgrades.length > 0) {
        this.target = this.findMostNeededUpgrade(upgrades);
        this.targetType = 'upgrade';
        this.invalidateCache(); // Invalidate cache when target changes
        return;
      }
    }
    
    // Default: no target
    this.target = null;
    this.targetType = null;
    this.invalidateCache(); // Invalidate cache when target changes
  }
  
  findUpgradeByType(upgrades, type) {
    let closest = null;
    let closestDistance = Infinity;
    
    for (const upgrade of upgrades) {
      if (upgrade.type === type && !upgrade.collected) {
        const distance = this.tank.position.distance(upgrade.position);
        if (distance < closestDistance) {
          closest = upgrade;
          closestDistance = distance;
        }
      }
    }
    
    return closest;
  }
  
  selectBestTarget(enemies) {
    if (enemies.length === 0) return null;
    
    let bestTarget = null;
    let bestScore = -1;
    
    for (const enemy of enemies) {
      const distance = this.tank.position.distance(enemy.position);
      const healthRatio = enemy.attributes.health / TANK_ATTRIBUTES.HEALTH.max;
      
      // Simple scoring: prefer closer, weaker enemies
      const score = 100 / distance + (1 - healthRatio) * 50;
      
      if (score > bestScore) {
        bestScore = score;
        bestTarget = enemy;
      }
    }
    
    return bestTarget;
  }

  executeAction(currentTime, deltaTime = 16.67) {
    if (!this.target) {
      this.wander();
      return;
    }

    if (this.targetType === 'enemy') {
      this.huntEnemy(currentTime, deltaTime);
    } else if (this.targetType === 'upgrade') {
      this.collectUpgrade();
    }
  }

  huntEnemy(currentTime, deltaTime = 16.67) {
    if (!this.target || !this.gameState.tanks.has(this.target.id)) {
      this.target = null;
      return;
    }

    const enemyTank = this.gameState.tanks.get(this.target.id);
    if (!enemyTank.isAlive) {
      this.target = null;
      return;
    }

    // OPTIMIZATION: Calculate direction in-place instead of creating new Vector2
    const directionX = enemyTank.position.x - this.tank.position.x;
    const directionY = enemyTank.position.y - this.tank.position.y;
    const distance = Math.sqrt(directionX * directionX + directionY * directionY);
    const targetAngle = Math.atan2(directionY, directionX);
    
    // Realistic tank combat behavior with consistent speed (no backward movement)
    if (distance < 150) {
      // Too close - move to the side instead of backward
      const sideAngle = this.tank.angle + (Math.random() < 0.5 ? Math.PI/2 : -Math.PI/2);
      const cosSideAngle = Math.cos(sideAngle);
      const sinSideAngle = Math.sin(sideAngle);
      // OPTIMIZATION: Set target velocity in-place
      this.tank.targetVelocity.x = cosSideAngle * this.tank.attributes.speed * 0.8;
      this.tank.targetVelocity.y = sinSideAngle * this.tank.attributes.speed * 0.8;
    } else if (distance > this.engagementRange) {
      // Too far - approach with full speed
      this.moveTowardsWithAvoidance(enemyTank.position);
    } else {
      // Good distance - realistic tank behavior with better speed consistency
      const behaviorChoice = Math.random();
      if (behaviorChoice < 0.4) {
        // Stand still and shoot (most common for tanks)
        this.tank.targetVelocity.x = 0;
        this.tank.targetVelocity.y = 0;
      } else if (behaviorChoice < 0.7) {
        // Approach slowly but not too slowly
        this.moveTowardsWithAvoidance(enemyTank.position);
        // OPTIMIZATION: Apply velocity reduction in-place
        this.tank.targetVelocity.x *= 0.6;
        this.tank.targetVelocity.y *= 0.6;
      } else {
        // Move to the side instead of retreating backward
        const sideAngle = this.tank.angle + (Math.random() < 0.5 ? Math.PI/2 : -Math.PI/2);
        const cosSideAngle = Math.cos(sideAngle);
        const sinSideAngle = Math.sin(sideAngle);
        // OPTIMIZATION: Set target velocity in-place
        this.tank.targetVelocity.x = cosSideAngle * this.tank.attributes.speed * 0.7;
        this.tank.targetVelocity.y = sinSideAngle * this.tank.attributes.speed * 0.7;
      }
    }

    this.rotateTowards(targetAngle, deltaTime);
    this.attemptShot(enemyTank, distance, targetAngle, currentTime);
  }

  moveTowardsWithAvoidance(targetPosition) {
    // OPTIMIZATION: Calculate direction in-place instead of creating new Vector2
    const directionX = targetPosition.x - this.tank.position.x;
    const directionY = targetPosition.y - this.tank.position.y;
    const directionMagnitude = Math.sqrt(directionX * directionX + directionY * directionY);
    
    // Normalize direction in-place
    const normalizedDirectionX = directionX / directionMagnitude;
    const normalizedDirectionY = directionY / directionMagnitude;
    
    // Simple obstacle avoidance
    const obstacles = this.gameState.trees;
    let avoidanceVectorX = 0;
    let avoidanceVectorY = 0;
    
    for (const tree of obstacles) {
      // OPTIMIZATION: Calculate tree avoidance in-place
      const toTreeX = tree.position.x - this.tank.position.x;
      const toTreeY = tree.position.y - this.tank.position.y;
      const distanceToTree = Math.sqrt(toTreeX * toTreeX + toTreeY * toTreeY);
      
      if (distanceToTree < 80) {
        // Normalize and invert tree direction
        const avoidDirectionX = -toTreeX / distanceToTree;
        const avoidDirectionY = -toTreeY / distanceToTree;
        const avoidanceStrength = 80 / distanceToTree;
        
        avoidanceVectorX += avoidDirectionX * avoidanceStrength;
        avoidanceVectorY += avoidDirectionY * avoidanceStrength;
      }
    }
    
    // Reduce avoidance strength when very close to target (within 50 units)
    const distanceToTarget = Math.sqrt(directionX * directionX + directionY * directionY);
    let avoidanceStrength = 0.5;
    if (distanceToTarget < 50) {
      avoidanceStrength = 0.0; // No avoidance when close to target
    }
    
    // OPTIMIZATION: Calculate final direction in-place
    const finalDirectionX = normalizedDirectionX + avoidanceVectorX * avoidanceStrength;
    const finalDirectionY = normalizedDirectionY + avoidanceVectorY * avoidanceStrength;
    
    // Normalize final direction
    const finalMagnitude = Math.sqrt(finalDirectionX * finalDirectionX + finalDirectionY * finalDirectionY);
    if (finalMagnitude > 0) {
      this.tank.targetVelocity.x = (finalDirectionX / finalMagnitude) * this.tank.attributes.speed;
      this.tank.targetVelocity.y = (finalDirectionY / finalMagnitude) * this.tank.attributes.speed;
    } else {
      this.tank.targetVelocity.x = normalizedDirectionX * this.tank.attributes.speed;
      this.tank.targetVelocity.y = normalizedDirectionY * this.tank.attributes.speed;
    }
  }

  attemptShot(enemyTank, distance, targetAngle, currentTime) {
    if (currentTime - this.lastShotTime < this.minShotInterval) return;
    if (!this.tank.canShoot() || this.tank.attributes.ammunition === 0) return;

    // Safety check: don't shoot if enemy is too close (might hit self)
    if (distance < 25) return;

    // Improved predictive aiming with better accuracy
    const enemyVelocity = enemyTank.velocity || { x: 0, y: 0 };
    const shellSpeed = this.tank.attributes.kinetics;
    const timeToHit = distance / shellSpeed;
    
    // Add a small random factor to make AI less predictable but still accurate
    const predictionFactor = 0.8 + (Math.random() * 0.4); // 0.8 to 1.2
    const adjustedTimeToHit = timeToHit * predictionFactor;
    
    // OPTIMIZATION: Calculate predicted position in-place instead of creating new Vector2
    const predictedX = enemyTank.position.x + enemyVelocity.x * adjustedTimeToHit;
    const predictedY = enemyTank.position.y + enemyVelocity.y * adjustedTimeToHit;
    
    // OPTIMIZATION: Calculate predicted direction in-place
    const predictedDirectionX = predictedX - this.tank.position.x;
    const predictedDirectionY = predictedY - this.tank.position.y;
    const predictedAngle = Math.atan2(predictedDirectionY, predictedDirectionX);
    
    // Check if aimed at target
    let angleDiff = predictedAngle - this.tank.angle;
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    angleDiff = Math.abs(angleDiff);
    
    const angleOk = angleDiff < 0.8;
    const distanceOk = distance >= 30 && distance <= 400;
    
    // More aggressive shooting - allow shooting at moving targets with better prediction
    const perpendicularSpeed = Math.abs(enemyVelocity.x * Math.sin(this.tank.angle) - enemyVelocity.y * Math.cos(this.tank.angle));
    const speedOk = perpendicularSpeed < 8; // Increased from 3 to 8 for more aggressive shooting
    
    // Additional check: if enemy is moving slowly, be more lenient with angle
    const enemySpeed = Math.sqrt(enemyVelocity.x * enemyVelocity.x + enemyVelocity.y * enemyVelocity.y);
    const adjustedAngleThreshold = enemySpeed < 2 ? 1.2 : 0.8; // More lenient angle for slow targets
    const finalAngleOk = angleDiff < adjustedAngleThreshold;
    
    if (finalAngleOk && distanceOk && speedOk && Math.random() < this.accuracy) {
      this.tank.shoot();
      this.lastShotTime = currentTime;
    }
  }

  collectUpgrade() {
    if (!this.target) return;

    // OPTIMIZATION: Calculate direction in-place instead of creating new Vector2
    const directionX = this.target.position.x - this.tank.position.x;
    const directionY = this.target.position.y - this.tank.position.y;
    const distance = Math.sqrt(directionX * directionX + directionY * directionY);

    // Use proper collection distance (tank size + upgrade size + buffer)
    const collectionDistance = 25; // Reduced to match actual collision detection range
    
    if (distance < collectionDistance) {
      this.target = null;
      return;
    }

    // Simplified: Move directly to the upgrade without overshoot behavior
    this.moveTowardsWithAvoidance(this.target.position);
  }

  wander() {
    if (!this.wanderTarget || this.tank.position.distance(this.wanderTarget) < 50) {
      let attempts = 0;
      do {
        // OPTIMIZATION: Create wander target in-place instead of new Vector2
        if (!this.wanderTarget) {
          this.wanderTarget = { x: 0, y: 0 };
        }
        this.wanderTarget.x = Math.random() * 1000 + 100;
        this.wanderTarget.y = Math.random() * 600 + 100;
        attempts++;
      } while (this.isNearObstacle(this.wanderTarget) && attempts < 10);
    }

    this.moveTowardsWithAvoidance(this.wanderTarget);
    // OPTIMIZATION: Apply velocity reduction in-place
    this.tank.targetVelocity.x *= 0.4;
    this.tank.targetVelocity.y *= 0.4;
  }

  isNearObstacle(position) {
    for (const tree of this.gameState.trees) {
      // OPTIMIZATION: Calculate distance in-place instead of using Vector2.distance
      const dx = position.x - tree.position.x;
      const dy = position.y - tree.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < 60) {
        return true;
      }
    }
    return false;
  }

  rotateTowards(targetAngle, deltaTime = 16.67) {
    let angleDiff = targetAngle - this.tank.angle;
    
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    // Fixed: Use proper rotation speed limits based on tank attributes with deltaTime
    // Use the same rotation logic as the tank's rotateTowards method
    const rotationSpeed = this.tank.attributes.rotation * 0.1; // Same as tank method
    const maxRotationThisFrame = rotationSpeed * (deltaTime / 1000);
    
    if (Math.abs(angleDiff) > 0.01) {
      const rotateAmount = Math.min(Math.abs(angleDiff), maxRotationThisFrame) * Math.sign(angleDiff);
      this.tank.angle += rotateAmount;
      
      while (this.tank.angle > 2 * Math.PI) this.tank.angle -= 2 * Math.PI;
      while (this.tank.angle < 0) this.tank.angle += 2 * Math.PI;
    }
  }

  getEnemies() {
    const currentTime = Date.now();
    if (this.cachedEnemies && (currentTime - this.lastCacheTime) < this.cacheValidityTime) {
      return this.cachedEnemies;
    }
    
    const enemies = [];
    for (const [id, tank] of this.gameState.tanks) {
      if (id !== this.tank.id && tank.isAlive) {
        enemies.push(tank);
      }
    }
    
    this.cachedEnemies = enemies;
    this.lastCacheTime = currentTime;
    return enemies;
  }

  getAvailableUpgrades() {
    const currentTime = Date.now();
    if (this.cachedUpgrades && (currentTime - this.lastCacheTime) < this.cacheValidityTime) {
      return this.cachedUpgrades;
    }
    
    const upgrades = this.gameState.upgrades.filter(upgrade => !upgrade.collected);
    this.cachedUpgrades = upgrades;
    this.lastCacheTime = currentTime;
    return upgrades;
  }

  invalidateCache() {
    this.cachedEnemies = null;
    this.cachedUpgrades = null;
    this.lastCacheTime = 0;
  }

  findMostNeededUpgrade(upgrades) {
    // Calculate needs with critical urgency for red levels (< 25%)
    const needs = {
      health: this.tank.attributes.health < (TANK_ATTRIBUTES.HEALTH.max * 0.6) ? TANK_ATTRIBUTES.HEALTH.max - this.tank.attributes.health : 0,
      ammunition: this.tank.attributes.ammunition < (TANK_ATTRIBUTES.AMMUNITION.max * 0.5) ? TANK_ATTRIBUTES.AMMUNITION.max - this.tank.attributes.ammunition : 0,
      gasoline: this.tank.attributes.gasoline < (TANK_ATTRIBUTES.GASOLINE.max * 0.4) ? TANK_ATTRIBUTES.GASOLINE.max - this.tank.attributes.gasoline : 0,
      speed: this.tank.attributes.speed < (TANK_ATTRIBUTES.SPEED.max * 0.7) ? TANK_ATTRIBUTES.SPEED.max - this.tank.attributes.speed : 0,
      rotation: this.tank.attributes.rotation < (TANK_ATTRIBUTES.ROTATION.max * 0.7) ? TANK_ATTRIBUTES.ROTATION.max - this.tank.attributes.rotation : 0,
      kinetics: this.tank.attributes.kinetics < (TANK_ATTRIBUTES.KINETICS.max * 0.7) ? TANK_ATTRIBUTES.KINETICS.max - this.tank.attributes.kinetics : 0
    };

    // Calculate critical urgency multipliers for red levels (< 25%)
    const criticalMultipliers = {
      health: this.tank.attributes.health < (TANK_ATTRIBUTES.HEALTH.max * 0.25) ? 3.0 : 1.0,
      ammunition: this.tank.attributes.ammunition < (TANK_ATTRIBUTES.AMMUNITION.max * 0.25) ? 3.0 : 1.0,
      gasoline: this.tank.attributes.gasoline < (TANK_ATTRIBUTES.GASOLINE.max * 0.25) ? 3.0 : 1.0,
      speed: this.tank.attributes.speed < (TANK_ATTRIBUTES.SPEED.max * 0.25) ? 3.0 : 1.0,
      rotation: this.tank.attributes.rotation < (TANK_ATTRIBUTES.ROTATION.max * 0.25) ? 3.0 : 1.0,
      kinetics: this.tank.attributes.kinetics < (TANK_ATTRIBUTES.KINETICS.max * 0.25) ? 3.0 : 1.0
    };

    let bestUpgrade = null;
    let bestScore = -1;

    for (const upgrade of upgrades) {
      let score = 0;
      const distance = this.tank.position.distance(upgrade.position);
      
      switch (upgrade.type) {
        case 'HEALTH': 
          score = needs.health * criticalMultipliers.health; 
          break;
        case 'AMMUNITION': 
          score = needs.ammunition * criticalMultipliers.ammunition; 
          break;
        case 'GASOLINE': 
          score = needs.gasoline * criticalMultipliers.gasoline; 
          break;
        case 'SPEED': 
          score = needs.speed * criticalMultipliers.speed; 
          break;
        case 'ROTATION': 
          score = needs.rotation * criticalMultipliers.rotation; 
          break;
        case 'KINETICS': 
          score = needs.kinetics * criticalMultipliers.kinetics; 
          break;
      }

      if (score <= 0) continue;

      // Enhanced scoring: prioritize by need and distance
      score = score / (distance * 0.01 + 1);

      if (score > bestScore) {
        bestScore = score;
        bestUpgrade = upgrade;
      }
    }

    return bestUpgrade;
  }
} 