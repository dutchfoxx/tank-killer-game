// Tank camouflage textures
const tankCamos = {
    'dazzle': {
        name: 'Dazzle',
        texture: 'textures/tank-camo/dazzle.png',
        opacity: 1,
        scale: 1,
        blendMode: 'normal',
        overrides: {
            'desert': {
                blendMode: 'difference'
            },
            'arctic': {
                blendMode: 'difference'
            }
        }
    },
    'pixel': {
        name: 'Pixel',
        texture: 'textures/tank-camo/pixel.png',
        opacity: 1,
        scale: 1,
        blendMode: 'color-dodge',
        overrides: {
            'arctic': {
                blendMode: 'difference'
            },
            'desert': {
                blendMode: 'difference'
            },
            'forest': {
                blendMode: 'hard-light'
            }
        }
    },
    'geometric': {
        name: 'Geometric',
        texture: 'textures/tank-camo/geometric.png',
        opacity: 1,
        scale: 1,
        blendMode: 'multiply',
        overrides: {
            'forest': {
                blendMode: 'exclusion'
            }
        }
    },
    'fractal': {
        name: 'Fractal',
        texture: 'textures/tank-camo/fractal.png',
        opacity: 1,
        scale: 1,
        blendMode: 'multiply'
    },
    'topographic': {
        name: 'Topographic',
        texture: 'textures/tank-camo/topographic.png',
        opacity: 1,
        scale: 3,
        blendMode: 'multiply'
    },
    'woodlands': {
        name: 'Woodlands',
        texture: 'textures/tank-camo/woodlands.png',
        opacity: 0.5,
        scale: 1,
        blendMode: 'color-dodge',
        overrides: {
            'desert': {
                blendMode: 'exclusion'
            },
            'arctic': {
                blendMode: 'difference'
            }
        }
    }
};

// Export for Node.js (server-side)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { tankCamos };
} 