import { GAME_PARAMS, DAMAGE_PARAMS } from './constants.js';
import { memoryManager } from './objectPools.js';

// Game State Types
export class Vector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  // OPTIMIZATION: In-place operations to avoid object creation
  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }

  setFrom(other) {
    this.x = other.x;
    this.y = other.y;
    return this;
  }

  add(other) {
    return new Vector2(this.x + other.x, this.y + other.y);
  }

  addInPlace(other) {
    this.x += other.x;
    this.y += other.y;
    return this;
  }

  subtract(other) {
    return new Vector2(this.x - other.x, this.y - other.y);
  }

  subtractInPlace(other) {
    this.x -= other.x;
    this.y -= other.y;
    return this;
  }

  multiply(scalar) {
    return new Vector2(this.x * scalar, this.y * scalar);
  }

  multiplyInPlace(scalar) {
    this.x *= scalar;
    this.y *= scalar;
    return this;
  }

  magnitude() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  magnitudeSquared() {
    return this.x * this.x + this.y * this.y;
  }

  normalize() {
    const mag = this.magnitude();
    if (mag === 0) return new Vector2(0, 0);
    return new Vector2(this.x / mag, this.y / mag);
  }

  normalizeInPlace() {
    const mag = this.magnitude();
    if (mag === 0) {
      this.x = 0;
      this.y = 0;
    } else {
      this.x /= mag;
      this.y /= mag;
    }
    return this;
  }

  lerp(target, factor) {
    return new Vector2(
      this.x + (target.x - this.x) * factor,
      this.y + (target.y - this.y) * factor
    );
  }

  lerpInPlace(target, factor) {
    this.x += (target.x - this.x) * factor;
    this.y += (target.y - this.y) * factor;
    return this;
  }

  distance(other) {
    return this.subtract(other).magnitude();
  }

  distanceSquared(other) {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return dx * dx + dy * dy;
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

  rotateInPlace(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const oldX = this.x;
    this.x = oldX * cos - this.y * sin;
    this.y = oldX * sin + this.y * cos;
    return this;
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
    
    // OPTIMIZATION: Spatial partitioning bounds (updated on position change)
    this.bounds = null;
    this.updateBounds();
  }

  // OPTIMIZATION: Update spatial bounds for collision detection
  updateBounds() {
    // Tank collision box: longer front/back, narrower sides (more realistic)
    const frontBackWidth = 48;  // Front/back collision width (was 44, increased slightly)
    const sideHeight = 32;      // Side collision height (was 44, reduced significantly)
    
    // Store dimensions for OBB collision detection
    this.collisionWidth = frontBackWidth;
    this.collisionHeight = sideHeight;
    
    // Keep AABB for spatial partitioning (performance)
    this.bounds = {
      x: this.position.x - frontBackWidth / 2,
      y: this.position.y - sideHeight / 2,
      width: frontBackWidth,
      height: sideHeight
    };
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
      
      // OPTIMIZATION: Use temporary variables instead of creating new Vector2 objects
      const cosAngle = Math.cos(this.angle);
      const sinAngle = Math.sin(this.angle);
      
      // Calculate how much the tank should move forward/backward based on input direction
      // This creates realistic tank movement where the tank can only move in the direction it's facing
      const targetVelMagnitude = Math.sqrt(this.targetVelocity.x * this.targetVelocity.x + this.targetVelocity.y * this.targetVelocity.y);
      const desiredDirectionX = this.targetVelocity.x / targetVelMagnitude;
      const desiredDirectionY = this.targetVelocity.y / targetVelMagnitude;
      
      // Calculate dot product to determine if we're moving forward or backward relative to tank's facing direction
      const dotProduct = cosAngle * desiredDirectionX + sinAngle * desiredDirectionY;
      
      // Only allow forward/backward movement (no sideways movement like a car)
      // Positive dot product = moving forward, negative = moving backward
      const forwardSpeed = Math.abs(dotProduct) * effectiveSpeed;
      const movementDirection = Math.sign(dotProduct); // 1 for forward, -1 for backward
      
      // Calculate target velocity in the tank's facing direction
      const targetVelocityX = cosAngle * forwardSpeed * movementDirection;
      const targetVelocityY = sinAngle * forwardSpeed * movementDirection;
      
      // Smooth velocity interpolation for realistic movement feel
      const lerpFactor = 0.12; // Slightly reduced for more realistic tank movement
      this.velocity.x = this.velocity.x + (targetVelocityX - this.velocity.x) * lerpFactor;
      this.velocity.y = this.velocity.y + (targetVelocityY - this.velocity.y) * lerpFactor;
    } else {
      // Tank should stop - apply strong friction to reach zero quickly
      this.velocity.x *= 0.7; // Increased friction for more realistic tank stopping
      this.velocity.y *= 0.7;
      
      // If velocity becomes very small, set it to zero to avoid floating point precision issues
      if (this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y < 0.01) {
        this.velocity.x = 0;
        this.velocity.y = 0;
      }
    }

    // OPTIMIZATION: Store old position values instead of cloning
    const oldPositionX = this.position.x;
    const oldPositionY = this.position.y;
    
    // Update position in-place
    this.position.x += this.velocity.x * (deltaTime / 1000);
    this.position.y += this.velocity.y * (deltaTime / 1000);
    
    // OPTIMIZATION: Update spatial bounds when position changes
    this.updateBounds();
    
    // Check collision with trees using simplified circle-to-circle physics
    if (trees && trees.length > 0) {
      const tankRadius = 20; // Tank collision radius (reduced to match new collision box)
    
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
            
            // OPTIMIZATION: Use object pool for tree impact vector
            const impactVector = memoryManager.getVector(-this.velocity.x, -this.velocity.y);
            const impactForce = velocityTowardTree * 0.3;
            tree.impact(impactVector, impactForce);
            memoryManager.release(impactVector);
            
            // Make trees swing quicker (not further) for a short time on tank collision
            if (typeof tree.boostSwingFrequency === 'function') {
              tree.boostSwingFrequency(1200, 1.8);
            }
            
            // Significant collision detected but not logged for performance
          }
        }
      }
    }
    
    // Calculate distance moved and consume gasoline (in-place calculation)
    const dx = this.position.x - oldPositionX;
    const dy = this.position.y - oldPositionY;
    const distanceMoved = Math.sqrt(dx * dx + dy * dy);
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
    // Reduced from 0.1 to 0.06 for more realistic tank turning feel
    const rotationSpeed = this.attributes.rotation * 0.06;
    const maxRotationThisFrame = rotationSpeed * (deltaTime / 1000);
    
    // Only rotate if the angle difference is significant enough
    if (Math.abs(angleDiff) > 0.005) { // Reduced threshold for smoother rotation
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
    
    // OPTIMIZATION: Use object pool for direction vector
    const direction = memoryManager.getVector(Math.cos(this.angle), Math.sin(this.angle));
    
    // OPTIMIZATION: Calculate shell velocity in-place
    const shellVelocity = memoryManager.getVector(direction.x * shellSpeed, direction.y * shellSpeed);

    // OPTIMIZATION: Calculate shell position in-place
    const shellOffset = 20; // Reduced distance to be closer to tank barrel
    const shellPosition = memoryManager.getVector(
      this.position.x + direction.x * shellOffset,
      this.position.y + direction.y * shellOffset
    );
    
    // OPTIMIZATION: Use object pooling for shell creation (eliminates GC spikes)
    const shell = memoryManager.getShell(
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

    // OPTIMIZATION: Release temporary vectors back to pool
    memoryManager.release(direction);
    memoryManager.release(shellVelocity);
    memoryManager.release(shellPosition);

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

  // Get oriented bounding box for precise collision detection
  getOrientedBoundingBox() {
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    
    // Calculate the four corners of the tank relative to its center
    const halfWidth = this.collisionWidth / 2;
    const halfHeight = this.collisionHeight / 2;
    
    // Define corners relative to tank center (before rotation)
    const corners = [
      { x: -halfWidth, y: -halfHeight },  // Top-left
      { x: halfWidth, y: -halfHeight },   // Top-right
      { x: halfWidth, y: halfHeight },    // Bottom-right
      { x: -halfWidth, y: halfHeight }    // Bottom-left
    ];
    
    // Rotate and translate corners to world coordinates
    const rotatedCorners = corners.map(corner => ({
      x: this.position.x + corner.x * cos - corner.y * sin,
      y: this.position.y + corner.x * sin + corner.y * cos
    }));
    
    return {
      center: this.position,
      corners: rotatedCorners,
      width: this.collisionWidth,
      height: this.collisionHeight,
      angle: this.angle
    };
  }

  checkCollision(box1, box2) {
    return box1.x < box2.x + box2.width &&
           box1.x + box1.width > box2.x &&
           box1.y < box2.y + box2.height &&
           box1.y + box1.height > box2.y;
  }

  // Check if a point is inside the oriented bounding box
  isPointInOBB(point) {
    const obb = this.getOrientedBoundingBox();
    const cos = Math.cos(-obb.angle); // Negative angle to rotate point back
    const sin = Math.sin(-obb.angle);
    
    // Translate point to tank's local coordinate system
    const localX = (point.x - obb.center.x) * cos - (point.y - obb.center.y) * sin;
    const localY = (point.x - obb.center.x) * sin + (point.y - obb.center.y) * cos;
    
    // Check if point is within the local bounds
    const halfWidth = obb.width / 2;
    const halfHeight = obb.height / 2;
    
    return Math.abs(localX) <= halfWidth && Math.abs(localY) <= halfHeight;
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
    
    // OPTIMIZATION: Spatial partitioning bounds (updated on position change)
    this.bounds = null;
    this.updateBounds();
  }

  update(deltaTime) {
    // OPTIMIZATION: Update position in-place instead of creating new Vector2 objects
    const deltaTimeSeconds = deltaTime / 1000;
    this.position.x += this.velocity.x * deltaTimeSeconds;
    this.position.y += this.velocity.y * deltaTimeSeconds;
    
    // Removed lifetime decrement since shells should persist until collision or going off-screen
    
    // OPTIMIZATION: Update spatial bounds when position changes
    this.updateBounds();
  }

  // OPTIMIZATION: Update spatial bounds for collision detection
  updateBounds() {
    const size = 5; // Shell size
    this.bounds = {
      x: this.position.x - size / 2,
      y: this.position.y - size / 2,
      width: size,
      height: size
    };
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
    
    // OPTIMIZATION: Spatial partitioning bounds (static for upgrades)
    this.bounds = null;
    this.updateBounds();
  }

  // OPTIMIZATION: Update spatial bounds for collision detection
  updateBounds() {
    const size = 22.5; // Upgrade size
    this.bounds = {
      x: this.position.x - size / 2,
      y: this.position.y - size / 2,
      width: size,
      height: size
    };
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
    
    // OPTIMIZATION: Spatial partitioning bounds (static for trees)
    this.bounds = null;
    this.updateBounds();
  }

  // Called when tree is hit by something (shell, tank, etc.)
  impact(impactVelocity, impactForce = null) {
    // Calculate impact direction and magnitude (works with both Vector2 and plain objects)
    const impactSpeed = Math.sqrt(impactVelocity.x * impactVelocity.x + impactVelocity.y * impactVelocity.y);
    
    if (impactSpeed < 1) return; // Ignore very small impacts
    
    // OPTIMIZATION: Use object pool for normalized impact direction
    const impactDirection = memoryManager.getVector(0, 0);
    if (impactSpeed > 0) {
      impactDirection.x = impactVelocity.x / impactSpeed;
      impactDirection.y = impactVelocity.y / impactSpeed;
    }
    
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
    
    // OPTIMIZATION: Release pooled vector
    memoryManager.release(impactDirection);
  }

  // OPTIMIZATION: Update spatial bounds for collision detection
  updateBounds() {
    const trunkSize = this.size / 8; // Tree trunk collision size
    this.bounds = {
      x: this.position.x - trunkSize / 2,
      y: this.position.y - this.size / 2 - trunkSize / 2,
      width: trunkSize,
      height: trunkSize
    };
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