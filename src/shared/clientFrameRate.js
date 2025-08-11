// Client-Side Frame Rate Optimization for Silky Smooth 60fps
// Caps browser render loop at 60 FPS and syncs with server updates

export class ClientFrameRateManager {
  constructor(targetFPS = 60) {
    this.targetFPS = targetFPS;
    this.targetFrameTime = 1000 / targetFPS; // 16.67ms for 60fps
    
    // Frame timing
    this.lastFrameTime = 0;
    this.frameCount = 0;
    this.lastFPSUpdate = 0;
    
    // Interpolation state
    this.previousGameState = null;
    this.currentGameState = null;
    this.interpolationAlpha = 0;
    
    // Performance tracking
    this.stats = {
      fps: 0,
      frameTime: 0,
      averageFrameTime: 0,
      frameDrops: 0,
      targetFPS: targetFPS,
      frameRateAccuracy: 0,
      interpolationQuality: 0,
      serverSyncLatency: 0
    };
    
    // Frame rate capping
    this.isRunning = false;
    this.animationId = null;
    this.frameRateCap = true;
    
    // Interpolation settings
    this.interpolationEnabled = true;
    this.smoothingFactor = 0.3;
    this.maxInterpolationSteps = 3;
  }

  // Start the client frame rate manager
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.gameLoop();
  }

  // Stop the client frame rate manager
  stop() {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  // Main client game loop with 60 FPS cap
  gameLoop(currentTime = performance.now()) {
    if (!this.isRunning) return;
    
    // Calculate frame timing
    const deltaTime = currentTime - this.lastFrameTime;
    this.lastFrameTime = currentTime;
    
    // Frame rate capping - only render if enough time has passed
    if (this.frameRateCap && deltaTime < this.targetFrameTime) {
      // Wait until next frame time
      const waitTime = this.targetFrameTime - deltaTime;
      this.animationId = setTimeout(() => this.gameLoop(performance.now()), waitTime);
      return;
    }
    
    // Update frame statistics
    this.frameCount++;
    this.stats.frameTime = deltaTime;
    
    // Update average frame time
    if (this.frameCount > 0) {
      this.stats.averageFrameTime = 
        (this.stats.averageFrameTime * (this.frameCount - 1) + deltaTime) / 
        this.frameCount;
    }
    
    // Check for frame drops
    if (deltaTime > this.targetFrameTime * 1.5) {
      this.stats.frameDrops++;
    }
    
    // Update FPS counter every second
    if (currentTime - this.lastFPSUpdate >= 1000) {
      this.stats.fps = this.frameCount;
      this.stats.frameRateAccuracy = Math.abs(this.stats.fps - this.targetFPS);
      this.frameCount = 0;
      this.lastFPSUpdate = currentTime;
    }
    
    // Calculate interpolation alpha for smooth movement
    if (this.interpolationEnabled && this.previousGameState && this.currentGameState) {
      this.interpolationAlpha = (deltaTime / this.targetFrameTime) % 1;
      this.interpolationAlpha = Math.min(this.interpolationAlpha, 1);
    }
    
    // Continue the loop
    this.animationId = requestAnimationFrame(this.gameLoop.bind(this));
  }

  // Update game state from server (called when receiving server updates)
  updateGameState(newGameState, serverTimestamp) {
    if (!newGameState) return;
    
    // Store previous state for interpolation
    this.previousGameState = this.currentGameState;
    this.currentGameState = newGameState;
    
    // Calculate server sync latency
    const clientTime = Date.now();
    this.stats.serverSyncLatency = clientTime - serverTimestamp;
    
    // Update interpolation quality
    if (this.previousGameState && this.currentGameState) {
      this.updateInterpolationQuality();
    }
  }

  // Get interpolated game state for smooth rendering
  getInterpolatedGameState() {
    if (!this.interpolationEnabled || !this.previousGameState || !this.currentGameState) {
      return this.currentGameState || this.previousGameState;
    }
    
    // Create interpolated state
    const interpolatedState = this.interpolateGameState(
      this.previousGameState,
      this.currentGameState,
      this.interpolationAlpha
    );
    
    return interpolatedState;
  }

  // Interpolate between two game states
  interpolateGameState(previous, current, alpha) {
    if (!previous || !current) return current;
    
    const interpolated = { ...current };
    
    // Interpolate tank positions and angles
    if (interpolated.tanks && previous.tanks) {
      for (const [id, currentTank] of Object.entries(interpolated.tanks)) {
        const previousTank = previous.tanks[id];
        if (previousTank && currentTank.position && previousTank.position) {
          // Smooth position interpolation
          interpolated.tanks[id].position = {
            x: this.lerp(previousTank.position.x, currentTank.position.x, alpha),
            y: this.lerp(previousTank.position.y, currentTank.position.y, alpha)
          };
          
          // Smooth angle interpolation (handle angle wrapping)
          if (currentTank.angle !== undefined && previousTank.angle !== undefined) {
            interpolated.tanks[id].angle = this.lerpAngle(
              previousTank.angle, 
              currentTank.angle, 
              alpha
            );
          }
        }
      }
    }
    
    // Interpolate shell positions
    if (interpolated.shells && previous.shells) {
      interpolated.shells = interpolated.shells.map((shell, index) => {
        const prevShell = previous.shells[index];
        if (prevShell && shell.position && prevShell.position) {
          return {
            ...shell,
            position: {
              x: this.lerp(prevShell.position.x, shell.position.x, alpha),
              y: this.lerp(prevShell.position.y, shell.position.y, alpha)
            }
          };
        }
        return shell;
      });
    }
    
    return interpolated;
  }

  // Linear interpolation helper
  lerp(start, end, alpha) {
    return start + (end - start) * alpha;
  }

  // Angle interpolation helper (handles wrapping)
  lerpAngle(start, end, alpha) {
    let diff = end - start;
    
    // Handle angle wrapping
    if (diff > Math.PI) diff -= 2 * Math.PI;
    if (diff < -Math.PI) diff += 2 * Math.PI;
    
    return start + diff * alpha;
  }

  // Update interpolation quality metrics
  updateInterpolationQuality() {
    if (!this.previousGameState || !this.currentGameState) return;
    
    let totalInterpolations = 0;
    let successfulInterpolations = 0;
    
    // Check tank interpolation quality
    if (this.currentGameState.tanks && this.previousGameState.tanks) {
      for (const [id, currentTank] of Object.entries(this.currentGameState.tanks)) {
        const previousTank = this.previousGameState.tanks[id];
        if (previousTank && currentTank.position && previousTank.position) {
          totalInterpolations++;
          
          // Check if interpolation would be smooth
          const positionDiff = Math.sqrt(
            Math.pow(currentTank.position.x - previousTank.position.x, 2) +
            Math.pow(currentTank.position.y - previousTank.position.y, 2)
          );
          
          if (positionDiff < 50) { // 50px threshold for smooth interpolation
            successfulInterpolations++;
          }
        }
      }
    }
    
    // Calculate interpolation quality percentage
    if (totalInterpolations > 0) {
      this.stats.interpolationQuality = 
        (successfulInterpolations / totalInterpolations) * 100;
    }
  }

  // Enable/disable frame rate capping
  setFrameRateCap(enabled) {
    this.frameRateCap = enabled;
  }

  // Set target FPS
  setTargetFPS(fps) {
    this.targetFPS = fps;
    this.targetFrameTime = 1000 / fps;
    this.stats.targetFPS = fps;
  }

  // Enable/disable interpolation
  setInterpolationEnabled(enabled) {
    this.interpolationEnabled = enabled;
  }

  // Get current interpolation alpha
  getInterpolationAlpha() {
    return this.interpolationAlpha;
  }

  // Get frame rate statistics
  getStats() {
    return {
      ...this.stats,
      frameRateAccuracy: this.stats.frameRateAccuracy.toFixed(1),
      interpolationQuality: this.stats.interpolationQuality.toFixed(1) + '%',
      averageFrameTime: this.stats.averageFrameTime.toFixed(2) + 'ms',
      targetFrameTime: this.targetFrameTime.toFixed(2) + 'ms'
    };
  }

  // Reset statistics
  resetStats() {
    this.stats = {
      fps: 0,
      frameTime: 0,
      averageFrameTime: 0,
      frameDrops: 0,
      targetFPS: this.targetFPS,
      frameRateAccuracy: 0,
      interpolationQuality: 0,
      serverSyncLatency: 0
    };
    
    this.frameCount = 0;
    this.lastFPSUpdate = 0;
  }
}

// Global client frame rate manager instance
export const clientFrameRateManager = new ClientFrameRateManager();
