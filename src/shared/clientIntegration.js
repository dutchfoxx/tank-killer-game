// Client Integration Example for Frame Rate Optimization
// This shows how to integrate the client frame rate manager in the browser

import { clientFrameRateManager } from './clientFrameRate.js';

// Example of how to integrate with your existing game client
export class ClientGameIntegration {
  constructor() {
    this.frameRateManager = clientFrameRateManager;
    this.lastServerUpdate = null;
    this.renderLoop = null;
    
    // Start the frame rate manager
    this.frameRateManager.start();
    
    console.log('🎮 Client Frame Rate Manager Started - Targeting 60 FPS');
  }

  // Called when receiving server updates
  onServerUpdate(gameState, serverTimestamp) {
    // Update the frame rate manager with new server state
    this.frameRateManager.updateGameState(gameState, serverTimestamp);
    this.lastServerUpdate = Date.now();
    
    console.log(`📡 Server Update Received - Latency: ${this.frameRateManager.stats.serverSyncLatency}ms`);
  }

  // Start the client render loop
  startRenderLoop() {
    if (this.renderLoop) return;
    
    // OPTIMIZATION: Use requestAnimationFrame instead of setInterval for proper frame rate sync
    this.renderLoop = true;
    this.animate();
    
    console.log('🎨 Client Render Loop Started with requestAnimationFrame');
  }

  // Stop the client render loop
  stopRenderLoop() {
    if (this.renderLoop) {
      this.renderLoop = false;
    }
  }

  // OPTIMIZATION: Animation loop using requestAnimationFrame
  animate() {
    if (!this.renderLoop) return;
    
    this.render();
    requestAnimationFrame(() => this.animate());
  }

  // Main render function - called at 60 FPS
  render() {
    // Get interpolated game state for smooth rendering
    const interpolatedState = this.frameRateManager.getInterpolatedGameState();
    
    if (interpolatedState) {
      // Render your game here using the interpolated state
      this.renderGame(interpolatedState);
      
      // Update FPS counter display
      this.updateFPSDisplay();
    }
  }

  // Render the game (replace with your actual rendering code)
  renderGame(gameState) {
    // This is where you'd render tanks, shells, etc.
    // The gameState is now interpolated for smooth 60 FPS rendering
    
    if (gameState.tanks) {
      for (const [id, tank] of Object.entries(gameState.tanks)) {
        // Render tank with interpolated position and angle
        this.renderTank(tank);
      }
    }
    
    if (gameState.shells) {
      for (const shell of gameState.shells) {
        // Render shell with interpolated position
        this.renderShell(shell);
      }
    }
  }

  // Example tank rendering (replace with your actual rendering)
  renderTank(tank) {
    // Use tank.position.x, tank.position.y, tank.angle
    // These are now interpolated for smooth movement
    console.log(`🎯 Rendering Tank ${tank.id} at (${tank.position.x.toFixed(1)}, ${tank.position.y.toFixed(1)})`);
  }

  // Example shell rendering (replace with your actual rendering)
  renderShell(shell) {
    // Use shell.position.x, shell.position.y
    // These are now interpolated for smooth movement
    console.log(`💥 Rendering Shell ${shell.id} at (${shell.position.x.toFixed(1)}, ${shell.position.y.toFixed(1)})`);
  }

  // Update FPS display (replace with your actual FPS counter)
  updateFPSDisplay() {
    const stats = this.frameRateManager.getStats();
    
    // Update your FPS counter in the bottom right
    // This should now show 60 FPS instead of 120 FPS
    console.log(`📊 Client FPS: ${stats.fps}/${stats.targetFPS} | Frame Time: ${stats.averageFrameTime} | Quality: ${stats.interpolationQuality}`);
  }

  // Get current frame rate statistics
  getFrameRateStats() {
    return this.frameRateManager.getStats();
  }

  // Enable/disable frame rate capping
  setFrameRateCap(enabled) {
    this.frameRateManager.setFrameRateCap(enabled);
    console.log(`🎛️ Frame Rate Cap: ${enabled ? 'ON' : 'OFF'}`);
  }

  // Set target FPS
  setTargetFPS(fps) {
    this.frameRateManager.setTargetFPS(fps);
    console.log(`🎯 Target FPS set to: ${fps}`);
  }

  // Enable/disable interpolation
  setInterpolationEnabled(enabled) {
    this.frameRateManager.setInterpolationEnabled(enabled);
    console.log(`🔄 Interpolation: ${enabled ? 'ON' : 'OFF'}`);
  }

  // Cleanup
  destroy() {
    this.stopRenderLoop();
    this.frameRateManager.stop();
    console.log('🧹 Client Game Integration Cleaned Up');
  }
}

// Example usage:
// const clientGame = new ClientGameIntegration();
// clientGame.startRenderLoop();
// 
// // When receiving server updates:
// clientGame.onServerUpdate(gameState, serverTimestamp);
// 
// // To change settings:
// clientGame.setFrameRateCap(true);  // Cap at 60 FPS
// clientGame.setTargetFPS(60);       // Target 60 FPS
// clientGame.setInterpolationEnabled(true); // Smooth movement
