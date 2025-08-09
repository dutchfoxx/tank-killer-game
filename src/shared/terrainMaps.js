// Terrain Maps Configuration
// This file contains predefined terrain configurations for different maps

export const TERRAIN_MAPS = {
          // Mudlands - A dense, varied terrain with multiple patch layers
        mudlands: {
          name: "Mudlands",
          description: "A dense terrain with multiple patch layers creating varied ground textures",
          treeParams: {
            minTrees: 10,
            maxTrees: 25,
            treeSize: 36,
            treeSizeVariance: 18,
            clusterGroups: 1,
            clustering: 0,
            treeType: 'forest-trees'
          },
          roadParams: {
            enabled: true,
            type: "dirt",
            curviness: 100,
            color: "#26251f",
            textureType: "none",
            textureBlend: "overlay",
            width: 28,
            textureOpacity: 0.6,
            lines: {
              enabled: true,
              color: "#ffffff",
              sideDistance: 4,
              dottedLength: 46,
              width: 1
            },
            baseOpacity: 0.6
          },
          groundParams: {
            color: "#55492f",
            textureType: "none",
            textureBlend: "multiply",
            textureOpacity: 0.5,
            textureScale: 1.0
          },
          patchParams: {
            patchTypes: {
              patch1: { enabled: true, quantity: 13, size: 200, sizeVariance: 150, opacity: 0.4, blend: 'multiply' },
              patch2: { enabled: true, quantity: 15, size: 200, sizeVariance: 150, opacity: 0.3, blend: 'multiply' },
              patch3: { enabled: true, quantity: 30, size: 200, sizeVariance: 150, opacity: 0.25, blend: 'multiply' },
              patch4: { enabled: true, quantity: 30, size: 200, sizeVariance: 150, opacity: 0.2, blend: 'multiply' },
              patch5: { enabled: true, quantity: 30, size: 200, sizeVariance: 150, opacity: 0.15, blend: 'multiply' },
              patch6: { enabled: true, quantity: 30, size: 20, sizeVariance: 150, opacity: 0.35, blend: 'multiply' },
              patch7: { enabled: true, quantity: 30, size: 200, sizeVariance: 75, opacity: 0.1, blend: 'multiply' }
            }
          }
        },

        // Snowlands - A snowy terrain with fresh snow texture
        snowlands: {
          name: "Snowlands",
          description: "A snowy terrain with fresh snow texture and minimal patches",
          treeParams: {
            minTrees: 8,
            maxTrees: 20,
            treeSize: 40,
            treeSizeVariance: 15,
            clusterGroups: 2,
            clustering: 30,
            treeType: 'forest-snow-trees'
          },
          groundParams: {
            color: "#f0f8ff",
            textureType: "fresh-snow",
            textureBlend: "multiply",
            textureOpacity: 0.8,
            textureScale: 1.2
          },
          patchParams: {
            patchTypes: {
              patch1: { enabled: true, quantity: 8, size: 150, sizeVariance: 100, opacity: 0.3, blend: 'multiply' },
              patch2: { enabled: true, quantity: 12, size: 120, sizeVariance: 80, opacity: 0.25, blend: 'multiply' },
              patch3: { enabled: false, quantity: 0, size: 50, sizeVariance: 20, opacity: 0.7, blend: 'multiply' },
              patch4: { enabled: false, quantity: 0, size: 50, sizeVariance: 20, opacity: 0.7, blend: 'multiply' },
              patch5: { enabled: false, quantity: 0, size: 50, sizeVariance: 20, opacity: 0.7, blend: 'multiply' },
              patch6: { enabled: false, quantity: 0, size: 50, sizeVariance: 20, opacity: 0.7, blend: 'multiply' },
              patch7: { enabled: false, quantity: 0, size: 50, sizeVariance: 20, opacity: 0.7, blend: 'multiply' }
            }
          }
        },

        // Wet Snow - A wet snowy terrain with wet snow texture
        wetSnow: {
          name: "Wet Snow",
          description: "A wet snowy terrain with wet snow texture and scattered patches",
          treeParams: {
            minTrees: 12,
            maxTrees: 22,
            treeSize: 38,
            treeSizeVariance: 20,
            clusterGroups: 1,
            clustering: 15,
            treeType: 'forest-snow-trees'
          },
          groundParams: {
            color: "#e6f3ff",
            textureType: "wet-snow",
            textureBlend: "multiply",
            textureOpacity: 0.7,
            textureScale: 1.0
          },
          patchParams: {
            patchTypes: {
              patch1: { enabled: true, quantity: 15, size: 180, sizeVariance: 120, opacity: 0.4, blend: 'multiply' },
              patch2: { enabled: true, quantity: 10, size: 140, sizeVariance: 90, opacity: 0.35, blend: 'multiply' },
              patch3: { enabled: true, quantity: 20, size: 100, sizeVariance: 60, opacity: 0.3, blend: 'multiply' },
              patch4: { enabled: false, quantity: 0, size: 50, sizeVariance: 20, opacity: 0.7, blend: 'multiply' },
              patch5: { enabled: false, quantity: 0, size: 50, sizeVariance: 20, opacity: 0.7, blend: 'multiply' },
              patch6: { enabled: false, quantity: 0, size: 50, sizeVariance: 20, opacity: 0.7, blend: 'multiply' },
              patch7: { enabled: false, quantity: 0, size: 50, sizeVariance: 20, opacity: 0.7, blend: 'multiply' }
            }
          }
        },

  // Default - Simple terrain with minimal patches
  default: {
    name: "Default",
    description: "Simple terrain with minimal patches",
    treeParams: {
      minTrees: 10,
      maxTrees: 25,
      treeSize: 36,
      treeSizeVariance: 18,
      clusterGroups: 1,
      clustering: 0,
      treeType: 'forest-trees'
    },
    roadParams: {
      enabled: true,
      curviness: 50,
      color: "#444444",
      textureType: "asfalt-dark",
      textureBlend: "overlay",
      width: 60,
      textureOpacity: 0.6,
      lines: {
        enabled: true,
        color: "#ffffff",
        sideDistance: 4,
        dottedLength: 46,
        width: 1
      }
    },
    groundParams: {
      color: "#55492f",
      textureType: "none",
      textureBlend: "multiply",
      textureOpacity: 0.5,
      textureScale: 1.0
    },
    patchParams: {
      patchTypes: {
        patch1: { enabled: false, quantity: 0, size: 50, sizeVariance: 20, opacity: 0.7, blend: 'multiply' },
        patch2: { enabled: false, quantity: 0, size: 50, sizeVariance: 20, opacity: 0.7, blend: 'multiply' },
        patch3: { enabled: false, quantity: 0, size: 50, sizeVariance: 20, opacity: 0.7, blend: 'multiply' },
        patch4: { enabled: false, quantity: 0, size: 50, sizeVariance: 20, opacity: 0.7, blend: 'multiply' },
        patch5: { enabled: false, quantity: 0, size: 50, sizeVariance: 20, opacity: 0.7, blend: 'multiply' },
        patch6: { enabled: false, quantity: 0, size: 50, sizeVariance: 20, opacity: 0.7, blend: 'multiply' },
        patch7: { enabled: false, quantity: 0, size: 50, sizeVariance: 20, opacity: 0.7, blend: 'multiply' }
      }
    }
  }
};

// Helper function to get a terrain map by name
export function getTerrainMap(mapName) {
  return TERRAIN_MAPS[mapName] || TERRAIN_MAPS.default;
}

// Helper function to get all available terrain maps
export function getAllTerrainMaps() {
  return Object.keys(TERRAIN_MAPS).map(key => ({
    id: key,
    ...TERRAIN_MAPS[key]
  }));
} 