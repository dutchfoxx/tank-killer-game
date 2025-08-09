import { GAME_PARAMS, DAMAGE_PARAMS } from './constants.js';

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
    this.firingImmunity = 0; // Timestamp until which tank is immune to shell damage
    this.isAI = false;
    this.lastShotShell = null; // For AI tanks to store shells before they're added to game state
    
    // Shooting animation state (matching tank designer)
    this.isFiring = false;
    this.fireAnimation = 0;
    this.lastFireTime = 0;
    
    // Recoil animation state (matching tank designer)
    this.bodyRecoilOffset = { x: 0, y: 0 };
    this.turretRecoilOffset = { x: 0, y: 0 };
    this.turretPendulumAngle = 0;
    
    // Animation settings (matching tank designer defaults)
    this.bodyRecoilDistance = 3;
    this.turretRecoilDistance = 8;
    this.turretPendulumRange = 0.1; // Reduced from 0.3 to 0.1 for very subtle rotation
    this.turretPendulumSpeed = 0.5;
    this.pendulumDirection = 1; // Random direction for pendulum swing
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

    // Calculate movement based on tank's current facing direction (realistic tank movement)
    const targetMagnitude = this.targetVelocity.magnitude();
    
    if (targetMagnitude > 0.01) {
      // Tank is actively moving - calculate target angle from input direction
      const targetAngle = Math.atan2(this.targetVelocity.y, this.targetVelocity.x);
      
      // Apply smooth rotation based on rotation speed attribute
      this.rotateTowards(targetAngle, deltaTime);
      
      // ALL tanks (both AI and player) should move only in their current facing direction
      // This prevents the weird strafing effect when rotating
      const currentDirection = new Vector2(Math.cos(this.angle), Math.sin(this.angle));
      const desiredDirection = this.targetVelocity.normalize();
      const dotProduct = currentDirection.dot(desiredDirection);
      
      // Only move forward or backward, not sideways
      const forwardSpeed = dotProduct * effectiveSpeed;
      const movementDirection = currentDirection.multiply(Math.sign(forwardSpeed));
      const targetVelocity = movementDirection.multiply(Math.abs(forwardSpeed));
      
      // Smooth velocity interpolation
      const lerpFactor = 0.15;
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
    
    // Check collision with trees using simplified circle-to-circle physics
    if (trees && trees.length > 0) {
      const tankRadius = 22; // Tank collision radius (increased by 10% from 20 to 22)
      
      for (const tree of trees) {
        const trunkRadius = tree.size / 16; // Tree trunk collision radius (even smaller)
        
        // Calculate trunk position (same as visual trunk position)
        const trunkX = tree.position.x;
        const trunkY = tree.position.y - tree.size / 2; // Trunk is positioned at -tree.size/2 relative to tree center
        
        // Calculate distance between tank center and trunk center
        const dx = this.position.x - trunkX;
        const dy = this.position.y - trunkY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = tankRadius + trunkRadius;
        
        // Check if circles are overlapping
        if (distance < minDistance && distance > 0.1) {
          // Calculate collision normal (unit vector from trunk to tank)
          const normalX = dx / distance;
          const normalY = dy / distance;
          
          // Separate the circles (prevent overlap)
          const overlap = minDistance - distance;
          this.position.x += normalX * overlap;
          this.position.y += normalY * overlap;
          
          // Calculate velocity component moving toward trunk
          const velocityTowardTree = -(this.velocity.x * normalX + this.velocity.y * normalY);
          
          // Only apply physics if moving toward tree
          if (velocityTowardTree > 0) {
            // Elastic collision: reflect velocity along normal
            const reflectionX = normalX * velocityTowardTree * 0.8; // 80% bounce
            const reflectionY = normalY * velocityTowardTree * 0.8;
            
            // Apply reflection to velocity
            this.velocity.x += reflectionX;
            this.velocity.y += reflectionY;
            
            // Apply friction (slow down slightly)
            const friction = 0.95; // 5% speed reduction
            this.velocity.x *= friction;
            this.velocity.y *= friction;
            
            // Trigger tree animation
            const impactForce = velocityTowardTree * 0.3;
            tree.impact(new Vector2(-this.velocity.x, -this.velocity.y), impactForce);
            // Make trees swing quicker (not further) for a short time on tank collision
            if (typeof tree.boostSwingFrequency === 'function') {
              tree.boostSwingFrequency(1200, 1.8);
            }
            
            // Significant collision detected but not logged for performance
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
    
    // Update recoil animation (matching tank designer)
    const currentTime = Date.now();
    const timeSinceFire = currentTime - this.lastFireTime;
    
    if (this.isFiring && timeSinceFire < 1000) { // 1 second animation
      const progress = timeSinceFire / 1000;
      
      // Body recoil: instant backward, smooth return
      if (progress < 0.1) {
        // Instant recoil phase (first 10% of animation)
        this.bodyRecoilOffset.x = -this.bodyRecoilDistance;
      } else {
        // Smooth return phase (remaining 90%)
        const returnProgress = (progress - 0.1) / 0.9;
        // Use easeOutCubic for smooth return
        const easedProgress = 1 - Math.pow(1 - returnProgress, 3);
        const returnAmount = this.bodyRecoilDistance * (1 - easedProgress);
        this.bodyRecoilOffset.x = -returnAmount;
      }
      
      // Turret recoil: instant backward, smooth return
      if (progress < 0.1) {
        // Instant recoil phase (first 10% of animation)
        this.turretRecoilOffset.x = -this.turretRecoilDistance;
      } else {
        // Smooth return phase (remaining 90%)
        const returnProgress = (progress - 0.1) / 0.9;
        // Use easeOutCubic for smooth return
        const easedProgress = 1 - Math.pow(1 - returnProgress, 3);
        const returnAmount = this.turretRecoilDistance * (1 - easedProgress);
        this.turretRecoilOffset.x = -returnAmount;
      }
      
      // Turret pendulum rotation (continuous during animation) with random direction
      const pendulumProgress = progress * this.turretPendulumSpeed;
      this.turretPendulumAngle = Math.sin(pendulumProgress * Math.PI * 2) * Math.abs(this.turretPendulumRange) * this.pendulumDirection;
      
      // Update fire animation (matching tank designer)
      if (this.fireAnimation < 10) {
        this.fireAnimation++;
      }
      
    } else {
      // Reset to normal position
      this.bodyRecoilOffset.x = 0;
      this.bodyRecoilOffset.y = 0;
      this.turretRecoilOffset.x = 0;
      this.turretRecoilOffset.y = 0;
      this.turretPendulumAngle = 0;
      this.isFiring = false;
      this.fireAnimation = 0;
    }
  }

  rotateTowards(targetAngle, deltaTime) {
    let angleDiff = targetAngle - this.angle;
    
    // Normalize angle difference to [-π, π]
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    // Calculate rotation speed based on tank's rotation attribute
    // Higher rotation = faster turning, lower rotation = sluggish turning
    const rotationSpeed = this.attributes.rotation * 0.1; // Increased from 0.02 to 0.1
    const maxRotationThisFrame = rotationSpeed * (deltaTime / 1000);
    
    // Fixed: Remove instant rotation - always use smooth rotation based on tank's rotation attribute
    if (Math.abs(angleDiff) > 0.01) { // Reduced threshold from 0.05 to 0.01
      const rotateAmount = Math.min(Math.abs(angleDiff), maxRotationThisFrame) * Math.sign(angleDiff);
      this.angle += rotateAmount;
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
  }

  canShoot() {
    const canShoot = this.isAlive && 
           this.attributes.ammunition > 0 && 
           this.reloadTime <= 0;
    
    // Removed excessive logging for better performance
    
    return canShoot;
  }

  shoot() {
    // Removed excessive logging - only log critical events
    if (!this.canShoot()) {
      return null;
    }
    
    // Set a brief firing immunity to prevent self-damage
    this.firingImmunity = Date.now() + 200; // 200ms immunity after firing
    
    this.attributes.ammunition--;
    this.reloadTime = 1000; // 1 second reload time
    this.lastShot = Date.now();

    // Trigger shooting animation (matching tank designer)
    this.isFiring = true;
    this.fireAnimation = 0;
    this.lastFireTime = Date.now();
    
    // Set random pendulum direction for varied animation
    this.pendulumDirection = Math.random() < 0.5 ? 1 : -1;

    const shellSpeed = this.attributes.kinetics;
    const direction = new Vector2(
      Math.cos(this.angle),
      Math.sin(this.angle)
    );
    const shellVelocity = direction.multiply(shellSpeed);

    // Position shell closer to tank barrel (approximately 15-20 pixels from tank center)
    const shellOffset = 20; // Reduced distance to be closer to tank barrel
    const shellPosition = this.position.add(direction.multiply(shellOffset));
    
    const shell = new Shell(
      this.id,
      shellPosition,
      shellVelocity,
      Date.now(),
      this.firingImmunity // Pass immunity time to shell
    );

    // For AI tanks, store the shell to be added by the game engine
    if (this.isAI) {
      this.lastShotShell = shell;
    }

    // Removed excessive logging - only log critical events
    
    return shell;
  }

  takeDamage(fromShell = null) {
    if (!this.isAlive) return false;

    // Check if tank has firing immunity
    const currentTime = Date.now();
    if (this.firingImmunity > currentTime) {
      return false;
    }

    // Check if shell has immunity for this tank
    if (fromShell && fromShell.shooterImmunity > currentTime && fromShell.shooterId === this.id) {
      return false;
    }
    this.attributes.health -= DAMAGE_PARAMS.HEALTH;
    this.attributes.speed = Math.max(5, this.attributes.speed - DAMAGE_PARAMS.SPEED);
    this.attributes.rotation = Math.max(5, this.attributes.rotation - DAMAGE_PARAMS.ROTATION);
    this.attributes.kinetics = Math.max(50, this.attributes.kinetics - DAMAGE_PARAMS.KINETICS);
    this.attributes.gasoline = Math.max(0, this.attributes.gasoline - DAMAGE_PARAMS.GASOLINE);
    
    if (this.attributes.health <= 0) {
      this.die();
    }
    
    return true; // Damage was applied
  }

  die() {
    this.isAlive = false;
    this.respawnTime = 5000; // 5 seconds
  }

  getBoundingBox() {
    // Rectangular collision box to match tank shape (longer than wide)
    const width = 40;  // Tank length (front to back)
    const height = 25; // Tank width (side to side) - narrower for better side collision
    return {
      x: this.position.x - width / 2,
      y: this.position.y - height / 2,
      width: width,
      height: height
    };
  }

  checkCollision(box1, box2) {
    return box1.x < box2.x + box2.width &&
           box1.x + box1.width > box2.x &&
           box1.y < box2.y + box2.height &&
           box1.y + box1.height > box2.y;
  }


}

export class Shell {
  constructor(shooterId, position, velocity, timestamp, shooterImmunity = 0) {
    this.shooterId = shooterId;
    this.position = position;
    this.velocity = velocity;
    this.timestamp = timestamp;
    this.shooterImmunity = shooterImmunity; // Time until shooter is immune to this shell
    // Removed lifetime since shells should persist until collision or going off-screen
  }

  update(deltaTime) {
    this.position = this.position.add(this.velocity.multiply(deltaTime / 1000));
    // Removed lifetime decrement since shells should persist until collision or going off-screen
  }

  isExpired() {
    // Only consider shells expired if they go off the game arena
    return this.position.x < 0 || 
           this.position.x > 1200 ||
           this.position.y < 0 || 
           this.position.y > 800;
  }

  getBoundingBox() {
    const size = 5; // Increased by 15% from 4 to 5
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
    
    // Temporary frequency boost state when hit by a tank
    this.frequencyBoostUntil = 0; // timestamp in ms
    this.frequencyBoostFactor = 1; // multiplier applied to gravity constant
    
    // Visual properties for consistent rendering
    const treeTypes = ['tree1', 'tree2', 'tree3'];
    this.treeType = treeTypes[Math.floor(Math.random() * treeTypes.length)];
    this.leafRotation = Math.random() * Math.PI * 2; // Random rotation between 0 and 2π
  }

  // Called when tree is hit by something (shell, tank, etc.)
  impact(impactVelocity, impactForce = null) {
    // Calculate impact direction and magnitude
    const impactSpeed = impactVelocity.magnitude();
    
    if (impactSpeed < 1) return; // Ignore very small impacts
    
    const impactDirection = impactVelocity.normalize();
    
    // Extremely visible spring-damper response for both rotation and translation
    const forceScale = impactForce ? Math.min(impactForce / 10, 5.0) : Math.min(impactSpeed / 5, 5.0);
    
    // Proper pendulum impulse based on impact direction - much less intense
    // Calculate the angle of the impact direction
    const impactAngle = Math.atan2(impactDirection.y, impactDirection.x);
    // The tree should swing in the opposite direction of the impact
    const swingImpulse = -impactAngle * forceScale * 0.02; // Reduced from 0.1 to 0.02 (5x less)
    this.swingVelocity += swingImpulse;
    this.swingVelocity = Math.max(-1.5, Math.min(1.5, this.swingVelocity)); // Reduced from ±3.0 to ±1.5
    
    // Translation impulse (move foliage in X and Y) - back to previous direction and reduced
    const moveImpulseX = -impactDirection.x * forceScale * 1.0; // Back to negative (previous behavior) and reduced from 1.25 to 1.0
    const moveImpulseY = -impactDirection.y * forceScale * 1.0; // Keep Y inverted and reduced from 1.25 to 1.0
    this.foliageVelocityX = (this.foliageVelocityX || 0) + moveImpulseX;
    this.foliageVelocityY = (this.foliageVelocityY || 0) + moveImpulseY;
    
    // Limit translation velocity - reduced slightly more
    this.foliageVelocityX = Math.max(-2.5, Math.min(2.5, this.foliageVelocityX)); // Reduced from ±3.5 to ±2.5
    this.foliageVelocityY = Math.max(-2.5, Math.min(2.5, this.foliageVelocityY)); // Reduced from ±3.5 to ±2.5
    
    this.lastImpactTime = Date.now();
  }

  // Temporarily increase swing frequency (oscillation speed) without increasing amplitude
  boostSwingFrequency(durationMs = 1000, factor = 1.5) {
    const now = Date.now();
    this.frequencyBoostUntil = Math.max(this.frequencyBoostUntil, now + durationMs);
    this.frequencyBoostFactor = Math.max(1, Math.min(3, factor));
  }

  // Update swing animation using simplified spring-damper physics
  update(deltaTime) {
    const dt = deltaTime / 1000; // Convert to seconds
    
    // Only apply swing animation if there's been a recent impact (within last 5 seconds)
    const timeSinceLastImpact = Date.now() - this.lastImpactTime;
    const impactThreshold = 5000; // 5 seconds
    
    if (timeSinceLastImpact > impactThreshold) {
      // No recent impact, gradually stop motion
      this.swingVelocity *= 0.95; // Damping
      this.swingAngle *= 0.98; // Return to center
      
      // Also dampen translation
      this.foliageVelocityX = (this.foliageVelocityX || 0) * 0.95;
      this.foliageVelocityY = (this.foliageVelocityY || 0) * 0.95;
      this.foliageOffsetX = (this.foliageOffsetX || 0) * 0.98; // Return to center
      this.foliageOffsetY = (this.foliageOffsetY || 0) * 0.98;
      
      if (Math.abs(this.swingVelocity) < 0.01 && Math.abs(this.swingAngle) < 0.001 &&
          Math.abs(this.foliageVelocityX || 0) < 0.01 && Math.abs(this.foliageVelocityY || 0) < 0.01) {
        this.swingVelocity = 0;
        this.swingAngle = 0;
        this.foliageVelocityX = 0;
        this.foliageVelocityY = 0;
        this.foliageOffsetX = 0;
        this.foliageOffsetY = 0;
      }
      return;
    }
    
    // Proper pendulum physics with gravity
    const baseGravity = 2.0; // Base gravity constant controls oscillation speed
    // Apply temporary frequency boost if active
    const nowTs = Date.now();
    const gravityBoost = nowTs < this.frequencyBoostUntil ? this.frequencyBoostFactor : 1;
    const gravity = baseGravity * gravityBoost;
    const dampingConstant = 0.3; // Air resistance
    
    // Pendulum force: -gravity * sin(angle) tries to return to center
    const pendulumForce = -gravity * Math.sin(this.swingAngle);
    
    // Damping force (air resistance)
    const dampingForce = -dampingConstant * this.swingVelocity;
    
    // Total angular acceleration
    const angularAcceleration = pendulumForce + dampingForce;
    
    // Update rotation velocity and position
    this.swingVelocity += angularAcceleration * dt;
    this.swingAngle += this.swingVelocity * dt;
    
    // Safety bounds for pendulum
    this.swingAngle = Math.max(-1.0, Math.min(1.0, this.swingAngle)); // About 60 degrees max
    
    // Enhanced translation physics for foliage movement
    const translationSpringConstant = 0.2; // Weaker spring for more dramatic movement
    const translationDampingConstant = 0.2; // Less damping for longer movement
    
    // Initialize offsets if they don't exist
    this.foliageOffsetX = this.foliageOffsetX || 0;
    this.foliageOffsetY = this.foliageOffsetY || 0;
    this.foliageVelocityX = this.foliageVelocityX || 0;
    this.foliageVelocityY = this.foliageVelocityY || 0;
    
    // Spring force to return foliage to center
    const springForceX = -translationSpringConstant * this.foliageOffsetX;
    const springForceY = -translationSpringConstant * this.foliageOffsetY;
    
    // Damping force
    const dampingForceX = -translationDampingConstant * this.foliageVelocityX;
    const dampingForceY = -translationDampingConstant * this.foliageVelocityY;
    
    // Update translation velocity and position
    this.foliageVelocityX += (springForceX + dampingForceX) * dt;
    this.foliageVelocityY += (springForceY + dampingForceY) * dt;
    this.foliageOffsetX += this.foliageVelocityX * dt;
    this.foliageOffsetY += this.foliageVelocityY * dt;
    
    // Safety bounds for translation - reduced slightly more
    this.foliageOffsetX = Math.max(-5, Math.min(5, this.foliageOffsetX)); // Reduced from ±7 to ±5
    this.foliageOffsetY = Math.max(-5, Math.min(5, this.foliageOffsetY)); // Reduced from ±7 to ±5
  }

  getBoundingBox() {
    // Use trunk circle as collision box - matches the visual trunk circle
    const trunkRadius = this.size / 12; // Changed to 1/12th of tree size for medium collision area
    return {
      x: this.position.x - trunkRadius,
      y: this.position.y - trunkRadius, // Centered collision box
      width: trunkRadius * 2,
      height: trunkRadius * 2
    };
  }
}

export class Patch {
  constructor(position, size, type, rotation = 0) {
    this.position = position;
    this.size = size;
    this.type = type; // patch1, patch2, etc.
    this.rotation = rotation; // Random rotation in radians
  }

  getBoundingBox() {
    return {
      x: this.position.x - this.size / 2,
      y: this.position.y - this.size / 2,
      width: this.size,
      height: this.size
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
    this.shells = [];
    this.upgrades = [];
    this.trees = [];
    this.patches = [];

    this.gameTime = 0;
    this.lastUpdate = Date.now();
  }
} 