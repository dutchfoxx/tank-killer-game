import { Vector2 } from './types.js';
import { AI_PARAMS } from './constants.js';

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
    
    this.setAILevelBehavior();
  }

  setAILevelBehavior() {
    switch (this.aiLevel) {
      case 'easy':
        this.decisionInterval = 500;
        this.minShotInterval = 800;
        this.accuracy = 0.6;
        this.aggressionLevel = 0.3;
        this.retreatThreshold = 0.7;
        this.engagementRange = 200;
        break;
      case 'intermediate':
        this.decisionInterval = 400;
        this.minShotInterval = 400;
        this.accuracy = 0.8;
        this.aggressionLevel = 0.6;
        this.retreatThreshold = 0.5;
        this.engagementRange = 300;
        break;
      case 'hard':
        this.decisionInterval = 100;
        this.minShotInterval = 300;
        this.accuracy = 0.9;
        this.aggressionLevel = 0.8;
        this.retreatThreshold = 0.3;
        this.engagementRange = 400;
        break;
      case 'insane':
        this.decisionInterval = 50;
        this.minShotInterval = 200;
        this.accuracy = 0.95;
        this.aggressionLevel = 1.0;
        this.retreatThreshold = 0.1;
        this.engagementRange = 500;
        break;
      default:
        this.decisionInterval = 200;
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
    
    // Debug: Log AI update calls
    if (this.tank.id.includes('ai_')) {
      console.log(`AI ${this.tank.id}: update() called at time ${currentTime}`);
    }
    
    // Check if stuck
    this.checkIfStuck(currentTime);
    
    // Make decisions at intervals
    if (currentTime - this.lastDecisionTime > this.decisionInterval) {
      if (this.tank.id.includes('ai_')) {
        console.log(`AI ${this.tank.id}: Making decision at time ${currentTime}`);
      }
      this.makeDecision();
      this.lastDecisionTime = currentTime;
    }

    // Execute current action
    this.executeAction(currentTime);
  }

  checkIfStuck(currentTime) {
    if (!this.stuckPosition) {
      this.stuckPosition = this.tank.position.clone();
      this.stuckTimer = currentTime;
      return;
    }

    const distanceMoved = this.tank.position.distance(this.stuckPosition);
    
    if (distanceMoved < 20 && currentTime - this.stuckTimer > 2000) {
      this.performEmergencyManeuver();
      this.stuckPosition = this.tank.position.clone();
      this.stuckTimer = currentTime;
    } else if (distanceMoved > 50) {
      this.stuckPosition = this.tank.position.clone();
      this.stuckTimer = currentTime;
    }
  }

  performEmergencyManeuver() {
    const randomAngle = Math.random() * Math.PI * 2;
    const emergencyDirection = new Vector2(Math.cos(randomAngle), Math.sin(randomAngle));
    this.tank.targetVelocity = emergencyDirection.multiply(this.tank.attributes.speed);
  }

  makeDecision() {
    const enemies = this.getEnemies();
    const upgrades = this.getAvailableUpgrades();
    
    const healthRatio = this.tank.attributes.health / 100;
    const shouldRetreat = healthRatio < this.retreatThreshold;
    const noAmmo = this.tank.attributes.ammunition === 0;
    const lowResources = this.tank.attributes.gasoline < 10;
    
    // Priority: ammo > health > enemies > upgrades
    if (noAmmo && upgrades.some(u => u.type === 'AMMUNITION')) {
      this.target = this.findUpgradeByType(upgrades, 'AMMUNITION');
      this.targetType = 'upgrade';
    } else if (shouldRetreat && upgrades.some(u => u.type === 'HEALTH')) {
      this.target = this.findUpgradeByType(upgrades, 'HEALTH');
      this.targetType = 'upgrade';
    } else if (enemies.length > 0 && this.tank.attributes.ammunition > 0) {
      this.target = this.selectBestTarget(enemies);
      this.targetType = 'enemy';
    } else if (upgrades.length > 0 && (shouldRetreat || lowResources || this.tank.attributes.ammunition < 4)) {
      this.target = this.findMostNeededUpgrade(upgrades);
      this.targetType = 'upgrade';
    } else {
      this.target = null;
      this.targetType = null;
    }
  }
  
  findUpgradeByType(upgrades, type) {
    const matching = upgrades.filter(u => u.type === type);
    if (matching.length === 0) return null;
    
    return matching.reduce((closest, upgrade) => {
      const dist1 = closest ? this.tank.position.distance(closest.position) : Infinity;
      const dist2 = this.tank.position.distance(upgrade.position);
      return dist2 < dist1 ? upgrade : closest;
    }, null);
  }
  
  selectBestTarget(enemies) {
    if (enemies.length === 0) return null;
    
    let bestTarget = null;
    let bestScore = -1;
    
    for (const enemy of enemies) {
      const distance = this.tank.position.distance(enemy.position);
      const healthRatio = enemy.attributes.health / 100;
      
      // Simple scoring: prefer closer, weaker enemies
      const score = 100 / distance + (1 - healthRatio) * 50;
      
      if (score > bestScore) {
        bestScore = score;
        bestTarget = enemy;
      }
    }
    
    return bestTarget;
  }

  executeAction(currentTime) {
    if (!this.target) {
      this.wander();
      return;
    }

    if (this.targetType === 'enemy') {
      this.huntEnemy(currentTime);
    } else if (this.targetType === 'upgrade') {
      this.collectUpgrade();
    }
  }

  huntEnemy(currentTime) {
    if (!this.target || !this.gameState.tanks.has(this.target.id)) {
      this.target = null;
      return;
    }

    const enemyTank = this.gameState.tanks.get(this.target.id);
    if (!enemyTank.isAlive) {
      this.target = null;
      return;
    }

    const direction = enemyTank.position.subtract(this.tank.position);
    const distance = direction.magnitude();
    const targetAngle = Math.atan2(direction.y, direction.x);
    
    // Debug logging for distance analysis
    if (this.tank.id.includes('ai_')) {
      console.log(`AI ${this.tank.id}: Distance to enemy = ${Math.round(distance)}px, Engagement range = ${this.engagementRange}px`);
    }
    
    // Realistic tank combat behavior
    if (distance < 150) {
      // Too close - back away
      if (this.tank.id.includes('ai_')) {
        console.log(`AI ${this.tank.id}: Backing away - too close (${Math.round(distance)}px)`);
      }
      const backDirection = direction.normalize().multiply(-1);
      this.tank.targetVelocity = backDirection.multiply(this.tank.attributes.speed * 0.6);
    } else if (distance > this.engagementRange) {
      // Too far - approach
      if (this.tank.id.includes('ai_')) {
        console.log(`AI ${this.tank.id}: Approaching enemy (${Math.round(distance)}px)`);
      }
      this.moveTowardsWithAvoidance(enemyTank.position);
    } else {
      // Good distance - realistic tank behavior
      const behaviorChoice = Math.random();
      if (behaviorChoice < 0.4) {
        // Stand still and shoot (most common for tanks)
        if (this.tank.id.includes('ai_')) {
          console.log(`AI ${this.tank.id}: Standing still at distance (${Math.round(distance)}px)`);
        }
        this.tank.targetVelocity = new Vector2(0, 0);
      } else if (behaviorChoice < 0.7) {
        // Approach slowly
        if (this.tank.id.includes('ai_')) {
          console.log(`AI ${this.tank.id}: Approaching slowly (${Math.round(distance)}px)`);
        }
        this.moveTowardsWithAvoidance(enemyTank.position);
        this.tank.targetVelocity = this.tank.targetVelocity.multiply(0.3);
      } else {
        // Retreat slowly
        if (this.tank.id.includes('ai_')) {
          console.log(`AI ${this.tank.id}: Retreating slowly (${Math.round(distance)}px)`);
        }
        const retreatDirection = direction.normalize().multiply(-1);
        this.tank.targetVelocity = retreatDirection.multiply(this.tank.attributes.speed * 0.4);
      }
    }

    this.rotateTowards(targetAngle);
    this.attemptShot(enemyTank, distance, targetAngle, currentTime);
  }

  moveTowardsWithAvoidance(targetPosition) {
    const direction = targetPosition.subtract(this.tank.position);
    const normalizedDirection = direction.normalize();
    
    // Simple obstacle avoidance
    const obstacles = this.gameState.trees;
    let avoidanceVector = new Vector2(0, 0);
    
    for (const tree of obstacles) {
      const toTree = tree.position.subtract(this.tank.position);
      const distanceToTree = toTree.magnitude();
      
      if (distanceToTree < 80) {
        const avoidDirection = toTree.normalize().multiply(-1);
        avoidanceVector = avoidanceVector.add(avoidDirection.multiply(80 / distanceToTree));
      }
    }
    
    const finalDirection = normalizedDirection.add(avoidanceVector.multiply(0.5)).normalize();
    this.tank.targetVelocity = finalDirection.multiply(this.tank.attributes.speed);
  }



  attemptShot(enemyTank, distance, targetAngle, currentTime) {
    if (currentTime - this.lastShotTime < this.minShotInterval) return;
    if (!this.tank.canShoot() || this.tank.attributes.ammunition === 0) return;

    // Simple predictive aiming
    const enemyVelocity = enemyTank.velocity || new Vector2(0, 0);
    const shellSpeed = this.tank.attributes.kinetics;
    const timeToHit = distance / shellSpeed;
    const predictedPosition = enemyTank.position.add(enemyVelocity.multiply(timeToHit));
    
    const predictedDirection = predictedPosition.subtract(this.tank.position);
    const predictedAngle = Math.atan2(predictedDirection.y, predictedDirection.x);
    
    // Check if aimed at target
    let angleDiff = predictedAngle - this.tank.angle;
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    angleDiff = Math.abs(angleDiff);
    
    const angleOk = angleDiff < 0.8;
    const distanceOk = distance >= 30 && distance <= 400;
    
    // Check if enemy is moving too fast perpendicular to our shot
    const perpendicularSpeed = Math.abs(enemyVelocity.x * Math.sin(this.tank.angle) - enemyVelocity.y * Math.cos(this.tank.angle));
    const speedOk = perpendicularSpeed < 3;
    
    if (angleOk && distanceOk && speedOk && Math.random() < this.accuracy) {
      this.tank.shoot();
      this.lastShotTime = currentTime;
    }
  }

  collectUpgrade() {
    if (!this.target) return;

    const direction = this.target.position.subtract(this.tank.position);
    const distance = direction.magnitude();

    if (distance < 30) {
      this.target = null;
      return;
    }

    const normalizedDirection = direction.normalize();
    this.tank.targetVelocity = normalizedDirection.multiply(this.tank.attributes.speed);
  }

  wander() {
    if (!this.wanderTarget || this.tank.position.distance(this.wanderTarget) < 50) {
      let attempts = 0;
      do {
        this.wanderTarget = new Vector2(
          Math.random() * 1000 + 100,
          Math.random() * 600 + 100
        );
        attempts++;
      } while (this.isNearObstacle(this.wanderTarget) && attempts < 10);
    }

    this.moveTowardsWithAvoidance(this.wanderTarget);
    this.tank.targetVelocity = this.tank.targetVelocity.multiply(0.4);
  }

  isNearObstacle(position) {
    for (const tree of this.gameState.trees) {
      if (position.distance(tree.position) < 60) {
        return true;
      }
    }
    return false;
  }

  rotateTowards(targetAngle) {
    let angleDiff = targetAngle - this.tank.angle;
    
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    const rotationSpeed = this.tank.attributes.rotation * 0.02;
    
    if (Math.abs(angleDiff) > 0.05) {
      const rotateAmount = Math.min(Math.abs(angleDiff), rotationSpeed) * Math.sign(angleDiff);
      this.tank.angle += rotateAmount;
      
      while (this.tank.angle > 2 * Math.PI) this.tank.angle -= 2 * Math.PI;
      while (this.tank.angle < 0) this.tank.angle += 2 * Math.PI;
    }
  }

  getEnemies() {
    const enemies = [];
    for (const [id, tank] of this.gameState.tanks) {
      if (id !== this.tank.id && tank.isAlive) {
        enemies.push(tank);
      }
    }
    return enemies;
  }

  getAvailableUpgrades() {
    return this.gameState.upgrades.filter(upgrade => !upgrade.collected);
  }

  findMostNeededUpgrade(upgrades) {
    const maxHealth = 100;
    const maxSpeed = 50;
    const maxGasoline = 100;
    const maxRotation = 50;
    const maxAmmunition = 14;
    const maxKinetics = 300;
    
    const needs = {
      health: this.tank.attributes.health < (maxHealth * 0.8) ? maxHealth - this.tank.attributes.health : 0,
      ammunition: this.tank.attributes.ammunition < (maxAmmunition * 0.8) ? maxAmmunition - this.tank.attributes.ammunition : 0,
      gasoline: this.tank.attributes.gasoline < (maxGasoline * 0.8) ? maxGasoline - this.tank.attributes.gasoline : 0,
      speed: this.tank.attributes.speed < (maxSpeed * 0.8) ? maxSpeed - this.tank.attributes.speed : 0,
      rotation: this.tank.attributes.rotation < (maxRotation * 0.8) ? maxRotation - this.tank.attributes.rotation : 0,
      kinetics: this.tank.attributes.kinetics < (maxKinetics * 0.8) ? maxKinetics - this.tank.attributes.kinetics : 0
    };

    let bestUpgrade = null;
    let bestScore = -1;

    for (const upgrade of upgrades) {
      let score = 0;
      const distance = this.tank.position.distance(upgrade.position);
      
      switch (upgrade.type) {
        case 'HEALTH': score = needs.health; break;
        case 'AMMUNITION': score = needs.ammunition; break;
        case 'GASOLINE': score = needs.gasoline; break;
        case 'SPEED': score = needs.speed; break;
        case 'ROTATION': score = needs.rotation; break;
        case 'KINETICS': score = needs.kinetics; break;
      }

      if (score <= 0) continue;

      score = score / (distance * 0.01 + 1);

      if (score > bestScore) {
        bestScore = score;
        bestUpgrade = upgrade;
      }
    }

    return bestUpgrade;
  }
} 