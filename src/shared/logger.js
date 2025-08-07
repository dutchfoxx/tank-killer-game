// Performance-optimized logging utility
class Logger {
  constructor() {
    this.enabled = false; // Disable by default for production
    this.categories = {
      tank: false,
      ai: false,
      collision: false,
      damage: false,
      shooting: false,
      tree: false,
      connection: true, // Keep connection logs enabled
      gameState: false
    };
  }

  log(category, ...args) {
    if (this.enabled && this.categories[category]) {
      console.log(...args);
    }
  }

  enable(category = null) {
    if (category) {
      this.categories[category] = true;
    } else {
      this.enabled = true;
    }
  }

  disable(category = null) {
    if (category) {
      this.categories[category] = false;
    } else {
      this.enabled = false;
    }
  }

  // Convenience methods for specific categories
  tank(...args) { this.log('tank', ...args); }
  ai(...args) { this.log('ai', ...args); }
  collision(...args) { this.log('collision', ...args); }
  damage(...args) { this.log('damage', ...args); }
  shooting(...args) { this.log('shooting', ...args); }
  tree(...args) { this.log('tree', ...args); }
  connection(...args) { this.log('connection', ...args); }
  gameState(...args) { this.log('gameState', ...args); }
}

// Export singleton instance
export const logger = new Logger();

// Enable specific categories for debugging if needed
// logger.enable('connection'); // Keep connection logs
// logger.enable('tank'); // Enable tank logs for debugging
// logger.enable('shooting'); // Enable shooting logs for debugging 