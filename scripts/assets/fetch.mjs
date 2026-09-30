// Replaces the generated stand-in textures with CC0 photoscans and downloads a full-size
// CC0 HDRI sky, then converts everything the game loads to KTX2 (textures) and records
// where each asset came from in the manifest and public/assets/CREDITS.md.
//
//   npm run assets:fetch                     all sets + the HDRI
//   node scripts/assets/fetch.mjs paving     just some sets (ids from generate.mjs)
//   node scripts/assets/fetch.mjs paving=polyhaven:<asset_id>   pick a specific asset
//   node scripts/assets/fetch.mjs limestone=ambientcg:<AssetId>
//   LOCAL=<dir> node scripts/assets/fetch.mjs limestone
//       use files you downloaded yourself: <dir>/<id>_color.jpg, _normal.jpg (OpenGL),
//       _rough.jpg and optionally _ao.jpg (png works too)
//
// Sources: Poly Haven (api.polyhaven.com, dl.polyhaven.org) and ambientCG (ambientcg.com),
// both CC0. The network has to allow those hosts. A set that can't be fetched keeps its
// generated textures.
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import sharp from 'sharp';
import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { encodeKTX2 } from './ktx2.mjs';
import { writeCredits } from './credits.mjs';

const TEX = new URL('../../public/assets/textures/', import.meta.url);
const HDRI = new URL('../../public/assets/hdri/', import.meta.url);
const SIZE = 1024;

/**
 * What each set should look like. `polyhaven` / `ambientcg`: asset ids to try first, then
 * keyword search (all words must match the asset's name, tags or categories). `meters`: how
 * much ground one texture covers when the source doesn't say.
 */
const TARGETS = {
  // Plain pale limestone surface (no joints: the wall's blocks come from geometry).
  limestone: {
    meters: 2,
    polyhaven: ['limestone_rock', 'rock_face', 'rough_rock'],
    keywords: [['limestone'], ['rock', 'beige'], ['rock', 'smooth']],
    ambientcg: ['Rock030', 'Rock035'],
    acgQuery: 'limestone rock',
  },
  // Rougher, pitted stone for the upper courses and rubble.
  limestone_rough: {
    meters: 1.5,
    polyhaven: ['rock_boulder_dry', 'rocky_terrain'],
    keywords: [['rock', 'rough'], ['rock', 'weathered']],
    ambientcg: ['Rock023', 'Rock028'],
    acgQuery: 'rock rough',
  },
  // Pale stone paving slabs.
  paving: {
    meters: 4,
    polyhaven: ['stone_tiles', 'patterned_paving'],
    keywords: [['paving', 'stone'], ['tiles', 'stone'], ['floor', 'stone']],
    ambientcg: ['PavingStones070', 'PavingStones115'],
    acgQuery: 'paving stones',
  },
  // Building ashlar: dressed stone blocks with joints.
  ashlar: {
    meters: 4,
    polyhaven: ['castle_wall_slates', 'stone_brick_wall_001'],
    keywords: [['stone', 'wall', 'bricks'], ['stone', 'wall']],
    ambientcg: ['Bricks076', 'Bricks077'],
    acgQuery: 'stone wall blocks',
  },
};

const HDRI_CANDIDATES = ['kloofendal_48d_partly_cloudy_puresky', 'kloofendal_43d_clear_puresky'];

// ---------------------------------------------------------------------------

async function getJSON(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'kotelgame-asset-fetch' } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

async function getBuffer(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'kotelgame-asset-fetch' } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Decode any image to SIZE x SIZE RGBA8. */
async function rgbaOf(buf) {
  const { data } = await sharp(buf).resize(SIZE, SIZE, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return new Uint8Array(data.buffer, data.byteOffset, data.length);
}

async function grayOf(buf) {
  const { data } = await sharp(buf).resize(SIZE, SIZE, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  return data;
}

/** maps: { color, normal, rough, ao? } as encoded image buffers. */
async function writeSet(id, maps) {
  const color = await rgbaOf(maps.color);
  const normal = await rgbaOf(maps.normal);
  const rough = await grayOf(maps.rough);
  const ao = maps.ao ? await grayOf(maps.ao) : null;
  const orm = new Uint8Array(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) {
    orm[i * 4] = ao ? ao[i] : 255;
    orm[i * 4 + 1] = rough[i];
    orm[i * 4 + 2] = 0;
    orm[i * 4 + 3] = 255;
  }
  for (let i = 3; i < color.length; i += 4) color[i] = 255;
  await writeFile(new URL(`${id}_color.ktx2`, TEX), await encodeKTX2(color, SIZE, SIZE, 'color'));
  await writeFile(new URL(`${id}_normal.ktx2`, TEX), await encodeKTX2(normal, SIZE, SIZE, 'normal'));
  await writeFile(new URL(`${id}_orm.ktx2`, TEX), await encodeKTX2(orm, SIZE, SIZE, 'data'));
}

// --- Poly Haven -------------------------------------------------------------

let phList = null;
async function polyHavenList(type) {
  phList ??= {};
  phList[type] ??= await getJSON(`https://api.polyhaven.com/assets?t=${type}`);
  return phList[type];
}

function matches(info, words) {
  const hay = [info.name, ...(info.tags ?? []), ...(info.categories ?? [])].join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
}

async function pickPolyHaven(target, forced) {
  const list = await polyHavenList('textures');
  if (forced) return list[forced] ? forced : null;
  for (const id of target.polyhaven) if (list[id]) return id;
  for (const words of target.keywords) {
    // Most downloaded first: the well-known, good scans.
    const hits = Object.entries(list)
      .filter(([, info]) => matches(info, words))
      .sort((a, b) => (b[1].download_count ?? 0) - (a[1].download_count ?? 0));
    if (hits.length) return hits[0][0];
  }
  return null;
}

async function fetchPolyHaven(id, target, forced) {
  const asset = await pickPolyHaven(target, forced);
  if (!asset) return null;
  const info = (await polyHavenList('textures'))[asset];
  const files = await getJSON(`https://api.polyhaven.com/files/${asset}`);
  const url = (key) => {
    const res = files[key]?.['2k'] ?? files[key]?.['1k'];
    return res?.jpg?.url ?? res?.png?.url ?? null;
  };
  const color = url('Diffuse') ?? url('diff');
  const normal = url('nor_gl');
  const rough = url('Rough') ?? url('rough');
  const ao = url('AO') ?? url('ao');
  if (!color || !normal || !rough) throw new Error(`Poly Haven ${asset}: missing maps`);
  const maps = { color: await getBuffer(color), normal: await getBuffer(normal), rough: await getBuffer(rough) };
  if (ao) maps.ao = await getBuffer(ao);
  // dimensions: [width, height] in millimeters (real-world size of one tile).
  const meters = info?.dimensions?.[0] ? info.dimensions[0] / 1000 : target.meters;
  return {
    maps,
    meta: {
      meters,
      source: 'Poly Haven',
      asset,
      name: info?.name ?? asset,
      authors: Object.keys(info?.authors ?? {}),
      url: `https://polyhaven.com/a/${asset}`,
      license: 'CC0',
    },
  };
}

// --- ambientCG --------------------------------------------------------------

async function fetchAmbientCG(id, target, forced) {
  const base = 'https://ambientcg.com/api/v2/full_json?type=Material&include=downloadData';
  let assets = [];
  for (const q of forced ? [`&id=${forced}`] : [`&id=${target.ambientcg.join(',')}`, `&q=${encodeURIComponent(target.acgQuery)}&sort=Popular`]) {
    assets = (await getJSON(base + q)).foundAssets ?? [];
    if (assets.length) break;
  }
  for (const a of assets) {
    const zips = a.downloadFolders?.default?.downloadFiletypeCategories?.zip?.downloads ?? [];
    const dl = zips.find((d) => d.attribute === '2K-JPG') ?? zips.find((d) => d.attribute === '1K-JPG');
    if (!dl) continue;
    const zip = unzipSync(new Uint8Array(await getBuffer(dl.fullDownloadPath ?? dl.downloadLink)));
    const file = (suffix) => {
      const name = Object.keys(zip).find((n) => n.endsWith(suffix));
      return name ? Buffer.from(zip[name]) : null;
    };
    const maps = { color: file('_Color.jpg'), normal: file('_NormalGL.jpg'), rough: file('_Roughness.jpg'), ao: file('_AmbientOcclusion.jpg') };
    if (!maps.color || !maps.normal || !maps.rough) continue;
    if (!maps.ao) delete maps.ao;
    return {
      maps,
      meta: {
        meters: target.meters,
        source: 'ambientCG',
        asset: a.assetId,
        name: a.displayName ?? a.assetId,
        authors: ['ambientCG (Lennart Demes)'],
        url: `https://ambientcg.com/view?id=${a.assetId}`,
        license: 'CC0',
      },
    };
  }
  return null;
}

// --- Local files ------------------------------------------------------------

async function readLocal(dir, id) {
  const one = async (map) => {
    for (const ext of ['jpg', 'jpeg', 'png']) {
      const p = `${dir}/${id}_${map}.${ext}`;
      try {
        await access(p);
        return readFile(p);
      } catch {
        // try the next extension
      }
    }
    return null;
  };
  const maps = { color: await one('color'), normal: await one('normal'), rough: await one('rough'), ao: await one('ao') };
  if (!maps.color || !maps.normal || !maps.rough) return null;
  if (!maps.ao) delete maps.ao;
  let meta = {};
  try {
    meta = JSON.parse(await readFile(`${dir}/${id}.json`, 'utf8')); // optional: source, url, license, meters
  } catch {
    // no metadata file
  }
  return { maps, meta: { meters: TARGETS[id].meters, source: 'local files', license: 'CC0 (check!)', ...meta } };
}

// --- HDRI -------------------------------------------------------------------

async function fetchHDRI() {
  const list = await polyHavenList('hdris');
  let id = HDRI_CANDIDATES.find((c) => list[c]);
  if (!id) {
    const hits = Object.entries(list).filter(([, i]) => matches(i, ['partly cloudy']) || matches(i, ['pure skies']));
    id = hits.sort((a, b) => (b[1].download_count ?? 0) - (a[1].download_count ?? 0))[0]?.[0];
  }
  if (!id) throw new Error('no suitable HDRI found');
  const files = await getJSON(`https://api.polyhaven.com/files/${id}`);
  const url = files.hdri?.['2k']?.hdr?.url;
  if (!url) throw new Error(`HDRI ${id}: no 2k .hdr`);
  await mkdir(HDRI, { recursive: true });
  await writeFile(new URL('sky_2k.hdr', HDRI), await getBuffer(url));
  const info = list[id];
  const meta = { file: 'sky_2k.hdr', source: 'Poly Haven', asset: id, name: info.name, authors: Object.keys(info.authors ?? {}), url: `https://polyhaven.com/a/${id}`, license: 'CC0' };
  await writeFile(new URL('manifest.json', HDRI), JSON.stringify({ sky: meta }, null, 2) + '\n');
  console.log(`hdri: ${info.name} (${id})`);
}

// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const requests = (args.length ? args : [...Object.keys(TARGETS), 'hdri']).map((a) => {
    const [id, pick] = a.split('=');
    const [provider, asset] = pick ? pick.split(':') : [];
    return { id, provider, asset };
  });
  const manifestUrl = new URL('manifest.json', TEX);
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8').catch(() => '{}'));
  let failed = 0;
  for (const { id, provider, asset } of requests) {
    try {
      if (id === 'hdri') {
        await fetchHDRI();
        continue;
      }
      const target = TARGETS[id];
      if (!target) throw new Error(`unknown set "${id}" (sets: ${Object.keys(TARGETS).join(', ')})`);
      let got = null;
      if (process.env.LOCAL) got = await readLocal(process.env.LOCAL, id);
      else {
        if (!provider || provider === 'polyhaven') got = await fetchPolyHaven(id, target, asset).catch((e) => (provider ? Promise.reject(e) : (console.warn(`  Poly Haven: ${e.message}`), null)));
        if (!got && (!provider || provider === 'ambientcg')) got = await fetchAmbientCG(id, target, asset);
      }
      if (!got) throw new Error('nothing suitable found');
      await writeSet(id, got.maps);
      manifest[id] = { ...got.meta, maps: ['color', 'normal', 'orm'] };
      console.log(`${id}: ${got.meta.name ?? ''} from ${got.meta.source}`);
    } catch (e) {
      failed++;
      console.warn(`${id}: not fetched (${e.message}); keeping what's there`);
    }
  }
  await writeFile(manifestUrl, JSON.stringify(manifest, null, 2) + '\n');
  await writeCredits();
  if (failed) {
    console.warn(`\n${failed} asset(s) not fetched. If the requests were refused (HTTP 403), allow api.polyhaven.com, dl.polyhaven.org and ambientcg.com in your network settings.`);
    process.exitCode = 1;
  }
}

main();
