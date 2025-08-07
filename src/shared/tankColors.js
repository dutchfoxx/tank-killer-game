// Tank base colors
const tankColors = {
    'forest': {
        label: 'Forest',
        hex: '#1f2e23'
    },
    'desert': {
        label: 'Desert',
        hex: '#D4A574'
    },
    'marines': {
        label: 'Marines',
        hex: '#333551'
    },
    'metal': {
        label: 'Metal',
        hex: '#6a6a6a'
    },
    'tradition': {
        label: 'Tradition',
        hex: '#813D30'
    },
    'plains': {
        label: 'Plains',
        hex: '#50654D'
    },
    'arctic': {
        label: 'Arctic',
        hex: '#cfc4c4'
    },
    'specops': {
        label: 'SpecOps',
        hex: '#191A1C'
    }
};

// Helper function to get color name from hex
function getColorNameFromHex(hex) {
    const color = Object.values(tankColors).find(c => c.hex === hex);
    return color ? color.label : null;
}

// Helper function to get hex from color name
function getHexFromColorName(name) {
    const color = Object.values(tankColors).find(c => c.label === name);
    return color ? color.hex : null;
}

// Helper function to get color key from hex
function getColorKeyFromHex(hex) {
    const entry = Object.entries(tankColors).find(([key, color]) => color.hex === hex);
    return entry ? entry[0] : null;
}

// Export for CommonJS (Node.js and browser compatibility)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { tankColors, getColorNameFromHex, getHexFromColorName, getColorKeyFromHex };
}

// Export for browser globals (for script tag loading)
if (typeof window !== 'undefined') {
    window.tankColors = tankColors;
    window.getColorNameFromHex = getColorNameFromHex;
    window.getHexFromColorName = getHexFromColorName;
    window.getColorKeyFromHex = getColorKeyFromHex;
} 