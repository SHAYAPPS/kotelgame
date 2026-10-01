// Sources and settings for scripts/assets/weapons.mjs (npm run assets:weapons).
// Every source is CC0 or CC-BY; the raw downloads go to assets-src/models/ (git-ignored) and
// are fetched again from these URLs when missing. Credits: public/assets/CREDITS.md.

export const SOURCES = {
  rifle: {
    url: 'https://opengameart.org/sites/default/files/m4a1_0.zip',
    page: 'https://opengameart.org/content/m4a1-assault-rifle',
    title: 'M4A1 Assault Rifle',
    author: 'nisu',
    license: 'CC0',
    files: { fbx: 'M4A1/M4A1.fbx', color: 'M4A1/M4A1_Base_Color.png', normal: 'M4A1/M4A1_Normal.png', rough: 'M4A1/M4A1_Roughness.png', metal: 'M4A1/M4A1_Metallic.png' },
  },
  arms: {
    url: 'https://opengameart.org/sites/default/files/fps%20arms.7z',
    page: 'https://opengameart.org/content/fps-arms-rigged-only',
    title: 'FPS Arms (rigged only)',
    author: 'para',
    license: 'CC0',
    files: { fbx: 'FPS ARMS RIG 1.fbx', skin: 'new_diff.png' },
  },
  launcher: {
    url: 'https://opengameart.org/sites/default/files/RPG7.zip',
    page: 'https://opengameart.org/content/low-poly-rpg7',
    title: 'Low poly RPG7',
    author: 'Lucian Pavel',
    license: 'CC0',
    files: { fbx: 'RPG7.fbx', color: 'RPG7.png' },
  },
  truck: {
    url: 'https://static.poly.pizza/ecae441a-cba8-4dd6-9795-207a72d7e88e.glb',
    page: 'https://poly.pizza/m/4qjS9tFhsJg',
    title: 'Mitsubishi L200',
    author: 'Muhammad Reyhan',
    license: 'CC-BY 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
    files: { glb: 'model.glb' },
  },
};

// The rifle (meters, barrel toward -Z, origin on the rail top where the red dot mounts).
export const RIFLE_MODEL = {
  scale: 0.01, // the FBX is in centimeters
  // Rail top (receiver) where the optic's mount sits; its rear end in z (source cm, measured).
  opticZ: 1.2,
  // Parts kept as their own nodes (animated); everything else is merged into "receiver".
  parts: {
    magazine: ['Magazine'],
    charging_handle: ['Charging_Handle'],
    dust_cover: ['Ejector_Lid'],
    rear_sight: ['Sight_2'], // the flip-up aperture: folded flat under the red dot
  },
  textureSize: 1024,
  metalness: 0.45, // scale on the source metalness map
};

// The truck: which source materials are what (PBR roles), parts dropped (brand badge).
export const TRUCK_MODEL = {
  length: 5.25, // meters, bumper to bumper
};
