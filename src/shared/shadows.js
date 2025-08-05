// Centralized shadow configuration for consistent shadow effects across game objects
const SHADOW_CONFIG = {
  // Standard shadow settings used by trees and other objects
  DEFAULT: {
    color: 'black',
    blur: 8,
    offsetX: 4,
    offsetY: 4,
    alpha: 0.5,
    compositeOperation: 'multiply'
  },
  
  // Lighter shadow for smaller objects like upgrades
  LIGHT: {
    color: 'black',
    blur: 4,
    offsetX: 2,
    offsetY: 2,
    alpha: 0.3,
    compositeOperation: 'multiply'
  },
  
  // Stronger shadow for important objects
  STRONG: {
    color: 'black',
    blur: 12,
    offsetX: 6,
    offsetY: 6,
    alpha: 0.7,
    compositeOperation: 'multiply'
  }
};

// Helper function to apply shadow settings to a canvas context
function applyShadow(ctx, shadowType = 'DEFAULT') {
  const shadow = SHADOW_CONFIG[shadowType];
  if (!shadow) {
    console.warn(`Unknown shadow type: ${shadowType}`);
    return;
  }
  
  ctx.globalAlpha = shadow.alpha;
  ctx.globalCompositeOperation = shadow.compositeOperation;
  ctx.shadowColor = shadow.color;
  ctx.shadowBlur = shadow.blur;
  ctx.shadowOffsetX = shadow.offsetX;
  ctx.shadowOffsetY = shadow.offsetY;
}

// Export for Node.js (server-side)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SHADOW_CONFIG, applyShadow };
}

// Make available globally for browser
if (typeof window !== 'undefined') {
  window.SHADOW_CONFIG = SHADOW_CONFIG;
  window.applyShadow = applyShadow;
}