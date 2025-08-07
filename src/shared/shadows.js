// Object height constants for shadow scaling
const OBJECT_HEIGHTS = {
  TANK: 1.5,
  UPGRADE: 1,
  TREE: 3
};

// Centralized shadow configuration for consistent shadow effects across game objects
const SHADOW_CONFIG = {
  // Contour shadow: smaller offset, high alpha, low blur - for crisp edge definition
  CONTOUR: {
    color: 'rgba(0, 0, 0, 0.8)', // Use rgba instead of alpha property
    blur: 2,
    offsetX: 1,
    offsetY: 1,
    compositeOperation: 'multiply'
  },
  
  // Ambient shadow: larger offset, lower alpha, high blur - for depth and atmosphere
  AMBIENT: {
    color: 'rgba(0, 0, 0, 0.5)', // Use rgba instead of alpha property
    blur: 3,
    offsetX: 3,
    offsetY: 3,
    compositeOperation: 'multiply'
  }
};

// Helper function to apply contour shadow to a canvas context
function applyContourShadow(ctx, objectHeight = 1) {
  // Apply contour shadow (crisp edge definition)
  const contour = SHADOW_CONFIG.CONTOUR;
  ctx.globalAlpha = 1.0; // Keep full opacity for the tank
  ctx.globalCompositeOperation = contour.compositeOperation;
  ctx.shadowColor = contour.color; // Use rgba color with built-in alpha
  ctx.shadowBlur = contour.blur;
  ctx.shadowOffsetX = contour.offsetX;
  ctx.shadowOffsetY = contour.offsetY;
}

// Helper function to apply ambient shadow to a canvas context
function applyAmbientShadow(ctx, objectHeight = 1) {
  // Apply ambient shadow (depth and atmosphere) - offset scaled by object height
  const ambient = SHADOW_CONFIG.AMBIENT;
  ctx.globalAlpha = 1.0; // Keep full opacity for the tank
  ctx.globalCompositeOperation = ambient.compositeOperation;
  ctx.shadowColor = ambient.color; // Use rgba color with built-in alpha
  
  // Only scale offset by object height (blur should remain constant)
  ctx.shadowBlur = ambient.blur; // Blur is atmospheric, not affected by object height
  ctx.shadowOffsetX = ambient.offsetX * objectHeight; // Taller objects cast shadows further away
  ctx.shadowOffsetY = ambient.offsetY * objectHeight; // Taller objects cast shadows further away
}

// Helper function to apply both shadows in sequence
// This function should be called before drawing an object, then the object should be drawn twice
function applyContourAndAmbientShadows(ctx, objectHeight = 1) {
  // Apply contour shadow first (this will be used for the first draw)
  applyContourShadow(ctx, objectHeight);
}

// Helper function to apply ambient shadow after contour shadow
// This should be called before drawing the object a second time
function applyAmbientShadowAfterContour(ctx, objectHeight = 1) {
  // Apply ambient shadow (depth and atmosphere)
  applyAmbientShadow(ctx, objectHeight);
}

// Helper function to reset shadow settings
function resetShadows(ctx) {
  ctx.globalAlpha = 1.0;
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

// Legacy function for backward compatibility (now applies dual shadows)
function applyShadow(ctx, shadowType = 'DEFAULT', objectHeight = 1) {
  // Always apply dual shadows regardless of shadowType parameter
  applyContourAndAmbientShadows(ctx, objectHeight);
}

// Legacy function name for backward compatibility
function applyDualShadows(ctx, objectHeight = 1) {
  applyContourAndAmbientShadows(ctx, objectHeight);
}

// Export for Node.js (server-side)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 
    OBJECT_HEIGHTS,
    SHADOW_CONFIG, 
    applyShadow,
    applyDualShadows,
    applyContourShadow,
    applyAmbientShadow,
    applyContourAndAmbientShadows,
    applyAmbientShadowAfterContour,
    resetShadows
  };
}

// Make available globally for browser
if (typeof window !== 'undefined') {
  window.OBJECT_HEIGHTS = OBJECT_HEIGHTS;
  window.SHADOW_CONFIG = SHADOW_CONFIG;
  window.applyShadow = applyShadow;
  window.applyDualShadows = applyDualShadows;
  window.applyContourShadow = applyContourShadow;
  window.applyAmbientShadow = applyAmbientShadow;
  window.applyContourAndAmbientShadows = applyContourAndAmbientShadows;
  window.applyAmbientShadowAfterContour = applyAmbientShadowAfterContour;
  window.resetShadows = resetShadows;
}