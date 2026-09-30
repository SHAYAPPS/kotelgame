// KTX2 encoding for the asset scripts (Basis Universal via ktx2-encoder, no native tools).
import { encodeToKTX2 } from 'ktx2-encoder';

/**
 * @param {Uint8Array} rgba raw RGBA8, top row first
 * @param {number} width @param {number} height
 * @param {'color' | 'normal' | 'data'} kind color: sRGB ETC1S; normal: UASTC + zstd;
 *   data (packed AO/roughness/metalness): linear ETC1S
 * @param {{ rdo?: number, quality?: number }} [extra] rdo: UASTC rate-distortion scalar (smaller
 *   normal maps, e.g. 2); quality: ETC1S quality level override
 * @returns {Promise<Uint8Array>}
 */
export async function encodeKTX2(rgba, width, height, kind, extra = {}) {
  const opts = {
    generateMipmap: true,
    imageDecoder: async () => ({ data: rgba, width, height }),
  };
  if (kind === 'normal') {
    Object.assign(opts, { isUASTC: true, needSupercompression: true, isNormalMap: true, isPerceptual: false, uastcLDRQualityLevel: 1 });
    if (extra.rdo) Object.assign(opts, { enableRDO: true, rdoQualityLevel: extra.rdo });
  } else {
    Object.assign(opts, { isUASTC: false, qualityLevel: extra.quality ?? (kind === 'color' ? 180 : 140), compressionLevel: 2, isPerceptual: kind === 'color' });
  }
  // The encoder logs every mip level to stdout; keep the script output readable (several
  // encodes may run at once: restore the real log when the last one ends).
  if (quiet++ === 0) {
    realLog = console.log;
    console.log = () => {};
  }
  try {
    return await encodeToKTX2(new Uint8Array(4), opts);
  } finally {
    if (--quiet === 0) console.log = realLog;
  }
}

let quiet = 0;
let realLog = console.log;
