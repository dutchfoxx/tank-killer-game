import { GAME_PARAMS } from './constants.js';

// Game State Types
export class Vector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  add(other) {
    return new Vector2(this.x + other.x, this.y + other.y);
  }

  subtract(other) {
    return new Vector2(this.x - other.x, this.y - other.y);
  }

  multiply(scalar) {
    return new Vector2(this.x * scalar, this.y * scalar);
  }

  magnitude() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  normalize() {
    const mag = this.magnitude();
    if (mag === 0) return new Vector2(0, 0);
    return new Vector2(this.x / mag, this.y / mag);
  }

  lerp(target, factor) {
    return new Vector2(
      this.x + (target.x - this.x) * factor,
      this.y + (target.y - this.y) * factor
    );
  }

  distance(other) {
    return this.subtract(other).magnitude();
  }

  dot(other) {
    return this.x * other.x + this.y * other.y;
  }

  clone() {
    return new Vector2(this.x, this.y);
  }

  rotate(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new Vector2(
      this.x * cos - this.y * sin,
      this.x * sin + this.y * cos
    );
  }
}

export class TankAttributes {
  constructor() {
    this.health = 100;
    this.speed = 50;
    this.gasoline = 100;
    this.rotation = 50;
    this.ammunition = 14;
    this.kinetics = 300;
  }

  clone() {
    const clone = new TankAttributes();
    clone.health = this.health;
    clone.speed = this.speed;
    clone.gasoline = this.gasoline;
    clone.rotation = this.rotation;
    clone.ammunition = this.ammunition;
    clone.kinetics = this.kinetics;
    return clone;
  }

  getPercentage(attribute, max, min) {
    const current = this[attribute];
    return Math.max(0, Math.min(100, ((current - min) / (max - min)) * 100));
  }
}

export class Tank {
  constructor(id, position, angle = 0) {
    this.id = id;
    this.position = position;
    this.angle = angle || 0; // Ensure angle is never null
    this.velocity = new Vector2(0, 0);
    this.targetVelocity = new Vector2(0, 0);
    this.attributes = new TankAttributes();
    this.isAlive = true;
    this.respawnTime = 0;
    this.reloadTime = 0;
    this.lastShot = 0;
    this.firingImmunity = 0; // Timestamp until which tank is immune to bullet damage
    this.isAI = false;
    this.lastShotBullet = null; // For AI tanks to store bullets before they're added to game state
  }

  update(deltaTime, gasolinePerUnit = GAME_PARAMS.GASOLINE_PER_UNIT, gasolineSpeedPenalty = GAME_PARAMS.GASOLINE_SPEED_PENALTY, trees = []) {
    // Removed excessive debug logging for cleaner output
    if (!this.isAlive) {
      this.respawnTime -= deltaTime;
      if (this.respawnTime <= 0) {
        this.respawn();
      }
      return;
    }

    // Update reload time
    if (this.reloadTime > 0) {
      this.reloadTime = Math.max(0, this.reloadTime - deltaTime);
    }

    // Apply gasoline penalty
    const effectiveSpeed = this.attributes.gasoline <= 0 
      ? this.attributes.speed * gasolineSpeedPenalty 
      : this.attributes.speed;

    // Calculate target angle based on movement direction
    const targetMagnitude = this.targetVelocity.magnitude();
    
    if (targetMagnitude > 0.01) {
      // Tank is actively moving - calculate target angle from input direction
      const targetAngle = Math.atan2(this.targetVelocity.y, this.targetVelocity.x);
      
      // Apply smooth rotation based on rotation speed attribute
      this.rotateTowards(targetAngle, deltaTime);
      
      // Calculate movement direction based on CURRENT tank angle (not target angle)
      // This ensures the tank only moves in the direction it's currently facing
      const movementDirection = new Vector2(
        Math.cos(this.angle),
        Math.sin(this.angle)
      );
      
      // Apply speed in the direction the tank is currently facing
      const targetVelocity = movementDirection.multiply(effectiveSpeed);
      
      // Smooth velocity interpolation towards the direction the tank is facing
      const lerpFactor = 0.15; // Smoothing factor
      this.velocity = this.velocity.lerp(targetVelocity, lerpFactor);
    } else {
      // Tank should stop - apply strong friction to reach zero quickly
      this.velocity = this.velocity.multiply(0.8);
      
      // If velocity becomes very small, set it to zero to avoid floating point precision issues
      if (this.velocity.magnitude() < 0.1) {
        this.velocity = new Vector2(0, 0);
      }
    }

    // Update position
    const oldPosition = this.position.clone();
    this.position = this.position.add(this.velocity.multiply(deltaTime / 1000));
    
    // Check collision with trees using gentle physics
    if (trees && trees.length > 0) {
      const tankRadius = 15; // Tank collision radius
      
      for (const tree of trees) {
        const trunkRadius = tree.size / 16; // Tree trunk collision radius (smaller)
        
        // Calculate distance between tank center and tree center
        const dx = this.position.x - tree.position.x;
        const dy = this.position.y - tree.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = tankRadius + trunkRadius;
        
        // Check if circles are overlapping
        if (distance < minDistance && distance > 0.1) {
          // Calculate collision normal (unit vector from tree to tank)
          const normalX = dx / distance;
          const normalY = dy / distance;
          
          // Calculate how much the tank is penetrating into the tree
          const overlap = minDistance - distance;
          
          // Very gentle separation - just push tank out slowly
          const separationStrength = 0.1; // Very weak separation force
          this.position.x += normalX * overlap * separationStrength;
          this.position.y += normalY * overlap * separationStrength;
          
          // Calculate velocity component moving toward tree
          const velocityTowardTree = -(this.velocity.x * normalX + this.velocity.y * normalY);
          
          // Only apply gentle resistance if moving toward tree
          if (velocityTowardTree > 0) {
            // Very subtle resistance - just slow down the component moving toward tree
            const resistanceStrength = 0.05; // Very gentle resistance (5%)
            const resistanceX = normalX * velocityTowardTree * resistanceStrength;
            const resistanceY = normalY * velocityTowardTree * resistanceStrength;
            
            // Apply resistance to velocity
            this.velocity.x -= resistanceX;
            this.velocity.y -= resistanceY;
            
            // Trigger very subtle tree animation
            const impactForce = velocityTowardTree * 0.5; // Much gentler force
            tree.impact(new Vector2(-this.velocity.x, -this.velocity.y), impactForce);
            
            // Only log significant collisions
            if (velocityTowardTree > 20) {
              console.log(`Tank ${this.id} gentle collision: speed=${velocityTowardTree.toFixed(1)}`);
            }
          }
        }
      }
    }
    
    // Calculate distance moved and consume gasoline
    const distanceMoved = this.position.distance(oldPosition);
    if (distanceMoved > 0.1) { // Only consume if actually moving
      const gasolineConsumed = distanceMoved * gasolinePerUnit;
      this.attributes.gasoline = Math.max(0, this.attributes.gasoline - gasolineConsumed);
    }

    // Keep tank within bounds
    this.position.x = Math.max(10, Math.min(1490, this.position.x));
    this.position.y = Math.max(10, Math.min(890, this.position.y));
  }

  rotateTowards(targetAngle, deltaTime) {
    let angleDiff = targetAngle - this.angle;
    
    // Normalize angle difference to [-π, π]
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    // Calculate rotation speed based on tank's rotation attribute
    // Higher rotation = faster turning, lower rotation = sluggish turning
    // Use a much larger multiplier for more responsive rotation
    const rotationSpeed = this.attributes.rotation * 0.1; // Increased from 0.02 to 0.1
    const maxRotationThisFrame = rotationSpeed * (deltaTime / 1000);
    
    // For very high rotation values, allow instant rotation
    if (this.attributes.rotation > 1000) {
      this.angle = targetAngle;
    } else {
      // Use smooth rotation - don't overshoot
      if (Math.abs(angleDiff) > 0.01) { // Reduced threshold from 0.05 to 0.01
        const rotateAmount = Math.min(Math.abs(angleDiff), maxRotationThisFrame) * Math.sign(angleDiff);
        this.angle += rotateAmount;
      }
    }
    
    // Normalize tank angle to [0, 2π]
    while (this.angle > 2 * Math.PI) this.angle -= 2 * Math.PI;
    while (this.angle < 0) this.angle += 2 * Math.PI;
  }

  respawn() {
    this.isAlive = true;
    this.position = new Vector2(
      Math.random() * 1000 + 100,
      Math.random() * 600 + 100
    );
    this.angle = Math.random() * Math.PI * 2;
    this.velocity = new Vector2(0, 0);
    this.targetVelocity = new Vector2(0, 0);
    this.attributes = new TankAttributes();
    this.respawnTime = 0;
    this.reloadTime = 0;
    this.firingImmunity = 0; // Reset firing immunity on respawn
    console.log(`Tank ${this.id} respawned at position:`, this.position);
  }

  canShoot() {
    const canShoot = this.isAlive && 
           this.attributes.ammunition > 0 && 
           this.reloadTime <= 0;
    
    // Only log for human players to reduce AI spam
    if (!this.isAI) {
      console.log(`Tank ${this.id} canShoot check:`, {
        isAlive: this.isAlive,
        ammunition: this.attributes.ammunition,
        reloadTime: this.reloadTime,
        canShoot: canShoot
      });
    }
    
    return canShoot;
  }

  shoot() {
    // Reduce logging for AI tanks to prevent spam
    if (!this.isAI) {
      console.log(`Tank ${this.id} shoot() called - health: ${this.attributes.health}, ammo: ${this.attributes.ammunition}`);
    }
    
    if (!this.canShoot()) {
      if (!this.isAI) {
        console.log(`Tank ${this.id} cannot shoot - conditions not met`);
      }
      return null;
    }

    if (!this.isAI) {
      console.log(`Tank ${this.id} shooting bullet`);
    }
    
    // Set a brief firing immunity to prevent self-damage
    this.firingImmunity = Date.now() + 200; // 200ms immunity after firing
    
    this.attributes.ammunition--;
    this.reloadTime = 1000; // 1 second reload time
    this.lastShot = Date.now();

    const bulletSpeed = this.attributes.kinetics;
    const direction = new Vector2(
      Math.cos(this.angle),
      Math.sin(this.angle)
    );
    const bulletVelocity = direction.multiply(bulletSpeed);

    // Position bullet well ahead of tank to avoid any collision
    const bulletOffset = 40; // Increased distance ahead of tank
    const bulletPosition = this.position.add(direction.multiply(bulletOffset));
    
    const bullet = new Bullet(
      this.id,
      bulletPosition,
      bulletVelocity,
      Date.now(),
      this.firingImmunity // Pass immunity time to bullet
    );

    // For AI tanks, store the bullet to be added by the game engine
    if (this.isAI) {
      this.lastShotBullet = bullet;
    }

    if (!this.isAI) {
      console.log(`Tank ${this.id} shot bullet at position:`, bulletPosition);
      console.log(`Tank ${this.id} remaining ammo: ${this.attributes.ammunition}, health: ${this.attributes.health}`);
    }
    
    return bullet;
  }

  takeDamage(fromBullet = null) {
    if (!this.isAlive) return false;

    // Check if tank has firing immunity
    const currentTime = Date.now();
    if (this.firingImmunity > currentTime) {
      console.log(`Tank ${this.id} is immune to damage (firing immunity until ${this.firingImmunity})`);
      return false;
    }

    // Check if bullet has immunity for this tank
    if (fromBullet && fromBullet.shooterImmunity > currentTime && fromBullet.shooterId === this.id) {
      console.log(`Tank ${this.id} is immune to its own bullet damage`);
      return false;
    }

    console.log(`Tank ${this.id} taking damage. Health before: ${this.attributes.health}`);
    this.attributes.health -= 1;
    this.attributes.speed = Math.max(5, this.attributes.speed - 5);
    this.attributes.rotation = Math.max(5, this.attributes.rotation - 5);
    this.attributes.kinetics = Math.max(50, this.attributes.kinetics - 10);
    this.attributes.gasoline = Math.max(0, this.attributes.gasoline - 5);
    
    console.log(`Tank ${this.id} health after damage: ${this.attributes.health}`);

    if (this.attributes.health <= 0) {
      console.log(`Tank ${this.id} died from damage`);
      this.die();
    }
    
    return true; // Damage was applied
  }

  die() {
    console.log(`Tank ${this.id} die() called - setting isAlive to false`);
    this.isAlive = false;
    this.respawnTime = 5000; // 5 seconds
  }

  getBoundingBox() {
    const size = 30; // Increased from 20 to 30 for better collision detection
    return {
      x: this.position.x - size / 2,
      y: this.position.y - size / 2,
      width: size,
      height: size
    };
  }

  checkCollision(box1, box2) {
    return box1.x < box2.x + box2.width &&
           box1.x + box1.width > box2.x &&
           box1.y < box2.y + box2.height &&
           box1.y + box1.height > box2.y;
  }


}

export class Bullet {
  constructor(shooterId, position, velocity, timestamp, shooterImmunity = 0) {
    this.shooterId = shooterId;
    this.position = position;
    this.velocity = velocity;
    this.timestamp = timestamp;
    this.shooterImmunity = shooterImmunity; // Time until shooter is immune to this bullet
    // Removed lifetime since bullets should persist until collision or going off-screen
  }

  update(deltaTime) {
    this.position = this.position.add(this.velocity.multiply(deltaTime / 1000));
    // Removed lifetime decrement since bullets should persist until collision or going off-screen
  }

  isExpired() {
    // Only consider bullets expired if they go off the game arena
    return this.position.x < 0 || 
           this.position.x > 1200 ||
           this.position.y < 0 || 
           this.position.y > 800;
  }

  getBoundingBox() {
    const size = 4;
    return {
      x: this.position.x - size / 2,
      y: this.position.y - size / 2,
      width: size,
      height: size
    };
  }
}

export class Upgrade {
  constructor(type, position, rotationRange = 30) {
    this.type = type;
    this.position = position;
    this.collected = false;
    // Add random rotation based on rotation range (converted to radians)
    this.rotation = (Math.random() - 0.5) * (rotationRange * Math.PI / 180); // Convert degrees to radians
  }

  getBoundingBox() {
    const size = 22.5; // Increased by 25% from 18 (18 * 1.25 = 22.5)
    return {
      x: this.position.x - size / 2,
      y: this.position.y - size / 2,
      width: size,
      height: size
    };
  }
}

export class Tree {
  constructor(position, size) {
    this.position = position;
    this.size = size;
    this.swingAngle = 0; // Current swing angle in radians
    this.swingVelocity = 0; // Angular velocity (rad/s)
    this.naturalFrequency = 2.0; // Natural frequency of pendulum (rad/s)
    this.dampingRatio = 0.1; // Damping ratio (0 = no damping, 1 = critical damping)
    this.lastImpactTime = Date.now() - 10000; // Initialize to 10 seconds ago (no recent impact)
    
    // Visual properties for consistent rendering
    const treeTypes = ['tree1', 'tree2', 'tree3'];
    this.treeType = treeTypes[Math.floor(Math.random() * treeTypes.length)];
    this.leafRotation = Math.random() * Math.PI * 2; // Random rotation between 0 and 2π
  }

  // Called when tree is hit by something (bullet, tank, etc.)
  impact(impactVelocity, impactForce = null) {
    // Calculate impact direction and magnitude
    const impactSpeed = impactVelocity.magnitude();
    
    if (impactSpeed < 1) return; // Ignore very small impacts
    
    const impactDirection = impactVelocity.normalize();
    
    // Convert impact to very subtle pendulum motion
    // Use force if provided, otherwise use speed
    const forceScale = impactForce ? Math.min(impactForce / 500, 0.2) : Math.min(impactSpeed / 200, 0.2);
    const swingImpulse = -impactDirection.x * forceScale * 0.001; // Much more subtle
    
    // Add impulse to current angular velocity
    this.swingVelocity += swingImpulse;
    
    // Keep swing very small and stable
    this.swingVelocity = Math.max(-0.2, Math.min(0.2, this.swingVelocity));
    
    this.lastImpactTime = Date.now();
    
    // Only log significant impacts
    if (Math.abs(swingImpulse) > 0.0001) {
      console.log(`Tree impact - force: ${(impactForce || impactSpeed).toFixed(1)}, swing impulse: ${swingImpulse.toFixed(4)}`);
    }
  }

  // Update swing animation using pendulum physics
  update(deltaTime) {
    const dt = deltaTime / 1000; // Convert to seconds
    
    // Only apply swing animation if there's been a recent impact (within last 5 seconds)
    const timeSinceLastImpact = Date.now() - this.lastImpactTime;
    const impactThreshold = 5000; // 5 seconds
    
    if (timeSinceLastImpact > impactThreshold) {
      // No recent impact, immediately stop all motion
      if (this.swingVelocity !== 0 || this.swingAngle !== 0) {
        console.log(`Tree stopping motion - swingAngle: ${this.swingAngle.toFixed(3)}, swingVelocity: ${this.swingVelocity.toFixed(3)}`);
        this.swingVelocity = 0;
        this.swingAngle = 0;
      }
      return;
    }
    
    // Pendulum physics: ω = natural frequency, ζ = damping ratio
    // For a damped harmonic oscillator: θ'' + 2ζωθ' + ω²θ = 0
    
    // Calculate restoring force (tries to return to center)
    const restoringAcceleration = -this.naturalFrequency * this.naturalFrequency * this.swingAngle;
    
    // Calculate damping force (opposes motion)
    const dampingAcceleration = -2 * this.dampingRatio * this.naturalFrequency * this.swingVelocity;
    
    // Total angular acceleration
    const angularAcceleration = restoringAcceleration + dampingAcceleration;
    
    // Update velocity and position using Verlet integration for stability
    this.swingVelocity += angularAcceleration * dt;
    this.swingAngle += this.swingVelocity * dt;
    
    // Stop very small oscillations to prevent infinite wobbling
    if (Math.abs(this.swingVelocity) < 0.01 && Math.abs(this.swingAngle) < 0.001) {
      this.swingVelocity = 0;
      this.swingAngle = 0;
    }
    
    // Safety bounds to prevent extreme swings
    this.swingAngle = Math.max(-0.5, Math.min(0.5, this.swingAngle));
  }

  getBoundingBox() {
    // Use trunk circle as collision box (smaller than visual - 1/8th of tree size)
    // The trunk circle is positioned at -tree.size/2 on Y-axis, so adjust collision box accordingly
    const trunkRadius = this.size / 16; // 1/16th of tree size (smaller collision box)
    return {
      x: this.position.x - trunkRadius,
      y: this.position.y - this.size/2 - trunkRadius, // Adjust Y position to match visual trunk circle
      width: trunkRadius * 2,
      height: trunkRadius * 2
    };
  }
}

export class Player {
  constructor(id, callname, tankColor, team) {
    this.id = id;
    this.callname = callname;
    this.tankColor = tankColor;
    this.team = team;
    this.tank = null;
    this.lastUpdate = Date.now();
  }
}



export class GameState {
  constructor() {
    this.players = new Map();
    this.tanks = new Map();
    this.bullets = [];
    this.upgrades = [];
    this.trees = [];

    this.gameTime = 0;
    this.lastUpdate = Date.now();
  }
} 