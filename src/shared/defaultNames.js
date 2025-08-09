// Default names for each team
const defaultNames = {
    NATO: [
        'Blastridge',
        'Ironhowl',
        'Killthorn',
        'Steelgrave',
        'Warcaster',
        'Shockhammer',
        'Gorefield',
        'Brassknox',
        'Deathridge',
        'Thundersmoke'
    ],
    CSTO: [
        'Krushkinov',
        'Bludov',
        'Tankoslav',
        'Deathrovich',
        'Volgatov',
        'Smashenkov',
        'Boomarev',
        'Goresky',
        'Razornin',
        'Shrapnelov'
    ],
    PLA: [
        'Blastong',
        'Warchao',
        'Killwei',
        'Zhonboom',
        'Pengstrike',
        'Tankyu',
        'Shankai',
        'Gunchi',
        'Nukewei',
        'Missao'
    ]
};

// Military ranks
const ranks = [
    'Pvt',
    'Cpl',
    'Sgt',
    'Lt',
    'Capt',
    'Maj'
];

// Export for ES modules
export { defaultNames, ranks };

// Also make available globally for script tags
if (typeof window !== 'undefined') {
    window.defaultNames = defaultNames;
    window.ranks = ranks;
} 