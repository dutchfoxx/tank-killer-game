// Tank camouflage textures
const tankCamos = {
    'none': {
        name: 'None',
        texture: null,
        opacity: 0,
        scale: 1,
        blendMode: 'normal'
    },
    'pixel': {
        name: 'Pixel',
        texture: 'textures/camo/base_pixel.png',
        opacity: 0.8,
        scale: 1,
        blendMode: 'auto'
    },
    'woodlands': {
        name: 'Woodlands',
        texture: 'textures/camo/base_woodlands.png',
        opacity: 0.8,
        scale: 1,
        blendMode: 'auto'
    },
    'multicam': {
        name: 'Multicam',
        texture: 'textures/camo/base_multicam.png',
        opacity: 0.8,
        scale: 1,
        blendMode: 'auto'
    },
    'modern': {
        name: 'Modern',
        texture: 'textures/camo/base_modern.png',
        opacity: 0.8,
        scale: 1,
        blendMode: 'auto'
    },
    'flecktarn': {
        name: 'Flecktarn',
        texture: 'textures/camo/base_flecktarn.png',
        opacity: 0.8,
        scale: 1,
        blendMode: 'auto'
    },
    'lizard': {
        name: 'Lizard',
        texture: 'textures/camo/base_lizard.png',
        opacity: 0.8,
        scale: 1,
        blendMode: 'auto'
    },
    'jigsaw': {
        name: 'Jigsaw',
        texture: 'textures/camo/base_jigsaw.png',
        opacity: 0.8,
        scale: 1,
        blendMode: 'auto'
    },
    'geometric': {
        name: 'Geometric',
        texture: 'textures/camo/base_geometric.png',
        opacity: 0.8,
        scale: 1,
        blendMode: 'auto'
    }
};

// Export for Node.js (server-side)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { tankCamos };
} 