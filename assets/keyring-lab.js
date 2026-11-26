// FuseRing keyring DFM and lug-mechanics engine.
// Pure deterministic ES module with zero browser or clock dependencies.
// Runs identically in a browser <script type="module"> and under Node import.
// Every number is derived from assets/model.json or the constants below.

/* ================= FIPS 180-4 SHA-256 ================= */

const K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const toBytes = (data) =>
  typeof data === "string" ? new TextEncoder().encode(data) : Uint8Array.from(data);

export function sha256Bytes(data) {
  const bytes = toBytes(data);
  const bitLen = bytes.length * 8;
  const padLen = (bytes.length % 64 < 56 ? 56 : 120) - (bytes.length % 64);
  const msg = new Uint8Array(bytes.length + padLen + 8);
  msg.set(bytes);
  msg[bytes.length] = 0x80;
  const dv = new DataView(msg.buffer);
  dv.setUint32(msg.length - 8, Math.floor(bitLen / 0x100000000));
  dv.setUint32(msg.length - 4, bitLen >>> 0);

  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Uint32Array(64);

  for (let off = 0; off < msg.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
      const s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K256[i] + w[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }

  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  h.forEach((v, i) => odv.setUint32(i * 4, v >>> 0));
  return out;
}

export function sha256Hex(data) {
  return [...sha256Bytes(data)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ================= Canonical JSON ================= */

// Deterministic JSON for hashing: sorted keys, -0 -> 0, JSON.stringify-compatible
// value mapping. Throws TypeError on cycles, BigInt, or depth beyond maxDepth.
export function canonicalize(value, maxDepth = 64) {
  const stack = new Set();
  const walk = (v, depth) => {
    if (depth > maxDepth) throw new TypeError("canonicalize: depth limit exceeded");
    if (v === null) return "null";
    const t = typeof v;
    if (t === "number") {
      if (!Number.isFinite(v)) return "null";
      return JSON.stringify(v === 0 ? 0 : v); // folds -0 to 0
    }
    if (t === "boolean") return v ? "true" : "false";
    if (t === "string") return JSON.stringify(v);
    if (t === "bigint" || t === "symbol" || t === "function") {
      throw new TypeError(`canonicalize: unsupported type ${t}`);
    }
    if (t === "undefined") return undefined;
    if (Array.isArray(v)) {
      if (stack.has(v)) throw new TypeError("canonicalize: circular reference");
      stack.add(v);
      const parts = v.map((item) => {
        const r = walk(item, depth + 1);
        return r === undefined ? "null" : r;
      });
      stack.delete(v);
      return `[${parts.join(",")}]`;
    }
    if (t === "object") {
      if (stack.has(v)) throw new TypeError("canonicalize: circular reference");
      stack.add(v);
      const parts = [];
      for (const k of Object.keys(v).sort()) {
        if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
        const r = walk(v[k], depth + 1);
        if (r === undefined) continue;
        parts.push(`${JSON.stringify(k)}:${r}`);
      }
      stack.delete(v);
      return `{${parts.join(",")}}`;
    }
    throw new TypeError(`canonicalize: unsupported type ${t}`);
  };
  return walk(value, 0);
}

/* ================= Geometry ================= */

export function shoelaceArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

// Net area of a section {outer, holes}: outer polygon minus every hole polygon.
export function ringNetArea(section) {
  const holes = section.holes || [];
  return shoelaceArea(section.outer) - holes.reduce((s, hole) => s + shoelaceArea(hole), 0);
}

export function polygonCentroid(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
    const t = x1 * y2 - x2 * y1;
    a += t; cx += (x1 + x2) * t; cy += (y1 + y2) * t;
  }
  a /= 2;
  if (Math.abs(a) < 1e-9) {
    return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  }
  return [cx / (6 * a), cy / (6 * a)];
}

// Sorted y coordinates where the polygon boundary crosses the vertical line x.
// Half-open edge rule so a vertex landing exactly on x is counted once.
export function crossingsX(pts, x, eps = 1e-9) {
  const ys = [];
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
    if (Math.abs(x2 - x1) < eps) continue;
    if ((x1 <= x) !== (x2 <= x)) {
      ys.push(y1 + ((x - x1) / (x2 - x1)) * (y2 - y1));
    }
  }
  return ys.sort((a, b) => a - b);
}

// Total length of y-intervals where material exists at x: inside outer, outside holes.
function materialWidthAt(outer, holes, x) {
  const ys = crossingsX(outer, x);
  if (ys.length < 2) return 0;
  const spans = [];
  for (let i = 0; i + 1 < ys.length; i += 2) spans.push([ys[i], ys[i + 1]]);
  const voids = [];
  for (const hole of holes) {
    const hy = crossingsX(hole, x);
    for (let i = 0; i + 1 < hy.length; i += 2) voids.push([hy[i], hy[i + 1]]);
  }
  let width = 0;
  for (const [a, b] of spans) {
    // subtract every void interval from this span
    let pieces = [[a, b]];
    for (const [va, vb] of voids) {
      pieces = pieces.flatMap(([pa, pb]) => {
        if (vb <= pa || va >= pb) return [[pa, pb]];
        const out = [];
        if (va > pa) out.push([pa, Math.min(va, pb)]);
        if (vb < pb) out.push([Math.max(vb, pa), pb]);
        return out;
      });
    }
    for (const [pa, pb] of pieces) width += pb - pa;
  }
  return width;
}

// Min point-to-point distance between two polygons (dense polygons, arc-stepped).
function minPolyGap(a, b) {
  let best = Infinity;
  for (const p of a) {
    for (const q of b) {
      const dx = p[0] - q[0], dy = p[1] - q[1];
      const d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
    }
  }
  return Math.sqrt(best);
}

export function zLevels(model) {
  const zs = [...new Set(model.plan.map((s) => s.z))].sort((a, b) => a - b);
  return { zBase: zs[0], zTop: model.size[2] };
}

// Z-layer decomposition of the part: flat base plate + raised relief.
export function layerMetrics(model) {
  const { zBase, zTop } = zLevels(model);
  const reliefThk = zTop - zBase;
  const baseThk = zBase;

  const holeArea = (model.bottom.holes || []).reduce((s, h) => s + shoelaceArea(h), 0);
  const plateNetPoly = shoelaceArea(model.bottom.outer) - holeArea;

  const exposedSections = model.plan.filter((s) => s.z === zBase);
  const reliefSections = model.plan.filter((s) => s.z === zTop);

  const exposedPoly = exposedSections.reduce((s, sec) => s + ringNetArea(sec), 0);
  const reliefPoly = reliefSections.reduce((s, sec) => s + ringNetArea(sec), 0);
  const exposedExact = exposedSections.reduce((s, sec) => s + sec.area, 0);
  const reliefExact = reliefSections.reduce((s, sec) => s + sec.area, 0);
  const plateExact = exposedExact + reliefExact;

  const baseVolPoly = plateNetPoly * baseThk;
  const reliefVolPoly = reliefPoly * reliefThk;
  const baseVolExact = plateExact * baseThk;
  const reliefVolExact = reliefExact * reliefThk;

  // Thinnest relief wall: minimum gap between distinct z-top boundary rings.
  const rings = [];
  for (const sec of reliefSections) {
    rings.push(sec.outer, ...(sec.holes || []));
  }
  let minWall = Infinity;
  for (let i = 0; i < rings.length; i++) {
    for (let j = i + 1; j < rings.length; j++) {
      const d = minPolyGap(rings[i], rings[j]);
      if (d < minWall) minWall = d;
    }
  }

  return {
    zBase, zTop, baseThk, reliefThk,
    holeArea,
    plateNetPoly, plateExact,
    exposedPoly, exposedExact,
    reliefPoly, reliefExact,
    exposedCount: exposedSections.length,
    reliefCount: reliefSections.length,
    baseVolPoly, reliefVolPoly, integratedVolPoly: baseVolPoly + reliefVolPoly,
    baseVolExact, reliefVolExact, integratedVolExact: baseVolExact + reliefVolExact,
    statedVol: model.volume_mm3,
    minReliefWall: minWall,
  };
}

// Carabiner lug geometry measured from model.json: pull toward +x (lug tip).
export function lugMetrics(model) {
  const { zBase, zTop } = zLevels(model);
  const hole = model.holes[0];
  const r = hole.diameter / 2;

  const ys = crossingsX(model.bottom.outer, hole.cx);
  const lugWidth = ys[ys.length - 1] - ys[0];

  // Relief-covered width at the hole section: does the raised relief reach the lug?
  const reliefSections = model.plan.filter((s) => s.z === zTop);
  const holeInRelief = reliefSections.some((sec) =>
    (sec.holes || []).some((hh) => {
      const [cx, cy] = polygonCentroid(hh);
      return Math.hypot(cx - hole.cx, cy - hole.cy) < hole.diameter / 4;
    }));
  const lugThk = holeInRelief ? zTop : zBase;

  // Subtract the through-hole explicitly even if a section omits it from its holes.
  const throughHoles = model.bottom.holes || [];
  const reliefNet = reliefSections.reduce(
    (s, sec) => s + materialWidthAt(sec.outer, [...(sec.holes || []), ...throughHoles], hole.cx), 0);
  const baseNet = lugWidth - hole.diameter;
  const netArea = baseNet * zBase + reliefNet * (zTop - zBase);

  const tipX = Math.max(...model.bottom.outer.map((p) => p[0]));
  const edgeDistance = tipX - hole.cx;
  const shearLength = edgeDistance - r;
  const shearArea = 2 * shearLength * lugThk;
  const bearingArea = hole.diameter * lugThk;

  return {
    holeCx: hole.cx, holeCy: hole.cy, holeD: hole.diameter, holeR: r,
    lugWidth, lugThk, reliefNet, baseNet,
    netArea, edgeDistance, shearLength, shearArea, bearingArea,
  };
}

/* ================= Process profiles ================= */

// Conservative published strengths (usable/yield), densities of the finished part.
export const PROCESSES = [
  { key: "pla",   label: "PLA (FDM)",            family: "FDM polymer",      density: 1.24, tensile: 33,  minFeature: 1.0 },
  { key: "petg",  label: "PETG (FDM)",           family: "FDM polymer",      density: 1.27, tensile: 30,  minFeature: 1.0 },
  { key: "sla",   label: "SLA Tough Resin",      family: "vat photopolymer", density: 1.15, tensile: 55,  minFeature: 0.2 },
  { key: "sls",   label: "SLS Nylon PA12",       family: "powder bed",       density: 1.01, tensile: 48,  minFeature: 0.7 },
  { key: "alu",   label: "CNC 6061-T6 Aluminum", family: "machined metal",   density: 2.70, tensile: 276, minFeature: 0.5 },
  { key: "brass", label: "CNC C360 Brass",       family: "machined metal",   density: 8.50, tensile: 124, minFeature: 0.5 },
];

export const LOAD_MIN = 5;
export const LOAD_MAX = 150;
export const LOADS = Array.from({ length: 15 }, (_, i) => 10 + i * 10); // 10..150 N

const SHEAR_RATIO = 0.577; // von Mises: shear yield = tensile yield / sqrt(3)

export function processByKey(key) {
  return PROCESSES.find((p) => p.key === key) || null;
}

export function envelopeMargins(model) {
  const lim = model.limits_mm;
  const hole = model.holes[0];
  return {
    x: lim.x - model.size[0],
    y: lim.y - model.size[1],
    z: lim.z - model.size[2],
    hole: hole.diameter - lim.min_hole,
  };
}

export function minMargin(margins) {
  const entries = Object.entries(margins);
  let [key, val] = entries[0];
  for (const [k, v] of entries) if (v < val) { key = k; val = v; }
  return { key, value: val };
}

// Lug stress and safety factors for a process at a pull load (newtons).
export function lugSafety(lug, tensile, loadN) {
  const shear = tensile * SHEAR_RATIO;
  const sfNet = (tensile * lug.netArea) / loadN;
  const sfShear = (shear * lug.shearArea) / loadN;
  const sfBearing = (tensile * lug.bearingArea) / loadN;
  const modes = [
    ["bearing", sfBearing],
    ["tear-out", sfShear],
    ["net section", sfNet],
  ];
  modes.sort((a, b) => a[1] - b[1]);
  return { sfNet, sfShear, sfBearing, sf: modes[0][1], mode: modes[0][0] };
}

export function fidelityRating(layers, proc) {
  const score = layers.minReliefWall / proc.minFeature;
  const rating = score >= 4 ? "excellent" : score >= 2 ? "good" : score >= 1 ? "marginal" : "poor";
  return { score, rating };
}

export function processMetrics(model, proc, loadN) {
  const layers = layerMetrics(model);
  const lug = lugMetrics(model);
  const massG = (model.volume_mm3 / 1000) * proc.density;
  const safety = lugSafety(lug, proc.tensile, loadN);
  const margins = envelopeMargins(model);
  const fidelity = fidelityRating(layers, proc);
  return { proc, massG, ...safety, margins, minMargin: minMargin(margins), fidelity, lugArea: lug.netArea };
}

export function compareAll(model, loadN) {
  return PROCESSES.map((p) => processMetrics(model, p, loadN));
}

export function sweepSF(model, proc, loads = LOADS) {
  const lug = lugMetrics(model);
  return loads.map((load) => ({ load, ...lugSafety(lug, proc.tensile, load) }));
}

/* ================= Hash state codec (#frlab=) ================= */

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function b64urlEncode(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0, c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : "";
    out += i + 2 < bytes.length ? B64[c & 63] : "";
  }
  return out;
}

export function b64urlDecode(str) {
  if (typeof str !== "string" || str.length === 0 || str.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/.test(str)) {
    return null;
  }
  const out = [];
  for (let i = 0; i < str.length; i += 4) {
    const n = [0, 1, 2, 3].map((k) => (i + k < str.length ? B64.indexOf(str[i + k]) : -1));
    const triple = (n[0] << 18) | ((n[1] < 0 ? 0 : n[1]) << 12) | ((n[2] < 0 ? 0 : n[2]) << 6) | (n[3] < 0 ? 0 : n[3]);
    out.push((triple >> 16) & 255);
    if (n[2] >= 0) out.push((triple >> 8) & 255);
    if (n[3] >= 0) out.push(triple & 255);
  }
  return Uint8Array.from(out);
}

export function normalizeState(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const allowed = new Set(["v", "p", "l", "t"]);
  for (const k of Object.keys(raw)) {
    if (!allowed.has(k)) return null; // fail closed on unknown keys (incl __proto__)
  }
  if (!Object.prototype.hasOwnProperty.call(raw, "p") || !Object.prototype.hasOwnProperty.call(raw, "l")) return null;
  if (raw.v !== 1) return null;
  const proc = processByKey(raw.p);
  if (!proc) return null;
  if (typeof raw.l !== "number" || !Number.isFinite(raw.l)) return null;
  const load = Math.min(LOAD_MAX, Math.max(LOAD_MIN, raw.l + 0)); // +0 folds -0
  let layer = null;
  if (Object.prototype.hasOwnProperty.call(raw, "t")) {
    if (typeof raw.t !== "number" || !Number.isInteger(raw.t)) return null;
    layer = raw.t;
  }
  return { p: proc.key, l: load, t: layer };
}

export function encodeLabState(state) {
  if (!state || typeof state !== "object") return null;
  const proc = processByKey(state.p);
  if (!proc) return null;
  const l = Number(state.l);
  if (!Number.isFinite(l)) return null;
  const obj = { v: 1, p: proc.key, l: Math.min(LOAD_MAX, Math.max(LOAD_MIN, l + 0)) };
  if (state.t != null) {
    if (!Number.isInteger(state.t)) return null;
    obj.t = state.t;
  }
  return `#frlab=${b64urlEncode(new TextEncoder().encode(canonicalize(obj)))}`;
}

export function decodeLabHash(hash) {
  if (typeof hash !== "string") return null;
  const m = hash.startsWith("#frlab=") ? hash.slice(7) : hash.startsWith("frlab=") ? hash.slice(6) : null;
  if (m === null) return null;
  const bytes = b64urlDecode(m);
  if (!bytes) return null;
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
  return normalizeState(parsed);
}

/* ================= DFM proof brief + cached digest ================= */

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const briefCache = new Map(); // stateKey -> brief (one digest-stamped payload per state)

function buildBriefPayload(model, state) {
  const layers = layerMetrics(model);
  const lug = lugMetrics(model);
  const hole = model.holes[0];
  const rows = compareAll(model, state.l).map((m) => ({
    key: m.proc.key, density: m.proc.density, tensile: m.proc.tensile,
    mass_g: r4(m.massG), lug_area_mm2: r4(m.lugArea),
    sf_net: r4(m.sfNet), sf_shear: r4(m.sfShear), sf_bearing: r4(m.sfBearing),
    sf_governing: r4(m.sf), governing_mode: m.mode,
    margin_min_mm: r4(m.minMargin.value), margin_axis: m.minMargin.key,
    fidelity_score: r4(m.fidelity.score), fidelity: m.fidelity.rating,
  }));
  const sel = rows.find((r) => r.key === state.p);
  return {
    brief: "fusering-compass dfm proof",
    version: 1,
    part: {
      file: model.file,
      size_mm: model.size.map(r4),
      volume_mm3: model.volume_mm3,
      hole: { cx: hole.cx, cy: hole.cy, diameter: hole.diameter },
      limits_mm: model.limits_mm,
    },
    state: { process: state.p, load_N: state.l, layer: state.t },
    lug: {
      width_mm: r4(lug.lugWidth), thickness_mm: r4(lug.lugThk),
      net_area_mm2: r4(lug.netArea), shear_area_mm2: r4(lug.shearArea),
      bearing_area_mm2: r4(lug.bearingArea), edge_distance_mm: r4(lug.edgeDistance),
    },
    layers: {
      plate_net_mm2: r4(layers.plateNetPoly), plate_net_exact_mm2: r4(layers.plateExact),
      exposed_base_mm2: r4(layers.exposedPoly), exposed_base_exact_mm2: r4(layers.exposedExact),
      relief_mm2: r4(layers.reliefPoly), relief_exact_mm2: r4(layers.reliefExact),
      base_vol_mm3: r4(layers.baseVolPoly), relief_vol_mm3: r4(layers.reliefVolPoly),
      integrated_vol_mm3: r4(layers.integratedVolPoly), stated_vol_mm3: layers.statedVol,
      min_relief_wall_mm: r4(layers.minReliefWall),
    },
    processes: rows,
    selected: sel,
  };
}

export function csvCell(v) {
  let s = String(v);
  const lead = (/^[\s\p{Cf}\p{Cc}]*/u.exec(s) || [""])[0];
  const first = s.charAt(lead.length);
  const plainNumber = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s.slice(lead.length));
  if (lead.length > 0 || (first !== "" && "=+-@".indexOf(first) !== -1 && !(first === "-" && plainNumber))) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvRows(brief) {
  const p = brief.payload;
  const rows = [["section", "item", "value", "unit"]];
  rows.push(["part", "size_x", p.part.size_mm[0], "mm"]);
  rows.push(["part", "size_y", p.part.size_mm[1], "mm"]);
  rows.push(["part", "size_z", p.part.size_mm[2], "mm"]);
  rows.push(["part", "volume", p.part.volume_mm3, "mm3"]);
  rows.push(["part", "hole_diameter", p.part.hole.diameter, "mm"]);
  rows.push(["state", "process", p.state.process, "key"]);
  rows.push(["state", "load", p.state.load_N, "N"]);
  rows.push(["lug", "width", p.lug.width_mm, "mm"]);
  rows.push(["lug", "net_area", p.lug.net_area_mm2, "mm2"]);
  rows.push(["lug", "shear_area", p.lug.shear_area_mm2, "mm2"]);
  rows.push(["lug", "bearing_area", p.lug.bearing_area_mm2, "mm2"]);
  for (const r of p.processes) {
    rows.push(["process", `${r.key}_mass`, r.mass_g, "g"]);
    rows.push(["process", `${r.key}_sf_governing`, r.sf_governing, "factor"]);
    rows.push(["process", `${r.key}_fidelity`, r.fidelity, "rating"]);
  }
  rows.push(["digest", "sha256", brief.digest, "hex"]);
  return rows;
}

export function toCSV(brief) {
  return csvRows(brief).map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function toMarkdown(brief) {
  const p = brief.payload;
  const lines = [
    "# FuseRing DFM proof brief",
    "",
    `Part ${p.part.file}: ${p.part.size_mm.join(" x ")} mm, ${p.part.volume_mm3} mm3, hole ${p.part.hole.diameter} mm.`,
    `State: process ${p.state.process}, pull load ${p.state.load_N} N.`,
    "",
    "| Process | Mass g | SF net | SF tear-out | SF bearing | Governing | Fidelity |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...p.processes.map((r) =>
      `| ${r.key} | ${r.mass_g} | ${r.sf_net} | ${r.sf_shear} | ${r.sf_bearing} | ${r.sf_governing} (${r.governing_mode}) | ${r.fidelity} |`),
    "",
    `sha256: ${brief.digest}`,
    "",
  ];
  return lines.join("\n");
}

// One cached digest-stamped payload per state key. The on-page fingerprint,
// JSON export, CSV export and Markdown export all stamp this exact digest.
export function briefFor(model, state) {
  const norm = normalizeState({ v: 1, p: state.p, l: state.l, ...(state.t != null ? { t: state.t } : {}) });
  if (!norm) throw new TypeError("briefFor: invalid state");
  const stateKey = canonicalize(norm);
  if (briefCache.has(stateKey)) return briefCache.get(stateKey);
  const payload = buildBriefPayload(model, norm);
  const canonical = canonicalize(payload);
  const digest = sha256Hex(canonical);
  const brief = {
    stateKey, payload, canonical, digest,
    stamped: { ...payload, sha256: digest },
  };
  brief.json = JSON.stringify(brief.stamped, null, 2) + "\n";
  brief.csv = toCSV(brief);
  brief.md = toMarkdown(brief);
  if (briefCache.size >= 32) briefCache.delete(briefCache.keys().next().value);
  briefCache.set(stateKey, brief);
  return brief;
}

export function verifyBrief(brief) {
  return sha256Hex(brief.canonical) === brief.digest;
}

// Flip one numeric field by exactly 1 unit for the tamper demo.
export function tamperBrief(brief) {
  const copy = JSON.parse(brief.canonical);
  copy.state.load_N += 1;
  const canonical = canonicalize(copy);
  return { field: "state.load_N (+1 N)", canonical, digest: sha256Hex(canonical) };
}

/* ================= In-page deterministic self checks ================= */

export function selfChecks(model) {
  const checks = [];
  const add = (id, name, ok, detail = "") => checks.push({ id, name, ok: !!ok, detail });
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const relNear = (a, b, rel) => Math.abs(a - b) <= Math.abs(b) * rel;

  // SHA-256 known-answer tests (FIPS 180-4 / RFC 6234 vectors)
  add("sha-empty", "SHA-256 of empty string matches KAT",
    sha256Hex("") === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  add("sha-abc", "SHA-256 of 'abc' matches KAT",
    sha256Hex("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  add("sha-56", "SHA-256 two-block message matches KAT",
    sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq") ===
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  add("sha-112", "SHA-256 multi-block message matches KAT",
    sha256Hex("abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu") ===
    "cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1");

  // Canonicalizer
  add("canon-order", "canonicalize sorts object keys",
    canonicalize({ b: 1, a: 2 }) === '{"a":2,"b":1}');
  add("canon-neg0", "canonicalize folds -0 to 0",
    canonicalize({ a: -0 }) === canonicalize({ a: 0 }));
  let threw = false;
  try { const o = {}; o.self = o; canonicalize(o); } catch { threw = true; }
  add("canon-cycle", "canonicalize rejects circular structures", threw);
  threw = false;
  try { let deep = {}; for (let i = 0; i < 70; i++) deep = { n: deep }; canonicalize(deep); } catch { threw = true; }
  add("canon-depth", "canonicalize enforces its depth bound", threw);

  // Geometry: shoelace vs stated plan areas
  const layers = layerMetrics(model);
  const lug = lugMetrics(model);
  let worst = 0;
  for (const sec of model.plan) {
    worst = Math.max(worst, Math.abs(ringNetArea(sec) - sec.area) / sec.area);
  }
  add("area-sections", "shoelace net area matches every plan section area within 0.5%", worst < 0.005, `worst ${(worst * 100).toFixed(3)}%`);
  add("area-relief", "z-top relief footprint matches stated area within 0.5%",
    relNear(layers.reliefPoly, layers.reliefExact, 0.005), `${layers.reliefPoly.toFixed(2)} vs ${layers.reliefExact}`);
  add("area-tiling", "exposed base plus relief footprint tiles the plate within 0.5%",
    relNear(layers.exposedPoly + layers.reliefPoly, layers.plateNetPoly, 0.005));
  add("vol-integrated", "integrated layer volume matches stated STEP volume within 0.1%",
    relNear(layers.integratedVolExact, model.volume_mm3, 0.001), `${layers.integratedVolExact.toFixed(1)} vs ${model.volume_mm3}`);

  // Envelope
  const margins = envelopeMargins(model);
  add("env-fit", "part fits inside the 80 x 80 x 6 mm envelope",
    margins.x > 0 && margins.y > 0 && margins.z > 0, `margins ${r4(margins.x)}, ${r4(margins.y)}, ${r4(margins.z)} mm`);
  add("env-hole", "key hole meets the 5.0 mm minimum", model.holes[0].diameter >= model.limits_mm.min_hole,
    `${model.holes[0].diameter} >= ${model.limits_mm.min_hole}`);

  // Lug
  add("lug-net", "lug net section area is positive and consistent",
    lug.netArea > 0 && near(lug.netArea, lug.baseNet * layers.zBase + lug.reliefNet * layers.reliefThk, 1e-6),
    `${lug.netArea.toFixed(2)} mm2`);
  add("lug-edge", "edge distance and shear length are consistent",
    near(lug.shearLength, lug.edgeDistance - lug.holeR, 1e-9) && lug.shearLength > 0,
    `${lug.shearLength.toFixed(2)} mm`);

  // Process physics
  const allMono = PROCESSES.every((p) => {
    const sw = sweepSF(model, p);
    return sw.every((pt, i) => i === 0 || pt.sf < sw[i - 1].sf);
  });
  add("sf-load-mono", "governing safety factor strictly decreases as load rises (all 6 processes)", allMono);
  const p1 = lugSafety(lug, 50, 20), p2 = lugSafety(lug, 100, 20);
  add("sf-strength-mono", "safety factor scales up with tensile strength", p2.sf > p1.sf && near(p2.sf, 2 * p1.sf, 1e-9));
  const byDensity = [...PROCESSES].sort((a, b) => a.density - b.density);
  const masses = byDensity.map((p) => processMetrics(model, p, 10).massG);
  add("mass-density-mono", "part mass rises monotonically with density", masses.every((m, i) => i === 0 || m > masses[i - 1]));
  add("mass-exact", "PLA mass equals stated volume times density",
    near(processMetrics(model, processByKey("pla"), 10).massG, (model.volume_mm3 / 1000) * 1.24, 1e-9));

  // Digest parity across all four surfaces
  const state = { p: "pla", l: 45 };
  const brief = briefFor(model, state);
  const jsonDig = JSON.parse(brief.json).sha256;
  const csvDig = brief.csv.trim().split(/\r?\n/).pop().split(",")[2];
  const mdDig = brief.md.match(/sha256:\s*([0-9a-f]{64})/)[1];
  add("digest-parity", "one SHA-256 stamps page, JSON, CSV and Markdown identically",
    jsonDig === brief.digest && csvDig === brief.digest && mdDig === brief.digest);
  add("digest-cache", "same state returns the cached digest-stamped payload",
    briefFor(model, state) === brief && briefFor(model, { p: "pla", l: 45 }).digest === brief.digest);
  const tampered = tamperBrief(brief);
  add("digest-tamper", "a 1-unit tamper changes the SHA-256", tampered.digest !== brief.digest && verifyBrief(brief));

  // Codec
  const enc = encodeLabState({ p: "brass", l: 120, t: 4 });
  const dec = decodeLabHash(enc);
  add("codec-roundtrip", "frlab hash codec round-trips state",
    dec && dec.p === "brass" && dec.l === 120 && dec.t === 4 && encodeLabState(dec) === enc);
  const hostile = [
    "#frlab=", "#frlab=!!!", "#frlab=AAAA",
    "#frlab=" + b64urlEncode(new TextEncoder().encode("null")),
    "#frlab=" + b64urlEncode(new TextEncoder().encode("[1,2]")),
    "#frlab=" + b64urlEncode(new TextEncoder().encode('{"__proto__":{"x":1},"p":"pla","l":10,"v":1}')),
    "#frlab=" + b64urlEncode(new TextEncoder().encode('{"v":1,"p":"nope","l":10}')),
    "#frlab=" + b64urlEncode(new TextEncoder().encode('{"v":1,"p":"pla","l":"x"}')),
    "#frlab=" + b64urlEncode(new TextEncoder().encode('{"v":1,"p":"pla","l":10,"evil":1}')),
  ];
  add("codec-hostile", "codec fail-closed on hostile hash input", hostile.every((hx) => decodeLabHash(hx) === null));
  const clamped = decodeLabHash(encodeLabState({ p: "pla", l: 99999 }));
  add("codec-clamp", "out-of-range load clamps to the 5..150 N window", clamped && clamped.l === LOAD_MAX);

  // CSV formula injection
  const cellText = (s) => (s.startsWith('"') ? s.slice(1, -1) : s);
  const inj = ["=1+1", "+cmd", "-2x", "@sum", "\t=1", " =1", "\r=2"];
  add("csv-formula", "CSV cells resist formula injection including leading-space attacks",
    inj.every((s) => cellText(csvCell(s)).startsWith("'")) && csvCell("safe text") === "safe text");

  return checks;
}
