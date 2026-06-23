// Solves Trade Republic's AWS WAF JS challenge purely computationally — no
// browser/Playwright involved. Ported from the Python reference implementation
// vendored into pytr (https://github.com/xKiian/awswaf, MIT), which reverse-
// engineered the challenge as a JSON fingerprint blob (mostly static/synthetic
// data, not real browser introspection) plus a small proof-of-work, both
// AES-GCM-encrypted with a hardcoded key embedded in AWS's own challenge.js.
//
// Verified live (see chat history): app.traderepublic.com's WAF deployment
// always issues the "NetworkBandwidth" challenge type (the cheapest of the
// three pytr supports — no actual CPU-bound work, just a correctly-sized
// zero-buffer), so that's the only solver implemented here. hash_pow is
// included for resilience in case that ever changes; scrypt is not (heavy,
// never observed in practice for this site) — solveWaf throws clearly if
// neither matches rather than silently failing.

const AES_KEY_HEX = '6f71a512b1e035eaab53d8be73120d3fb68a0ca346b9560aab3e5cdf753d5e98'
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'

// Known challenge_type hashes → solver name (mirrors pytr's CHALLENGE_SOLVERS).
const CHALLENGE_SOLVERS: Record<string, 'network_bandwidth' | 'hash_pow'> = {
  ha9faaffd31b4d5ede2a2e19d2d7fd525f66fee61911511960dcbb52d3c48ce25: 'network_bandwidth',
  h7b0c470f0cfe3a80a9e26526ad185f484f6817d0832712a4a37a908786a6a67f: 'hash_pow',
}

const DEFAULT_BANDWIDTH_SIZES: Record<number, number> = { 1: 0x400, 2: 0xa * 0x400, 3: 0x64 * 0x400, 4: 0x100000, 5: 0xa * 0x100000 }

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
}

// CRC32 (IEEE 802.3, same polynomial as Python's zlib.crc32).
let CRC_TABLE: Uint32Array | null = null
function crc32(bytes: Uint8Array): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      CRC_TABLE[n] = c
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

async function aesGcmEncrypt(plaintext: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', hexToBytes(AES_KEY_HEX), 'AES-GCM', false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  // Web Crypto's AES-GCM output is ciphertext with the 16-byte tag appended —
  // same layout as Python's AESGCM.encrypt(), so the split below matches.
  const combined = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext))
  const tag = combined.slice(-16)
  const ciphertext = combined.slice(0, -16)
  const ivB64 = btoa(String.fromCharCode(...iv))
  return `${ivB64}::${bytesToHex(tag)}::${bytesToHex(ciphertext)}`
}

// A handful of static, plausible GPU fingerprints (vendored from pytr's
// webgl.json) — randomly picked, not derived from anything real about the
// caller, same as the upstream implementation.
const GPUS: { renderer: string; vendor: string; extensions: string }[] = JSON.parse(
  '[{"renderer":"ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)","vendor":"Google Inc. (Apple)","extensions":"ANGLE_instanced_arrays;EXT_blend_minmax;EXT_clip_control;EXT_color_buffer_half_float;EXT_depth_clamp;EXT_disjoint_timer_query;EXT_float_blend;EXT_frag_depth;EXT_polygon_offset_clamp;EXT_shader_texture_lod;EXT_texture_compression_bptc;EXT_texture_compression_rgtc;EXT_texture_filter_anisotropic;EXT_texture_mirror_clamp_to_edge;EXT_sRGB;KHR_parallel_shader_compile;OES_element_index_uint;OES_fbo_render_mipmap;OES_standard_derivatives;OES_texture_float;OES_texture_float_linear;OES_texture_half_float;OES_texture_half_float_linear;OES_vertex_array_object;WEBGL_blend_func_extended;WEBGL_color_buffer_float;WEBGL_compressed_texture_astc;WEBGL_compressed_texture_etc;WEBGL_compressed_texture_etc1;WEBGL_compressed_texture_pvrtc;WEBGL_compressed_texture_s3tc;WEBGL_compressed_texture_s3tc_srgb;WEBGL_debug_renderer_info;WEBGL_debug_shaders;WEBGL_depth_texture;WEBGL_draw_buffers;WEBGL_lose_context;WEBGL_multi_draw;WEBGL_polygon_mode"},{"renderer":"ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001681) Direct3D11 vs_5_0 ps_5_0, D3D11)","vendor":"Google Inc. (AMD)","extensions":"ANGLE_instanced_arrays;EXT_blend_minmax;EXT_clip_control;EXT_color_buffer_half_float;EXT_depth_clamp;EXT_disjoint_timer_query;EXT_float_blend;EXT_frag_depth;EXT_polygon_offset_clamp;EXT_shader_texture_lod;EXT_texture_compression_bptc;EXT_texture_compression_rgtc;EXT_texture_filter_anisotropic;EXT_texture_mirror_clamp_to_edge;EXT_sRGB;KHR_parallel_shader_compile;OES_element_index_uint;OES_fbo_render_mipmap;OES_standard_derivatives;OES_texture_float;OES_texture_float_linear;OES_texture_half_float;OES_texture_half_float_linear;OES_vertex_array_object;WEBGL_blend_func_extended;WEBGL_color_buffer_float;WEBGL_compressed_texture_astc;WEBGL_compressed_texture_etc;WEBGL_compressed_texture_etc1;WEBGL_compressed_texture_pvrtc;WEBGL_compressed_texture_s3tc;WEBGL_compressed_texture_s3tc_srgb;WEBGL_debug_renderer_info;WEBGL_debug_shaders;WEBGL_depth_texture;WEBGL_draw_buffers;WEBGL_lose_context;WEBGL_multi_draw;WEBGL_polygon_mode"},{"renderer":"ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)","vendor":"Google Inc. (Intel)","extensions":"ANGLE_instanced_arrays;EXT_blend_minmax;EXT_clip_control;EXT_color_buffer_half_float;EXT_depth_clamp;EXT_disjoint_timer_query;EXT_float_blend;EXT_frag_depth;EXT_polygon_offset_clamp;EXT_shader_texture_lod;EXT_texture_compression_bptc;EXT_texture_compression_rgtc;EXT_texture_filter_anisotropic;EXT_texture_mirror_clamp_to_edge;EXT_sRGB;KHR_parallel_shader_compile;OES_element_index_uint;OES_fbo_render_mipmap;OES_standard_derivatives;OES_texture_float;OES_texture_float_linear;OES_texture_half_float;OES_texture_half_float_linear;OES_vertex_array_object;WEBGL_blend_func_extended;WEBGL_color_buffer_float;WEBGL_compressed_texture_astc;WEBGL_compressed_texture_etc;WEBGL_compressed_texture_etc1;WEBGL_compressed_texture_pvrtc;WEBGL_compressed_texture_s3tc;WEBGL_compressed_texture_s3tc_srgb;WEBGL_debug_renderer_info;WEBGL_debug_shaders;WEBGL_depth_texture;WEBGL_draw_buffers;WEBGL_lose_context;WEBGL_multi_draw;WEBGL_polygon_mode"},{"renderer":"ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x000046A6) Direct3D11 vs_5_0 ps_5_0, D3D11)","vendor":"Google Inc. (Intel)","extensions":"ANGLE_instanced_arrays;EXT_blend_minmax;EXT_clip_control;EXT_color_buffer_half_float;EXT_depth_clamp;EXT_disjoint_timer_query;EXT_float_blend;EXT_frag_depth;EXT_polygon_offset_clamp;EXT_shader_texture_lod;EXT_texture_compression_bptc;EXT_texture_compression_rgtc;EXT_texture_filter_anisotropic;EXT_texture_mirror_clamp_to_edge;EXT_sRGB;KHR_parallel_shader_compile;OES_element_index_uint;OES_fbo_render_mipmap;OES_standard_derivatives;OES_texture_float;OES_texture_float_linear;OES_texture_half_float;OES_texture_half_float_linear;OES_vertex_array_object;WEBGL_blend_func_extended;WEBGL_color_buffer_float;WEBGL_compressed_texture_astc;WEBGL_compressed_texture_etc;WEBGL_compressed_texture_etc1;WEBGL_compressed_texture_pvrtc;WEBGL_compressed_texture_s3tc;WEBGL_compressed_texture_s3tc_srgb;WEBGL_debug_renderer_info;WEBGL_debug_shaders;WEBGL_depth_texture;WEBGL_draw_buffers;WEBGL_lose_context;WEBGL_multi_draw;WEBGL_polygon_mode"}]',
)

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min)) + min
}
function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

async function getFingerprint(userAgent: string): Promise<{ checksum: string; encryptedFp: string }> {
  const ts = Date.now()
  const gpu = GPUS[randInt(0, GPUS.length)]
  const bins = Array.from({ length: 256 }, () => randInt(0, 40))
  bins[0] = randInt(14473, 16573)
  bins[255] = randInt(14473, 16573)

  const fp = {
    metrics: {
      fp2: 1, browser: 0, capabilities: 1, gpu: 7, dnt: 0, math: 0, screen: 0, navigator: 0,
      auto: 1, stealth: 0, subtle: 0, canvas: 5, formdetector: 1, be: 0,
    },
    start: ts,
    flashVersion: null,
    plugins: [
      { name: 'PDF Viewer', str: 'PDF Viewer ' },
      { name: 'Chrome PDF Viewer', str: 'Chrome PDF Viewer ' },
      { name: 'Chromium PDF Viewer', str: 'Chromium PDF Viewer ' },
      { name: 'Microsoft Edge PDF Viewer', str: 'Microsoft Edge PDF Viewer ' },
      { name: 'WebKit built-in PDF', str: 'WebKit built-in PDF ' },
    ],
    dupedPlugins:
      'PDF Viewer Chrome PDF Viewer Chromium PDF Viewer Microsoft Edge PDF Viewer WebKit built-in PDF ||1920-1080-1032-24-*-*-*',
    screenInfo: '1920-1080-1032-24-*-*-*',
    referrer: '',
    userAgent,
    location: '',
    webDriver: false,
    capabilities: {
      css: { textShadow: 1, WebkitTextStroke: 1, boxShadow: 1, borderRadius: 1, borderImage: 1, opacity: 1, transform: 1, transition: 1 },
      js: { audio: true, geolocation: Math.random() < 0.5, localStorage: 'supported', touch: false, video: true, webWorker: Math.random() < 0.5 },
      elapsed: 1,
    },
    gpu: { vendor: gpu.vendor, model: gpu.renderer, extensions: gpu.extensions.split(';') },
    dnt: null,
    math: { tan: '-1.4214488238747245', sin: '0.8178819121159085', cos: '-0.5753861119575491' },
    automation: { wd: { properties: { document: [], window: [], navigator: [] } }, phantom: { properties: { window: [] } } },
    stealth: { t1: 0, t2: 0, i: 1, mte: 0, mtd: false },
    crypto: {
      crypto: 1, subtle: 1, encrypt: true, decrypt: true, wrapKey: true, unwrapKey: true,
      sign: true, verify: true, digest: true, deriveBits: true, deriveKey: true, getRandomValues: true, randomUUID: true,
    },
    canvas: { hash: randInt(645172295, 735192295), emailHash: null, histogramBins: bins },
    formDetected: false,
    numForms: 0,
    numFormElements: 0,
    be: { si: false },
    end: ts + 1,
    errors: [],
    version: '2.4.0',
    id: crypto.randomUUID(),
  }

  const payload = new TextEncoder().encode(JSON.stringify(fp))
  const crc = crc32(payload)
  const checksum = crc.toString(16).padStart(8, '0').toUpperCase()
  const checksumBytes = new TextEncoder().encode(checksum)
  const data = new Uint8Array(checksumBytes.length + 1 + payload.length)
  data.set(checksumBytes, 0)
  data[checksumBytes.length] = '#'.charCodeAt(0)
  data.set(payload, checksumBytes.length + 1)

  return { checksum, encryptedFp: await aesGcmEncrypt(data) }
}

async function hashPowSolve(challenge: string, salt: string, difficulty: number): Promise<string> {
  const prefix = challenge + salt
  const full = Math.floor(difficulty / 8)
  const rem = difficulty % 8
  for (let nonce = 0; ; nonce++) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(prefix + nonce)))
    let ok = true
    for (let i = 0; i < full; i++) if (digest[i] !== 0) { ok = false; break }
    if (ok && rem && digest[full] >> (8 - rem)) ok = false
    if (ok) return String(nonce)
    if (nonce > 5_000_000) throw new Error('hash_pow: no solution found within iteration cap')
  }
}

function networkBandwidthSolve(difficulty: number): string {
  const size = DEFAULT_BANDWIDTH_SIZES[difficulty] ?? 0x400
  const zeros = new Uint8Array(size)
  // btoa on a giant binary string is fine here — sizes top out at ~10 MiB,
  // well within Worker memory limits, and this only runs once per login.
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < zeros.length; i += chunk) bin += String.fromCharCode(...zeros.subarray(i, i + chunk))
  return btoa(bin)
}

interface WafInputs {
  challenge: { input: string; hmac: string; region: string }
  challenge_type: string
  difficulty: number
}

// Full flow: GET login page → extract challenge.js URL → GET /inputs →
// compute fingerprint + solve → POST /verify → return the WAF token string.
export async function solveTradeRepublicWaf(): Promise<string> {
  const loginRes = await fetch('https://app.traderepublic.com/login', {
    headers: { 'user-agent': CHROME_UA, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
  })
  const loginHtml = await loginRes.text()
  const challengeMatch = loginHtml.match(/src="(https:\/\/[^"]+\/challenge\.js)"/)
  if (!challengeMatch) throw new Error('WAF challenge.js URL not found in login page')
  const challengeJsUrl = challengeMatch[1]
  const wafEndpoint = challengeJsUrl.split('https://')[1].split('/challenge.js')[0]

  const inputsRes = await fetch(`https://${wafEndpoint}/inputs?client=browser`, {
    headers: { 'user-agent': CHROME_UA, accept: '*/*' },
  })
  if (!inputsRes.ok) throw new Error(`WAF /inputs failed: HTTP ${inputsRes.status}`)
  const inputs = await inputsRes.json() as WafInputs

  const solverName = CHALLENGE_SOLVERS[inputs.challenge_type]
  if (!solverName) throw new Error(`Unsupported WAF challenge type: ${inputs.challenge_type}`)

  const { checksum, encryptedFp } = await getFingerprint(CHROME_UA)
  const solution = solverName === 'network_bandwidth'
    ? networkBandwidthSolve(inputs.difficulty)
    : await hashPowSolve(inputs.challenge.input, checksum, inputs.difficulty)

  const payload = {
    challenge: inputs.challenge,
    checksum,
    solution,
    signals: [{ name: 'Zoey', value: { Present: encryptedFp } }],
    existing_token: null,
    client: 'Browser',
    domain: 'app.traderepublic.com',
    metrics: [
      { name: '2', value: Math.random(), unit: '2' },
      { name: '100', value: 0, unit: '2' },
      { name: '101', value: 0, unit: '2' },
      { name: '102', value: 0, unit: '2' },
      { name: '103', value: 8, unit: '2' },
      { name: '104', value: 0, unit: '2' },
      { name: '105', value: 0, unit: '2' },
      { name: '106', value: 0, unit: '2' },
      { name: '107', value: 0, unit: '2' },
      { name: '108', value: 1, unit: '2' },
      { name: 'undefined', value: 0, unit: '2' },
      { name: '110', value: 0, unit: '2' },
      { name: '111', value: 2, unit: '2' },
      { name: '112', value: 0, unit: '2' },
      { name: 'undefined', value: 0, unit: '2' },
      { name: '3', value: 4, unit: '2' },
      { name: '7', value: 0, unit: '4' },
      { name: '1', value: randFloat(10, 20), unit: '2' },
      { name: '4', value: 36.5, unit: '2' },
      { name: '5', value: randFloat(0, 1), unit: '2' },
      { name: '6', value: randFloat(50, 60), unit: '2' },
      { name: '0', value: randFloat(130, 140), unit: '2' },
      { name: '8', value: 1, unit: '4' },
    ],
  }

  const verifyRes = await fetch(`https://${wafEndpoint}/verify`, {
    method: 'POST',
    headers: { 'user-agent': CHROME_UA, accept: '*/*', 'content-type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(payload),
  })
  if (!verifyRes.ok) throw new Error(`WAF /verify failed: HTTP ${verifyRes.status}`)
  const verifyJson = await verifyRes.json() as { token?: string }
  if (!verifyJson.token) throw new Error('WAF /verify response missing token')
  return verifyJson.token
}
