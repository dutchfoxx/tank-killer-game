// Centralized shadow configuration for consistent shadow effects across game objects
const SHADOW_CONFIG = {
  // Contour shadow: smaller offset, high alpha, low blur - for crisp edge definition
  CONTOUR: {
    color: 'black',
    blur: 2,
    offsetX: 1,
    offsetY: 1,
    alpha: 0.8,
    compositeOperation: 'multiply'
  },
  
  // Ambient shadow: larger offset, lower alpha, high blur - for depth and atmosphere
  AMBIENT: {
    color: 'black',
    blur: 5,
    offsetX: 6,
    offsetY: 6,
    alpha: 0.5,
    compositeOperation: 'multiply'
  }
};

// Helper function to apply contour shadow to a canvas context
function applyContourShadow(ctx) {
  // Apply contour shadow (crisp edge definition)
  const contour = SHADOW_CONFIG.CONTOUR;
  ctx.globalAlpha = contour.alpha;
  ctx.globalCompositeOperation = contour.compositeOperation;
  ctx.shadowColor = contour.color;
  ctx.shadowBlur = contour.blur;
  ctx.shadowOffsetX = contour.offsetX;
  ctx.shadowOffsetY = contour.offsetY;
}

// Helper function to apply ambient shadow to a canvas context
function applyAmbientShadow(ctx) {
  // Apply ambient shadow (depth and atmosphere)
  const ambient = SHADOW_CONFIG.AMBIENT;
  ctx.globalAlpha = ambient.alpha;
  ctx.globalCompositeOperation = ambient.compositeOperation;
  ctx.shadowColor = ambient.color;
  ctx.shadowBlur = ambient.blur;
  ctx.shadowOffsetX = ambient.offsetX;
  ctx.shadowOffsetY = ambient.offsetY;
}

// Helper function to apply both shadows in sequence
// This function should be called before drawing an object, then the object should be drawn twice
function applyContourAndAmbientShadows(ctx) {
  // Apply contour shadow first (this will be used for the first draw)
  applyContourShadow(ctx);
}

// Helper function to apply ambient shadow after contour shadow
// This should be called before drawing the object a second time
function applyAmbientShadowAfterContour(ctx) {
  // Apply ambient shadow (depth and atmosphere)
  applyAmbientShadow(ctx);
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
function applyShadow(ctx, shadowType = 'DEFAULT') {
  // Always apply dual shadows regardless of shadowType parameter
  applyContourAndAmbientShadows(ctx);
}

// Legacy function name for backward compatibility
function applyDualShadows(ctx) {
  applyContourAndAmbientShadows(ctx);
}

// Export for Node.js (server-side)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 
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
  window.SHADOW_CONFIG = SHADOW_CONFIG;
  window.applyShadow = applyShadow;
  window.applyDualShadows = applyDualShadows;
  window.applyContourShadow = applyContourShadow;
  window.applyAmbientShadow = applyAmbientShadow;
  window.applyContourAndAmbientShadows = applyContourAndAmbientShadows;
  window.applyAmbientShadowAfterContour = applyAmbientShadowAfterContour;
  window.resetShadows = resetShadows;
}