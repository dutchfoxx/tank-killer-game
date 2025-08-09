// Game Constants
export const GAME_TICK_RATE = 60; // 60 FPS
export const CONTROLLER_UPDATE_RATE = 100; // 100ms intervals for controller updates

// Tank Colors
export const TANK_COLORS = {
  COLOR_1: '#1f2e23',
  COLOR_2: '#d9d188', 
  COLOR_3: '#736246',
  COLOR_4: '#848081',
  COLOR_5: '#813D30',
  COLOR_6: '#50654D'
};

// Team Colors
export const TEAMS = {
  NATO: { name: 'NATO', color: '#0033A0' },
  CSTO: { name: 'CSTO', color: '#FFC700' },
  PLA: { name: 'PLA', color: '#DE2910' }
};

// Tank Attributes (max, min) - CENTRALIZED VALUES
export const TANK_ATTRIBUTES = {
  HEALTH: { max: 100, min: 0 },
  SPEED: { max: 50, min: 25 }, // Increased min speed for better game balance
  GASOLINE: { max: 100, min: 0 },
  ROTATION: { max: 30, min: 5 }, // Fixed: max should be 30, not 50
  AMMUNITION: { max: 14, min: 0 },
  KINETICS: { max: 300, min: 50 }
};

// Game Parameters
export const GAME_PARAMS = {
  RESPAWN_TIME: 5000, // 5 seconds
  RELOAD_TIME: 1000, // 1 second
  ACCELERATION: 0.1,
  BULLET_LIFETIME: 1000, // 1 second
  DAMAGE_FEEDBACK_DURATION: 300, // 300ms
  GASOLINE_SPEED_PENALTY: 0.5, // Speed divided by 2 when gasoline is 0
  GASOLINE_PER_UNIT: 0.01 // Gasoline consumed per distance unit while moving
};

// Damage Parameters
export const DAMAGE_PARAMS = {
  HEALTH: 1,
  SPEED: 2,
  ROTATION: 4,
  KINETICS: 15,
  GASOLINE: 5
};

// Upgrade Types
export const UPGRADE_TYPES = {
  SPEED: { symbol: 'S', value: 20, count: 2 },
  GASOLINE: { symbol: 'G', value: 80, count: 2 },
  ROTATION: { symbol: 'R', value: 20, count: 2 },
  AMMUNITION: { symbol: 'A', value: 7, count: 2 },
  KINETICS: { symbol: 'K', value: 30, count: 2 },
  HEALTH: { symbol: 'H', value: 10, count: 0 }
};

// Visual Constants
export const COLORS = {
  BACKGROUND: '#2F2F2F',
  BATTLEFIELD_GROUND: '#55492f',
  TREES: '#5e6936',
  ACTION_BUTTON: '#b83400',
  DAMAGE_FEEDBACK: '#b83400',
  TEXT: '#FFFFFF'
};

// Battlefield Dimensions
export const BATTLEFIELD = {
  WIDTH: 1500,
  HEIGHT: 900,
  TANK_SIZE: 22, // Increased by 10% from 20 to 22
  BULLET_SIZE: 5, // Increased by 15% from 4 to 5
  UPGRADE_SIZE: 22.5 // Increased by 25% from 18 (18 * 1.25 = 22.5)
};

// Tree Generation
export const TREE_PARAMS = {
  MIN_TREES: 10,
  MAX_TREES: 25,
  TREE_SIZE: 36, // Increased by 20% from 30
  TREE_SIZE_VARIANCE: 18, // Increased by 20% from 15
  CLUSTER_GROUPS: 1, // Number of cluster groups
  CLUSTERING: 0 // 0 = random, 100 = highly clustered
};

// AI Parameters
export const AI_PARAMS = {
  HEALTH_THRESHOLD: 50, // AI seeks upgrades when health below this
  DECISION_WEIGHT_KILL: 0.7,
  DECISION_WEIGHT_UPGRADE: 0.3
}; 