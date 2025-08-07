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
    this.combatMode = false;
    this.flankDirection = 1; // 1 or -1 for flanking
    this.lastFlankChange = 0;
    this.obstacleAvoidanceTime = 0;
    this.stuckPosition = null;
    this.stuckTimer = 0;
    this.wanderTarget = null; // Initialize wander target
    this.lastDistanceCheck = 0; // For continuous distance monitoring
    this.pendingTarget = null; // For reaction time delays
    this.targetAcquisitionTime = 0; // When target was first detected
    this.lastTargetPosition = null; // For tracking target movement
    this.aimingAdjustmentTime = 0; // Last time we adjusted aim
    
    // Set AI level-specific behavior parameters
    this.setAILevelBehavior();
  }

  setAILevelBehavior() {
    // Set base stats based on AI level
    switch (this.aiLevel) {
      case 'easy':
        this.decisionInterval = 500; // Slower decisions
        this.minShotInterval = 800; // Less aggressive shooting
        this.reactionTime = 1000; // Slower reactions
        this.accuracy = 0.6; // Lower accuracy
        this.aggressionLevel = 0.3; // Low aggression
        this.retreatThreshold = 0.7; // High health retreat threshold
        this.engagementRange = 200; // Prefer long range
        break;
      case 'intermediate':
        this.decisionInterval = 200; // Standard decisions
        this.minShotInterval = 400; // Standard shooting
        this.reactionTime = 500; // Standard reactions
        this.accuracy = 0.8; // Good accuracy
        this.aggressionLevel = 0.6; // Medium aggression
        this.retreatThreshold = 0.5; // Medium health retreat threshold
        this.engagementRange = 300; // Medium range
        break;
      case 'hard':
        this.decisionInterval = 100; // Fast decisions
        this.minShotInterval = 300; // Aggressive shooting
        this.reactionTime = 200; // Fast reactions
        this.accuracy = 0.9; // High accuracy
        this.aggressionLevel = 0.8; // High aggression
        this.retreatThreshold = 0.3; // Low health retreat threshold
        this.engagementRange = 400; // Close range
        break;
      case 'insane':
        this.decisionInterval = 50; // Very fast decisions
        this.minShotInterval = 200; // Very aggressive shooting
        this.reactionTime = 100; // Very fast reactions
        this.accuracy = 0.95; // Very high accuracy
        this.aggressionLevel = 1.0; // Maximum aggression
        this.retreatThreshold = 0.1; // Almost never retreat
        this.engagementRange = 500; // Very close range
        break;
      default:
        // Default to intermediate
        this.decisionInterval = 200;
        this.minShotInterval = 400;
        this.reactionTime = 500;
        this.accuracy = 0.8;
        this.aggressionLevel = 0.6;
        this.retreatThreshold = 0.5;
        this.engagementRange = 300;
    }
    
    // Assign individual personality/strategy
    this.assignIndividualStrategy();
  }
  
  assignIndividualStrategy() {
    const strategies = ['defensive', 'balanced', 'aggressive', 'berserker'];
    const strategyWeights = this.getStrategyWeights();
    
    // Weighted random selection based on AI level
    const random = Math.random();
    let cumulativeWeight = 0;
    
    for (let i = 0; i < strategies.length; i++) {
      cumulativeWeight += strategyWeights[i];
      if (random <= cumulativeWeight) {
        this.strategy = strategies[i];
        break;
      }
    }
    
    // Apply strategy-specific modifiers
    this.applyStrategyModifiers();
  }
  
  getStrategyWeights() {
    // Different probability distributions for each AI level
    switch (this.aiLevel) {
      case 'easy':
        return [0.5, 0.3, 0.15, 0.05]; // Mostly defensive, some balanced, rare aggressive/berserker
      case 'intermediate':
        return [0.25, 0.4, 0.25, 0.1]; // Balanced distribution with slight preference for balanced
      case 'hard':
        return [0.1, 0.25, 0.4, 0.25]; // Mostly aggressive/berserker, some balanced, rare defensive
      case 'insane':
        return [0.05, 0.15, 0.3, 0.5]; // Mostly berserker, some aggressive, rare defensive/balanced
      default:
        return [0.25, 0.4, 0.25, 0.1]; // Default to intermediate distribution
    }
  }
  
  applyStrategyModifiers() {
    // Apply strategy-specific adjustments to base stats
    switch (this.strategy) {
      case 'defensive':
        this.retreatThreshold *= 1.1; // Retreat slightly earlier
        this.engagementRange *= 1.2; // Prefer longer range
        this.aggressionLevel *= 0.85; // Slightly less aggressive
        this.minShotInterval *= 1.1; // Shoot slightly less frequently
        break;
      case 'balanced':
        // Keep base stats as is
        break;
      case 'aggressive':
        this.retreatThreshold *= 0.8; // Retreat later
        this.engagementRange *= 0.8; // Prefer closer range
        this.aggressionLevel *= 1.2; // More aggressive
        this.minShotInterval *= 0.8; // Shoot more frequently
        break;
      case 'berserker':
        this.retreatThreshold *= 0.5; // Almost never retreat
        this.engagementRange *= 0.6; // Very close range
        this.aggressionLevel *= 1.4; // Very aggressive
        this.minShotInterval *= 0.6; // Shoot very frequently
        break;
    }
  }

  update(deltaTime) {
    if (!this.tank.isAlive) return;

    const currentTime = Date.now();
    
    // Check if stuck and need emergency maneuver
    this.checkIfStuck(currentTime);
    
    // Continuous distance monitoring (every 100ms regardless of difficulty)
    if (currentTime - this.lastDistanceCheck > 100) {
      this.maintainCombatDistance(currentTime);
      this.lastDistanceCheck = currentTime;
    }
    
    // Handle reaction time for target acquisition
    this.processTargetAcquisition(currentTime);
    
    // Make decisions at intervals
    if (currentTime - this.lastDecisionTime > this.decisionInterval) {
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
    
    // If barely moved in 2 seconds, we're stuck (corrected pixel distances)
    if (distanceMoved < 20 && currentTime - this.stuckTimer > 2000) {
      this.performEmergencyManeuver();
      this.stuckPosition = this.tank.position.clone();
      this.stuckTimer = currentTime;
    } else if (distanceMoved > 50) {
      // Reset stuck detection if we moved significantly
      this.stuckPosition = this.tank.position.clone();
      this.stuckTimer = currentTime;
    }
  }

  performEmergencyManeuver() {
    // Random emergency direction
    const randomAngle = Math.random() * Math.PI * 2;
    const emergencyDirection = new Vector2(Math.cos(randomAngle), Math.sin(randomAngle));
    this.tank.targetVelocity = emergencyDirection.multiply(this.tank.attributes.speed);
    this.obstacleAvoidanceTime = Date.now() + 1000; // Avoid for 1 second
  }

  maintainCombatDistance(currentTime) {
    // Only maintain distance if we're in combat mode and have an active target
    if (!this.combatMode || !this.target || this.targetType !== 'enemy') {
      return;
    }

    // Check if target still exists
    if (!this.gameState.tanks.has(this.target.id)) {
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
    
    // Get strategy-specific safe distances
    let minDistance, optimalDistance;
    switch (this.strategy) {
      case 'defensive':
        minDistance = 120;
        optimalDistance = 200;
        break;
      case 'balanced':
        minDistance = 80;
        optimalDistance = 150;
        break;
      case 'aggressive':
        minDistance = 60;
        optimalDistance = 120;
        break;
      case 'berserker':
        minDistance = 40;
        optimalDistance = 80;
        break;
      default:
        minDistance = 80;
        optimalDistance = 150;
    }

    // Immediate distance correction if too close or too far
    if (distance < minDistance) {
      // Emergency back away - we're too close!
      const backDirection = direction.normalize().multiply(-1);
      const retreatUrgency = (minDistance - distance) / minDistance; // 0-1 scale
      this.tank.targetVelocity = backDirection.multiply(this.tank.attributes.speed * (0.5 + retreatUrgency * 0.5));
    } else if (distance > optimalDistance * 1.5) {
      // We're getting too far - close in a bit
      const approachDirection = direction.normalize();
      const approachSpeed = Math.min(0.6, (distance - optimalDistance) / optimalDistance);
      this.tank.targetVelocity = approachDirection.multiply(this.tank.attributes.speed * approachSpeed);
    }
  }

  processTargetAcquisition(currentTime) {
    // If we have a pending target, check if reaction time has passed
    if (this.pendingTarget && currentTime - this.targetAcquisitionTime >= this.reactionTime) {
      // Reaction time has passed, commit to the new target
      this.target = this.pendingTarget.target;
      this.targetType = this.pendingTarget.targetType;
      this.pendingTarget = null;
    }
  }

  initiateTargetChange(previousTarget, previousTargetType) {
    // If this is a new target (not just losing a target), apply reaction time
    if (this.target && (!previousTarget || this.target.id !== previousTarget.id)) {
      // Store the new target as pending and revert to previous target temporarily
      this.pendingTarget = {
        target: this.target,
        targetType: this.targetType
      };
      this.targetAcquisitionTime = Date.now();
      
      // Revert to previous target during reaction delay
      this.target = previousTarget;
      this.targetType = previousTargetType;
    }
    
    // Occasionally "lose" targets to simulate human-like attention lapses
    // Higher chance for easier AI levels
    if (this.target && Math.random() < this.getTargetLossChance()) {
              // Removed excessive AI attention logging
      this.target = null;
      this.targetType = null;
      this.pendingTarget = null;
    }
  }

  getTargetLossChance() {
    // Chance to temporarily lose target based on AI level
    switch (this.aiLevel) {
      case 'easy': return 0.03; // 3% chance per target change
      case 'intermediate': return 0.015; // 1.5% chance
      case 'hard': return 0.008; // 0.8% chance
      case 'insane': return 0.002; // 0.2% chance
      default: return 0.015;
    }
  }

  makeDecision() {
    const enemies = this.getEnemies();
    const upgrades = this.getAvailableUpgrades();
    
    // Strategy-based decision making
    const healthRatio = this.tank.attributes.health / 100;
    const shouldRetreat = healthRatio < this.retreatThreshold;
    const noAmmo = this.tank.attributes.ammunition === 0;
    const lowResources = this.tank.attributes.gasoline < 10;
    
    // Combat assessment based on strategy
    const nearbyEnemies = enemies.filter(enemy => 
      this.tank.position.distance(enemy.position) < this.engagementRange
    );
    
    // Store previous target for reaction time processing
    const previousTarget = this.target;
    const previousTargetType = this.targetType;
    
    // Strategy-specific decision logic
    switch (this.strategy) {
      case 'defensive':
        this.makeDefensiveDecision(enemies, upgrades, shouldRetreat, noAmmo, lowResources);
        break;
      case 'balanced':
        this.makeBalancedDecision(enemies, upgrades, shouldRetreat, noAmmo, lowResources);
        break;
      case 'aggressive':
        this.makeAggressiveDecision(enemies, upgrades, shouldRetreat, noAmmo, lowResources);
        break;
      case 'berserker':
        this.makeBerserkerDecision(enemies, upgrades, shouldRetreat, noAmmo, lowResources);
        break;
      default:
        this.makeBalancedDecision(enemies, upgrades, shouldRetreat, noAmmo, lowResources);
    }
    
    // Handle reaction time if target changed
    if (this.target !== previousTarget || this.targetType !== previousTargetType) {
      this.initiateTargetChange(previousTarget, previousTargetType);
    }
  }

  makeDefensiveDecision(enemies, upgrades, shouldRetreat, noAmmo, lowResources) {
    // Defensive AI: Prioritize survival but still engage in combat
    if (noAmmo && upgrades.some(u => u.type === 'AMMUNITION')) {
      this.target = this.findUpgradeByType(upgrades, 'AMMUNITION');
      this.targetType = 'upgrade';
      this.combatMode = false;
    } else if (shouldRetreat && upgrades.some(u => u.type === 'HEALTH')) {
      this.target = this.findUpgradeByType(upgrades, 'HEALTH');
      this.targetType = 'upgrade';
      this.combatMode = false;
    } else if (enemies.length > 0 && this.tank.attributes.ammunition > 0) {
      // Engage enemies but prefer longer range when possible
      const longRangeEnemies = enemies.filter(enemy => 
        this.tank.position.distance(enemy.position) > 100
      );
      const closeEnemies = enemies.filter(enemy => 
        this.tank.position.distance(enemy.position) <= 100
      );
      
      if (longRangeEnemies.length > 0 && !shouldRetreat) {
        // Prefer long-range combat when healthy
        this.target = this.selectBestTarget(longRangeEnemies);
        this.targetType = 'enemy';
        this.combatMode = true;
      } else if (closeEnemies.length > 0 && this.tank.attributes.ammunition > 2) {
        // Engage close enemies if we have some ammo
        this.target = this.selectBestTarget(closeEnemies);
        this.targetType = 'enemy';
        this.combatMode = true;
      } else if (enemies.length > 0 && this.tank.attributes.ammunition > 0) {
        // Fallback: engage any enemy if we have ammo
        this.target = this.selectBestTarget(enemies);
        this.targetType = 'enemy';
        this.combatMode = true;
      } else {
        // No ammo or too low health, avoid combat
        this.target = null;
        this.targetType = null;
        this.combatMode = false;
      }
    } else if (upgrades.length > 0 && (shouldRetreat || lowResources || this.tank.attributes.ammunition < 4)) {
      this.target = this.findMostNeededUpgrade(upgrades);
      this.targetType = 'upgrade';
      this.combatMode = false;
    } else if (enemies.length > 0 && this.tank.attributes.ammunition > 1) {
      // Hunt enemies even with low ammo if no urgent upgrades needed
      this.target = this.selectBestTarget(enemies);
      this.targetType = 'enemy';
      this.combatMode = true;
    } else {
      // Patrol and look for opportunities
      this.target = null;
      this.targetType = null;
      this.combatMode = false;
    }
  }

  makeBalancedDecision(enemies, upgrades, shouldRetreat, noAmmo, lowResources) {
    // Balanced AI: Mix of offensive and defensive behavior
    if (noAmmo && upgrades.some(u => u.type === 'AMMUNITION')) {
      this.target = this.findUpgradeByType(upgrades, 'AMMUNITION');
      this.targetType = 'upgrade';
      this.combatMode = false;
    } else if (shouldRetreat && upgrades.some(u => u.type === 'HEALTH')) {
      this.target = this.findUpgradeByType(upgrades, 'HEALTH');
      this.targetType = 'upgrade';
      this.combatMode = false;
    } else if (enemies.length > 0 && this.tank.attributes.ammunition > 0) {
      this.target = this.selectBestTarget(enemies);
      this.targetType = 'enemy';
      this.combatMode = true;
    } else if (upgrades.length > 0 && (shouldRetreat || lowResources || this.tank.attributes.ammunition < 6)) {
      this.target = this.findMostNeededUpgrade(upgrades);
      this.targetType = 'upgrade';
      this.combatMode = false;
    } else if (enemies.length > 0 && this.tank.attributes.ammunition > 2) {
      this.target = this.selectBestTarget(enemies);
      this.targetType = 'enemy';
      this.combatMode = true;
    } else {
      this.target = null;
      this.targetType = null;
      this.combatMode = false;
    }
  }

  makeAggressiveDecision(enemies, upgrades, shouldRetreat, noAmmo, lowResources) {
    // Aggressive AI: Prioritize combat, only retreat when very low health
    if (noAmmo && upgrades.some(u => u.type === 'AMMUNITION')) {
      this.target = this.findUpgradeByType(upgrades, 'AMMUNITION');
      this.targetType = 'upgrade';
      this.combatMode = false;
    } else if (enemies.length > 0 && this.tank.attributes.ammunition > 0) {
      // Always engage if we have ammo
      this.target = this.selectBestTarget(enemies);
      this.targetType = 'enemy';
      this.combatMode = true;
    } else if (shouldRetreat && upgrades.some(u => u.type === 'HEALTH')) {
      this.target = this.findUpgradeByType(upgrades, 'HEALTH');
      this.targetType = 'upgrade';
      this.combatMode = false;
    } else if (upgrades.length > 0 && (shouldRetreat || lowResources || this.tank.attributes.ammunition < 3)) {
      this.target = this.findMostNeededUpgrade(upgrades);
      this.targetType = 'upgrade';
      this.combatMode = false;
    } else if (enemies.length > 0 && this.tank.attributes.ammunition > 0) {
      // Hunt even with low ammo
      this.target = this.selectBestTarget(enemies);
      this.targetType = 'enemy';
      this.combatMode = true;
    } else {
      this.target = null;
      this.targetType = null;
      this.combatMode = false;
    }
  }

  makeBerserkerDecision(enemies, upgrades, shouldRetreat, noAmmo, lowResources) {
    // Berserker AI: Maximum aggression, almost never retreat
    if (noAmmo && upgrades.some(u => u.type === 'AMMUNITION')) {
      this.target = this.findUpgradeByType(upgrades, 'AMMUNITION');
      this.targetType = 'upgrade';
      this.combatMode = false;
    } else if (enemies.length > 0 && this.tank.attributes.ammunition > 0) {
      // Always engage enemies if we have any ammo
      this.target = this.selectBestTarget(enemies);
      this.targetType = 'enemy';
      this.combatMode = true;
    } else if (enemies.length > 0) {
      // Even without ammo, try to get close for melee (ramming)
      this.target = this.selectBestTarget(enemies);
      this.targetType = 'enemy';
      this.combatMode = true;
    } else if (upgrades.length > 0 && this.tank.attributes.ammunition === 0) {
      // Only get ammo if we have none
      this.target = this.findUpgradeByType(upgrades, 'AMMUNITION');
      this.targetType = 'upgrade';
      this.combatMode = false;
    } else {
      // Wander and look for enemies
      this.target = null;
      this.targetType = null;
      this.combatMode = false;
    }
  }
  
  findUpgradeByType(upgrades, type) {
    const matching = upgrades.filter(u => u.type === type);
    if (matching.length === 0) return null;
    
    // Return closest matching upgrade
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
      
      let score = 0;
      
      // Strategy-specific target selection
      switch (this.strategy) {
        case 'defensive':
          // Prefer distant, weak enemies (safer targets)
          score = distance * 0.5; // Prefer distance
          score += (1 - healthRatio) * 100; // Strongly prefer weak enemies
          if (enemy.attributes.ammunition < 2) score += 50; // Prefer low-ammo enemies
          break;
          
        case 'balanced':
          // Balanced approach - moderate distance preference
          score = 100 / distance; // Standard distance factor
          score += (1 - healthRatio) * 50; // Health factor
          if (enemy.attributes.ammunition < 3) score += 30;
          break;
          
        case 'aggressive':
          // Prefer closer, stronger enemies (more challenging)
          score = 200 / distance; // Strong distance preference
          score += healthRatio * 30; // Prefer stronger enemies
          if (enemy.attributes.ammunition > 5) score += 20; // Prefer well-armed enemies
          break;
          
        case 'berserker':
          // Prefer closest enemies regardless of strength
          score = 500 / distance; // Maximum distance preference
          score += healthRatio * 50; // Prefer strong enemies (more challenge)
          if (enemy.attributes.ammunition > 8) score += 40; // Prefer well-armed enemies
          break;
          
        default:
          // Default balanced scoring
          score = 100 / distance;
          score += (1 - healthRatio) * 50;
          if (enemy.attributes.ammunition < 3) score += 30;
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestTarget = enemy;
      }
    }
    
    return bestTarget;
  }

  executeAction(currentTime) {
    // If in obstacle avoidance mode, continue emergency maneuver
    if (this.obstacleAvoidanceTime > currentTime) {
      return;
    }

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
    
    // Strategy-specific combat behavior
    switch (this.strategy) {
      case 'defensive':
        this.defensiveCombat(enemyTank, distance, direction, targetAngle, currentTime);
        break;
      case 'balanced':
        this.balancedCombat(enemyTank, distance, direction, targetAngle, currentTime);
        break;
      case 'aggressive':
        this.aggressiveCombat(enemyTank, distance, direction, targetAngle, currentTime);
        break;
      case 'berserker':
        this.berserkerCombat(enemyTank, distance, direction, targetAngle, currentTime);
        break;
      default:
        this.balancedCombat(enemyTank, distance, direction, targetAngle, currentTime);
    }
  }

  defensiveCombat(enemyTank, distance, direction, targetAngle, currentTime) {
    // Defensive: Prefer long-range combat, retreat when threatened
    const MIN_DISTANCE = 120;  // Keep more distance
    const OPTIMAL_DISTANCE = 200; // Prefer long range
    const MAX_DISTANCE = 300; // Maximum range
    
    if (distance > MAX_DISTANCE) {
      // Too far - approach cautiously
      this.approachWithCaution(enemyTank.position, OPTIMAL_DISTANCE);
    } else if (distance > OPTIMAL_DISTANCE) {
      // Good long range - maintain distance and shoot
      this.maintainSafeDistance(enemyTank, direction, OPTIMAL_DISTANCE);
    } else if (distance > MIN_DISTANCE) {
      // Getting close - back away
      this.backAwayAndShoot(direction);
    } else {
      // Too close - emergency retreat
      this.performEmergencyManeuver();
    }

    this.rotateTowards(targetAngle);
    this.attemptShot(enemyTank, distance, targetAngle, currentTime);
  }

  balancedCombat(enemyTank, distance, direction, targetAngle, currentTime) {
    // Balanced: Mix of offensive and defensive tactics
    const MIN_DISTANCE = 80;
    const OPTIMAL_DISTANCE = 150;
    const MAX_DISTANCE = 250;
    
    if (distance > MAX_DISTANCE) {
      this.approachWithCaution(enemyTank.position, OPTIMAL_DISTANCE);
    } else if (distance > OPTIMAL_DISTANCE) {
      this.performFlankingManeuver(enemyTank, currentTime);
    } else if (distance > MIN_DISTANCE) {
      this.circleStrafe(enemyTank, direction);
    } else {
      this.maintainSafeDistance(enemyTank, direction, MIN_DISTANCE);
    }

    this.rotateTowards(targetAngle);
    this.attemptShot(enemyTank, distance, targetAngle, currentTime);
  }

  aggressiveCombat(enemyTank, distance, direction, targetAngle, currentTime) {
    // Aggressive: Close-range combat, push forward
    const MIN_DISTANCE = 60;  // Closer minimum
    const OPTIMAL_DISTANCE = 120; // Closer optimal
    const MAX_DISTANCE = 200; // Shorter max range
    
    if (distance > MAX_DISTANCE) {
      // Charge forward aggressively
      this.moveTowardsWithAvoidance(enemyTank.position);
    } else if (distance > OPTIMAL_DISTANCE) {
      // Close in for combat
      this.approachWithCaution(enemyTank.position, OPTIMAL_DISTANCE);
    } else if (distance > MIN_DISTANCE) {
      // Close combat - circle strafe aggressively
      this.circleStrafe(enemyTank, direction);
    } else {
      // Very close - maintain close range
      this.maintainSafeDistance(enemyTank, direction, MIN_DISTANCE);
    }

    this.rotateTowards(targetAngle);
    this.attemptShot(enemyTank, distance, targetAngle, currentTime);
  }

  berserkerCombat(enemyTank, distance, direction, targetAngle, currentTime) {
    // Berserker: Maximum aggression, charge into melee
    const MIN_DISTANCE = 40;  // Very close
    const OPTIMAL_DISTANCE = 80; // Close range
    const MAX_DISTANCE = 150; // Short range
    
    if (distance > MAX_DISTANCE) {
      // Charge at full speed
      this.moveTowardsWithAvoidance(enemyTank.position);
    } else if (distance > OPTIMAL_DISTANCE) {
      // Close in rapidly
      this.moveTowardsWithAvoidance(enemyTank.position);
    } else if (distance > MIN_DISTANCE) {
      // Close combat - aggressive circling
      this.circleStrafe(enemyTank, direction);
    } else {
      // Melee range - stay close and fight
      this.maintainSafeDistance(enemyTank, direction, MIN_DISTANCE);
    }

    this.rotateTowards(targetAngle);
    this.attemptShot(enemyTank, distance, targetAngle, currentTime);
  }

  moveTowardsWithAvoidance(targetPosition) {
    const direction = targetPosition.subtract(this.tank.position);
    const normalizedDirection = direction.normalize();
    
    // Check for obstacles (trees) in path
    const obstacles = this.gameState.trees;
    let avoidanceVector = new Vector2(0, 0);
    
    for (const tree of obstacles) {
      const toTree = tree.position.subtract(this.tank.position);
      const distanceToTree = toTree.magnitude();
      
      if (distanceToTree < 80) { // Tree too close (corrected pixel distance)
        const avoidDirection = toTree.normalize().multiply(-1);
        avoidanceVector = avoidanceVector.add(avoidDirection.multiply(80 / distanceToTree));
      }
    }
    
    // Combine movement direction with avoidance
    const finalDirection = normalizedDirection.add(avoidanceVector.multiply(0.5)).normalize();
    this.tank.targetVelocity = finalDirection.multiply(this.tank.attributes.speed);
  }

  performFlankingManeuver(enemyTank, currentTime) {
    // Change flank direction occasionally
    if (currentTime - this.lastFlankChange > 3000) {
      this.flankDirection *= -1;
      this.lastFlankChange = currentTime;
    }

    const toEnemy = enemyTank.position.subtract(this.tank.position);
    const currentDistance = toEnemy.magnitude();
    const perpendicular = new Vector2(-toEnemy.y * this.flankDirection, toEnemy.x * this.flankDirection).normalize();
    
    // Calculate distance maintenance
    const optimalDistance = 150;
    const distanceAdjustment = currentDistance - optimalDistance;
    
    // Mix flanking with distance maintenance
    const flankWeight = 0.6;
    const distanceWeight = 0.4;
    
    const flanking = perpendicular.multiply(flankWeight);
    let distanceMovement;
    
    if (distanceAdjustment > 20) {
      // Too far - move closer
      distanceMovement = toEnemy.normalize().multiply(distanceWeight);
    } else if (distanceAdjustment < -20) {
      // Too close - move away
      distanceMovement = toEnemy.normalize().multiply(-distanceWeight);
    } else {
      // Good distance - minimal forward movement
      distanceMovement = toEnemy.normalize().multiply(distanceWeight * 0.2);
    }
    
    this.tank.targetVelocity = flanking.add(distanceMovement).normalize().multiply(this.tank.attributes.speed);
  }

  circleStrafe(enemyTank, direction) {
    const currentDistance = direction.magnitude();
    const optimalDistance = 120;
    const distanceAdjustment = currentDistance - optimalDistance;
    
    const perpendicular = new Vector2(-direction.y, direction.x).normalize();
    let strafeMovement = perpendicular.multiply(this.tank.attributes.speed * 0.8);
    
    // Add distance maintenance to circle strafing
    if (distanceAdjustment > 15) {
      // Too far - add some forward movement
      const forwardComponent = direction.normalize().multiply(this.tank.attributes.speed * 0.2);
      strafeMovement = strafeMovement.add(forwardComponent);
    } else if (distanceAdjustment < -15) {
      // Too close - add some backward movement
      const backwardComponent = direction.normalize().multiply(-this.tank.attributes.speed * 0.2);
      strafeMovement = strafeMovement.add(backwardComponent);
    }
    
    this.tank.targetVelocity = strafeMovement;
  }

  approachWithCaution(targetPosition, desiredDistance) {
    const direction = targetPosition.subtract(this.tank.position);
    const distance = direction.magnitude();
    
    // Calculate how much closer we want to get
    const distanceToClose = distance - desiredDistance;
    
    if (distanceToClose > 20) {
      // Move towards target but slow down as we approach desired distance
      const approachSpeed = Math.min(1.0, distanceToClose / 100); // Slow down as we get closer
      const normalizedDirection = direction.normalize();
      this.tank.targetVelocity = normalizedDirection.multiply(this.tank.attributes.speed * approachSpeed);
    } else {
      // We're close enough to desired distance - stop approaching
      this.tank.targetVelocity = new Vector2(0, 0);
    }
  }

  maintainSafeDistance(enemyTank, direction, safeDistance) {
    const currentDistance = direction.magnitude();
    const distanceToSafe = safeDistance - currentDistance;
    
    if (distanceToSafe > 10) {
      // We're too close - back away more aggressively
      const backDirection = direction.normalize().multiply(-1);
      const retreatSpeed = Math.min(1.0, distanceToSafe / 50); // Faster retreat when closer
      this.tank.targetVelocity = backDirection.multiply(this.tank.attributes.speed * retreatSpeed);
    } else {
      // We're at safe distance - minimal movement to maintain position
      this.tank.targetVelocity = new Vector2(0, 0);
    }
  }

  backAwayAndShoot(direction) {
    const backDirection = direction.normalize().multiply(-1);
    this.tank.targetVelocity = backDirection.multiply(this.tank.attributes.speed * 0.6);
  }

  attemptShot(enemyTank, distance, targetAngle, currentTime) {
    // Don't spam shooting - use minimum interval
    if (currentTime - this.lastShotTime < this.minShotInterval) {
      return;
    }

    // Only shoot if we have ammo and can shoot
    if (!this.tank.canShoot() || this.tank.attributes.ammunition === 0) {
      return;
    }

    // Check if target moved significantly - affects accuracy
    let movementPenalty = 0;
    if (this.lastTargetPosition) {
      const targetMovement = enemyTank.position.distance(this.lastTargetPosition);
      const timeSinceLastAim = currentTime - this.aimingAdjustmentTime;
      
      if (targetMovement > 20 && timeSinceLastAim < this.reactionTime * 0.5) {
        // Target moved recently - apply accuracy penalty based on reaction time
        movementPenalty = (targetMovement / 100) * (this.reactionTime / 1000);
      }
    }
    
    // Update target tracking
    this.lastTargetPosition = enemyTank.position.clone();
    if (currentTime - this.aimingAdjustmentTime > this.reactionTime * 0.3) {
      this.aimingAdjustmentTime = currentTime;
    }

    // Predictive aiming with reaction time consideration
    const enemyVelocity = enemyTank.velocity || new Vector2(0, 0);
    const shellSpeed = this.tank.attributes.kinetics;
    const timeToHit = distance / shellSpeed;
    
    // Add some "lag" to prediction based on reaction time
    const predictionAccuracy = Math.max(0.3, 1 - (this.reactionTime / 2000)); // Worse prediction for slower AIs
    const adjustedTimeToHit = timeToHit * predictionAccuracy;
    
    const predictedPosition = enemyTank.position.add(enemyVelocity.multiply(adjustedTimeToHit));
    
    const predictedDirection = predictedPosition.subtract(this.tank.position);
    const predictedAngle = Math.atan2(predictedDirection.y, predictedDirection.x);
    
    // Check if we're aiming at the target (with proper angle normalization)
    let angleDiff = predictedAngle - this.tank.angle;
    // Normalize angle difference to [-π, π]
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    angleDiff = Math.abs(angleDiff);
    
    // Adjust angle tolerance based on difficulty and movement
    const baseAngleTolerance = 0.8;
    const reactionTimepenalty = (this.reactionTime / 1000) * 0.3; // Higher reaction time = worse aim
    const angleTolerance = baseAngleTolerance + reactionTimepenalty + movementPenalty;
    
    const angleOk = angleDiff < angleTolerance;
    const distanceOk = distance >= 30 && distance <= 400; // Proper pixel distance: 30 pixels to 400 pixels
    
    // Don't shoot if enemy is moving too fast perpendicular to our shot
    const perpendicularSpeed = Math.abs(enemyVelocity.x * Math.sin(this.tank.angle) - enemyVelocity.y * Math.cos(this.tank.angle));
    const speedTolerance = 2 + (this.reactionTime / 500); // Slower AIs are worse at tracking fast targets
    const speedOk = perpendicularSpeed < speedTolerance;
    
    // Apply accuracy modifier with movement penalty
    const effectiveAccuracy = Math.max(0.1, this.accuracy - movementPenalty);
    const accuracyCheck = Math.random() < effectiveAccuracy;
    
    // Shoot if aimed well and within effective range
    if (angleOk && distanceOk && speedOk && accuracyCheck) {
              // Removed excessive AI shooting logging
      this.tank.shoot();
      this.lastShotTime = currentTime;
    } else {
      // Removed excessive AI decision logging
    }
  }

  collectUpgrade() {
    if (!this.target) return;

    const direction = this.target.position.subtract(this.tank.position);
    const distance = direction.magnitude();

    if (distance < 30) {
      // We're close enough to collect (corrected pixel distance)
      this.target = null;
      return;
    }

    // Move towards upgrade
    const normalizedDirection = direction.normalize();
    this.tank.targetVelocity = normalizedDirection.multiply(this.tank.attributes.speed);
  }

  wander() {
    // Intelligent patrolling behavior (corrected pixel coordinates)
    if (!this.wanderTarget || this.tank.position.distance(this.wanderTarget) < 50) {
      // Choose new wander target that avoids obstacles
      let attempts = 0;
      do {
        this.wanderTarget = new Vector2(
          Math.random() * 1000 + 100,
          Math.random() * 600 + 100
        );
        attempts++;
      } while (this.isNearObstacle(this.wanderTarget) && attempts < 10);
    }

    // Move towards wander target with obstacle avoidance
    this.moveTowardsWithAvoidance(this.wanderTarget);
    
    // Reduce speed for wandering
    this.tank.targetVelocity = this.tank.targetVelocity.multiply(0.4);
    
    // Look around while wandering (rotate slowly)
    const currentTime = Date.now();
    if (currentTime % 3000 < 100) { // Change direction every 3 seconds briefly
      this.tank.angle += (Math.random() - 0.5) * 0.3;
    }
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
    
    // Normalize angle difference to [-π, π]
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    // Base rotation speed affected by reaction time
    const baseRotationSpeed = this.tank.attributes.rotation * 0.02;
    const reactionModifier = Math.max(0.3, 1 - (this.reactionTime / 2000)); // Slower reaction = slower rotation
    const rotationSpeed = baseRotationSpeed * reactionModifier;
    
    // Use smooth rotation - don't overshoot
    if (Math.abs(angleDiff) > 0.05) {
      const rotateAmount = Math.min(Math.abs(angleDiff), rotationSpeed) * Math.sign(angleDiff);
      this.tank.angle += rotateAmount;
      
      // Normalize tank angle to [0, 2π]
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

  findClosestEnemy(enemies) {
    let closest = null;
    let closestDistance = Infinity;

    for (const enemy of enemies) {
      const distance = this.tank.position.distance(enemy.position);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = enemy;
      }
    }

    return closest;
  }

  findMostNeededUpgrade(upgrades) {
    // Get current attribute limits from game state (if available)
    const maxHealth = 100;
    const maxSpeed = 50;
    const maxGasoline = 100;
    const maxRotation = 50;
    const maxAmmunition = 14;
    const maxKinetics = 300;
    
    // Prioritize upgrades based on current needs - only go for upgrades if we're below 80% of max
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
      
      // Base score from need - only consider if we actually need it
      switch (upgrade.type) {
        case 'HEALTH':
          score = needs.health;
          break;
        case 'AMMUNITION':
          score = needs.ammunition;
          break;
        case 'GASOLINE':
          score = needs.gasoline;
          break;
        case 'SPEED':
          score = needs.speed;
          break;
        case 'ROTATION':
          score = needs.rotation;
          break;
        case 'KINETICS':
          score = needs.kinetics;
          break;
      }

      // If we don't need this upgrade at all, skip it
      if (score <= 0) {
        continue;
      }

      // Factor in distance (closer is better)
      score = score / (distance * 0.01 + 1);

      if (score > bestScore) {
        bestScore = score;
        bestUpgrade = upgrade;
      }
    }

    return bestUpgrade;
  }
} 