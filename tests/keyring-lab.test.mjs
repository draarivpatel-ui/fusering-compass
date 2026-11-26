import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'assets/keyring-lab.js'), 'utf8');
const lab = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(src));
const model = JSON.parse(fs.readFileSync(path.join(root, 'assets/model.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/sheet.css'), 'utf8');
const labuiSrc = fs.readFileSync(path.join(root, 'assets/lab-ui.js'), 'utf8');
const enc = new TextEncoder();
const b64 = (s) => lab.b64urlEncode(enc.encode(s));
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

/* ---------- SHA-256: KATs + boundary sweep vs node:crypto ---------- */

for (let n = 0; n <= 160; n++) {
  test(`sha256 matches node:crypto at ${n} bytes`, () => {
    const data = Uint8Array.from({ length: n }, (_, i) => (i * 31 + n * 7 + 13) % 256);
    assert.equal(lab.sha256Hex(data), crypto.createHash('sha256').update(data).digest('hex'));
  });
}

test('sha256 empty-string KAT', () => {
  assert.equal(lab.sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});
test('sha256 abc KAT', () => {
  assert.equal(lab.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
test('sha256 56-byte two-block KAT', () => {
  assert.equal(
    lab.sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
});
test('sha256 112-byte multi-block KAT', () => {
  assert.equal(
    lab.sha256Hex('abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu'),
    'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1');
});
test('sha256 encodes strings as UTF-8', () => {
  const s = 'caf\u00e9 \u2603';
  assert.equal(lab.sha256Hex(s), crypto.createHash('sha256').update(s, 'utf8').digest('hex'));
});

/* ---------- canonical JSON ---------- */

test('canonicalize sorts keys recursively and emits exact JSON', () => {
  assert.equal(
    lab.canonicalize({ b: { d: 1, c: 2 }, a: [{ z: 1, y: 2 }] }),
    '{"a":[{"y":2,"z":1}],"b":{"c":2,"d":1}}');
});
test('canonicalize sorts keys by code-unit order', () => {
  const o = { b: 1, A: 2, a: 3, '10': 4, '2': 5 };
  assert.equal(lab.canonicalize(o), '{"10":4,"2":5,"A":2,"a":3,"b":1}');
});
test('canonicalize folds -0 to 0 at every depth', () => {
  assert.equal(lab.canonicalize({ a: -0, b: [-0] }), '{"a":0,"b":[0]}');
  assert.equal(lab.canonicalize({ a: -0 }), lab.canonicalize({ a: 0 }));
});
test('canonicalize maps non-finite numbers to null like JSON.stringify', () => {
  assert.equal(lab.canonicalize({ a: Infinity, b: -Infinity, c: NaN }), '{"a":null,"b":null,"c":null}');
});
test('canonicalize drops undefined object values and nulls them in arrays', () => {
  assert.equal(lab.canonicalize({ a: undefined, b: 1 }), '{"b":1}');
  assert.equal(lab.canonicalize([undefined, 1]), '[null,1]');
});
test('canonicalize throws on direct and mutual cycles', () => {
  const a = {}; a.self = a;
  assert.throws(() => lab.canonicalize(a), TypeError);
  const x = {}, y = { x }; x.y = y;
  assert.throws(() => lab.canonicalize(x), TypeError);
});
test('canonicalize enforces the depth bound', () => {
  let deep = {};
  for (let i = 0; i < 70; i++) deep = { n: deep };
  assert.throws(() => lab.canonicalize(deep), TypeError);
  let ok = {};
  for (let i = 0; i < 40; i++) ok = { n: ok };
  assert.doesNotThrow(() => lab.canonicalize(ok));
});
test('canonicalize throws on BigInt, symbol and function values', () => {
  assert.throws(() => lab.canonicalize({ a: 10n }), TypeError);
  assert.throws(() => lab.canonicalize({ a: Symbol('s') }), TypeError);
  assert.throws(() => lab.canonicalize({ a: () => 1 }), TypeError);
});
test('canonicalize keeps __proto__ as data and never pollutes', () => {
  const o = JSON.parse('{"__proto__":{"polluted":true}}');
  assert.equal(lab.canonicalize(o), '{"__proto__":{"polluted":true}}');
  assert.equal({}.polluted, undefined);
});
test('canonicalize handles strings with escapes exactly like JSON.stringify', () => {
  assert.equal(lab.canonicalize({ s: 'a"b\nc\td' }), JSON.stringify({ s: 'a"b\nc\td' }));
});

/* ---------- geometry: shoelace, layers, lug ---------- */

test('shoelaceArea computes squares, triangles and order-independent results', () => {
  assert.equal(lab.shoelaceArea([[0, 0], [2, 0], [2, 2], [0, 2]]), 4);
  assert.equal(lab.shoelaceArea([[2, 2], [0, 2], [0, 0], [2, 0]]), 4); // same square rotated
  assert.equal(lab.shoelaceArea([[0, 0], [0, 2], [2, 2], [2, 0]]), 4); // reversed winding
  assert.equal(lab.shoelaceArea([[0, 0], [2, 0], [1, 2]]), 2);
  assert.equal(lab.shoelaceArea([]), 0);
});
test('crossingsX returns sorted boundary crossings', () => {
  assert.deepEqual(lab.crossingsX([[-2, -1], [2, -1], [2, 1], [-2, 1]], 0), [-1, 1]);
  assert.deepEqual(lab.crossingsX([[-2, -1], [2, -1], [2, 1], [-2, 1]], 1), [-1, 1]);
});

model.plan.forEach((sec, i) => {
  test(`shoelace net area matches stated plan[${i}] area within 0.5%`, () => {
    const got = lab.ringNetArea(sec);
    assert.ok(Math.abs(got - sec.area) / sec.area < 0.005, `${got} vs ${sec.area}`);
  });
});

test('layer decomposition: z levels and section counts', () => {
  const L = lab.layerMetrics(model);
  assert.equal(L.zBase, 3.0);
  assert.equal(L.zTop, 4.5);
  assert.equal(L.baseThk, 3.0);
  assert.equal(L.reliefThk, 1.5);
  assert.equal(L.exposedCount, 10);
  assert.equal(L.reliefCount, 1);
});
test('plate net shoelace area is about 2386 mm2', () => {
  near(lab.layerMetrics(model).plateNetPoly, 2386.0, 0.5);
});
test('exposed base plus relief footprint tiles the plate', () => {
  const L = lab.layerMetrics(model);
  near(L.exposedPoly + L.reliefPoly, L.plateNetPoly, 0.1);
});
test('relief footprint shoelace is within 0.5% of stated 1311.948', () => {
  const L = lab.layerMetrics(model);
  assert.ok(Math.abs(L.reliefPoly - 1311.948) / 1311.948 < 0.005);
});
test('integrated exact layer volume matches stated STEP volume within 0.05 mm3', () => {
  near(lab.layerMetrics(model).integratedVolExact, model.volume_mm3, 0.05);
});
test('integrated polygon volume is within 0.3% of stated volume', () => {
  const L = lab.layerMetrics(model);
  assert.ok(Math.abs(L.integratedVolPoly - model.volume_mm3) / model.volume_mm3 < 0.003);
});
test('keyhole polygon area matches a 6.5 mm circle within 0.5%', () => {
  const L = lab.layerMetrics(model);
  near(L.holeArea, Math.PI * 3.25 * 3.25, Math.PI * 3.25 * 3.25 * 0.005);
});
test('minimum relief wall is a sane DFM feature size', () => {
  const L = lab.layerMetrics(model);
  assert.ok(L.minReliefWall > 1.0 && L.minReliefWall < 4.0, `wall ${L.minReliefWall}`);
});

test('lug geometry measured from model.json', () => {
  const lug = lab.lugMetrics(model);
  near(lug.lugWidth, 18.996, 0.01);
  assert.equal(lug.lugThk, 4.5);
  near(lug.netArea, 56.228, 0.05);
  near(lug.shearArea, 56.25, 0.01);
  near(lug.bearingArea, 29.25, 0.01);
  near(lug.shearLength, 6.25, 0.01);
  near(lug.edgeDistance, 9.5, 0.01);
  assert.equal(lug.holeD, 6.5);
});
test('lug net area equals base plus relief contributions', () => {
  const lug = lab.lugMetrics(model);
  const L = lab.layerMetrics(model);
  near(lug.netArea, lug.baseNet * L.baseThk + lug.reliefNet * L.reliefThk, 1e-9);
});
test('envelope margins against the 80 x 80 x 6 mm spec and 5.0 mm hole', () => {
  const m = lab.envelopeMargins(model);
  near(m.x, 17.5, 1e-9);
  near(m.y, 26.0, 1e-9);
  near(m.z, 1.5, 1e-9);
  near(m.hole, 1.5, 1e-9);
  const mm = lab.minMargin(m);
  assert.equal(mm.key, 'z');
  near(mm.value, 1.5, 1e-9);
});

/* ---------- six-process comparator ---------- */

test('exactly six process profiles with unique keys', () => {
  assert.equal(lab.PROCESSES.length, 6);
  assert.equal(new Set(lab.PROCESSES.map((p) => p.key)).size, 6);
});

lab.PROCESSES.forEach((p) => {
  test(`comparator ${p.key}: mass, safety factors, margin, fidelity`, () => {
    const load = 45;
    const m = lab.processMetrics(model, p, load);
    near(m.massG, (model.volume_mm3 / 1000) * p.density, 1e-9);
    const lug = lab.lugMetrics(model);
    near(m.sfBearing, (p.tensile * lug.bearingArea) / load, 1e-9);
    near(m.sfShear, (p.tensile * 0.577 * lug.shearArea) / load, 1e-6);
    near(m.sfNet, (p.tensile * lug.netArea) / load, 1e-9);
    assert.equal(m.mode, 'bearing');
    assert.equal(m.sf, m.sfBearing);
    near(m.lugArea, lug.netArea, 1e-9);
    assert.equal(m.minMargin.key, 'z');
    near(m.minMargin.value, 1.5, 1e-9);
    near(m.fidelity.score, lab.layerMetrics(model).minReliefWall / p.minFeature, 1e-9);
    assert.ok(['excellent', 'good', 'marginal', 'poor'].includes(m.fidelity.rating));
  });
});

lab.PROCESSES.forEach((p) => {
  lab.LOADS.forEach((load) => {
    test(`governing SF for ${p.key} at ${load} N equals tensile x bearing area / load`, () => {
      const m = lab.processMetrics(model, p, load);
      const lug = lab.lugMetrics(model);
      near(m.sf, (p.tensile * lug.bearingArea) / load, 1e-9);
      assert.ok(m.sf > 0 && Number.isFinite(m.sf));
    });
  });
});

lab.PROCESSES.forEach((p) => {
  test(`SF sweep strictly decreases with load for ${p.key}`, () => {
    const sw = lab.sweepSF(model, p);
    assert.equal(sw.length, lab.LOADS.length);
    sw.forEach((pt, i) => {
      if (i > 0) assert.ok(pt.sf < sw[i - 1].sf, `${pt.load} not below ${sw[i - 1].load}`);
      near(pt.sf * pt.load, sw[0].sf * sw[0].load, 1e-6); // hyperbolic
    });
  });
});

test('mass rises monotonically with density across processes', () => {
  const sorted = [...lab.PROCESSES].sort((a, b) => a.density - b.density);
  const masses = sorted.map((p) => lab.processMetrics(model, p, 10).massG);
  masses.forEach((m, i) => { if (i > 0) assert.ok(m > masses[i - 1]); });
});
test('safety factor doubles when tensile strength doubles', () => {
  const lug = lab.lugMetrics(model);
  const a = lab.lugSafety(lug, 50, 30);
  const b = lab.lugSafety(lug, 100, 30);
  near(b.sf, 2 * a.sf, 1e-9);
});
test('sweep uses the 10 to 150 N grid with at least 10 points', () => {
  assert.ok(lab.LOADS.length >= 10);
  assert.equal(lab.LOADS[0], 10);
  assert.equal(lab.LOADS[lab.LOADS.length - 1], 150);
});

/* ---------- CSV formula safety ---------- */

const injections = ['=1+1', '+2', '-3x', '@x', '\t=1', '\r=1', ' =1', '  =1', ' \t=1', '=SUM(A1)', '- 1', '+cmd'];
injections.forEach((s) => {
  test(`csvCell prefixes dangerous content ${JSON.stringify(s)}`, () => {
    const out = lab.csvCell(s);
    const content = out.startsWith('"') ? out.slice(1, -1) : out;
    assert.ok(content.startsWith("'"), `${JSON.stringify(out)} lacks prefix`);
  });
});

test('csvCell leaves safe content untouched', () => {
  for (const s of ['abc', 'x=1', '123', 'PLA (FDM)', 'sha256']) {
    assert.equal(lab.csvCell(s), s);
  }
  assert.equal(lab.csvCell(' a'), "' a");
});
test('csvCell quotes and doubles quotes correctly', () => {
  assert.equal(lab.csvCell('a,b'), '"a,b"');
  assert.equal(lab.csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(lab.csvCell('line\nbreak'), '"line\nbreak"');
});
test('csvCell on numbers and empty values', () => {
  assert.equal(lab.csvCell(0), '0');
  assert.equal(lab.csvCell(12.5), '12.5');
  assert.equal(lab.csvCell(''), '');
});

test('CSV export has header, per-process rows, and the stamped digest last', () => {
  const brief = lab.briefFor(model, { p: 'pla', l: 45 });
  const rows = lab.csvRows(brief);
  assert.deepEqual(rows[0], ['section', 'item', 'value', 'unit']);
  assert.equal(rows[rows.length - 1][2], brief.digest);
  assert.equal(rows.filter((r) => r[0] === 'process').length, 18);
  assert.ok(lab.toCSV(brief).endsWith('\r\n'));
  assert.equal(lab.toCSV(brief).trim().split(/\r\n/).length, rows.length);
});

/* ---------- frlab hash codec ---------- */

lab.PROCESSES.forEach((p) => {
  test(`codec round-trips state for ${p.key}`, () => {
    const encHash = lab.encodeLabState({ p: p.key, l: 88, t: 2 });
    assert.ok(encHash.startsWith('#frlab='));
    const dec = lab.decodeLabHash(encHash);
    assert.equal(dec.p, p.key);
    assert.equal(dec.l, 88);
    assert.equal(dec.t, 2);
    assert.equal(lab.encodeLabState(dec), encHash);
  });
});

test('codec clamps load into the 5 to 150 N window', () => {
  assert.equal(lab.decodeLabHash(lab.encodeLabState({ p: 'pla', l: 999 })).l, 150);
  assert.equal(lab.decodeLabHash(lab.encodeLabState({ p: 'pla', l: -40 })).l, 5);
  assert.equal(lab.decodeLabHash(lab.encodeLabState({ p: 'pla', l: -0 })).l, 5);
});
test('codec omits t when unset and decodes it as null', () => {
  const h = lab.encodeLabState({ p: 'sla', l: 50 });
  assert.equal(lab.decodeLabHash(h).t, null);
});
test('decodeLabHash accepts a bare frlab= value too', () => {
  const h = lab.encodeLabState({ p: 'petg', l: 70 });
  assert.equal(lab.decodeLabHash(h.slice(1)).p, 'petg');
});

const hostile = [
  ['empty string', ''],
  ['bare hash', '#'],
  ['prefix only', '#frlab='],
  ['wrong prefix', '#other=AAAA'],
  ['bad alphabet', '#frlab=!!!'],
  ['standard base64 chars', '#frlab=+/=='],
  ['length mod 4 equals 1', '#frlab=A'],
  ['json null', '#frlab=' + b64('null')],
  ['json array', '#frlab=' + b64('[1,2]')],
  ['json number', '#frlab=' + b64('42')],
  ['json string', '#frlab=' + b64('"x"')],
  ['bad utf8', '#frlab=' + lab.b64urlEncode(Uint8Array.from([0xff, 0xfe]))],
  ['truncated json', '#frlab=' + b64('{"v":1,"p":"pla"')],
  ['wrong version', '#frlab=' + b64('{"v":2,"p":"pla","l":45}')],
  ['unknown process', '#frlab=' + b64('{"v":1,"p":"zzz","l":45}')],
  ['proto process key', '#frlab=' + b64('{"v":1,"p":"__proto__","l":45}')],
  ['proto payload key', '#frlab=' + b64('{"__proto__":{"z":1},"v":1,"p":"pla","l":45}')],
  ['unknown extra key', '#frlab=' + b64('{"v":1,"p":"pla","l":45,"x":0}')],
  ['missing load', '#frlab=' + b64('{"v":1,"p":"pla"}')],
  ['missing process', '#frlab=' + b64('{"v":1,"l":45}')],
  ['string load', '#frlab=' + b64('{"v":1,"p":"pla","l":"45"}')],
  ['null load', '#frlab=' + b64('{"v":1,"p":"pla","l":null}')],
  ['fractional layer', '#frlab=' + b64('{"v":1,"p":"pla","l":45,"t":1.5}')],
  ['string layer', '#frlab=' + b64('{"v":1,"p":"pla","l":45,"t":"1"}')],
  ['uppercase key', '#frlab=' + b64('{"V":1,"p":"pla","l":45}')],
];
hostile.forEach(([name, hash]) => {
  test(`codec fail-closed on ${name}`, () => {
    assert.equal(lab.decodeLabHash(hash), null);
  });
});
test('decodeLabHash rejects non-string input', () => {
  assert.equal(lab.decodeLabHash(null), null);
  assert.equal(lab.decodeLabHash(42), null);
  assert.equal(lab.decodeLabHash(undefined), null);
});
test('decodeLabHash returns fresh objects, not shared references', () => {
  const h = lab.encodeLabState({ p: 'pla', l: 60 });
  const a = lab.decodeLabHash(h), b = lab.decodeLabHash(h);
  assert.notEqual(a, b);
  assert.deepEqual(a, b);
});

/* ---------- brief digest: parity, cache, tamper ---------- */

test('brief digest is a 64-char lowercase hex string', () => {
  const b = lab.briefFor(model, { p: 'pla', l: 45 });
  assert.match(b.digest, /^[0-9a-f]{64}$/);
});
test('same state returns the identical cached brief object', () => {
  const a = lab.briefFor(model, { p: 'pla', l: 45 });
  const b = lab.briefFor(model, { p: 'pla', l: 45 });
  assert.equal(a, b);
});
test('different states stamp different digests', () => {
  const a = lab.briefFor(model, { p: 'pla', l: 45 });
  const b = lab.briefFor(model, { p: 'petg', l: 45 });
  const c = lab.briefFor(model, { p: 'pla', l: 46 });
  assert.notEqual(a.digest, b.digest);
  assert.notEqual(a.digest, c.digest);
});
test('digest parity across payload stamp, JSON, CSV and Markdown', () => {
  const b = lab.briefFor(model, { p: 'sls', l: 33 });
  assert.equal(b.stamped.sha256, b.digest);
  assert.equal(JSON.parse(b.json).sha256, b.digest);
  const csvDig = b.csv.trim().split(/\r?\n/).pop().split(',')[2];
  assert.equal(csvDig, b.digest);
  assert.equal(b.md.match(/sha256:\s*([0-9a-f]{64})/)[1], b.digest);
});
test('verifyBrief recomputes the digest over canonical JSON', () => {
  const b = lab.briefFor(model, { p: 'alu', l: 100 });
  assert.ok(lab.verifyBrief(b));
});
test('tamperBrief flips one unit and changes the digest', () => {
  const b = lab.briefFor(model, { p: 'pla', l: 45 });
  const t = lab.tamperBrief(b);
  assert.notEqual(t.digest, b.digest);
  const tampered = JSON.parse(t.canonical);
  assert.equal(tampered.state.load_N, 46);
  assert.equal(lab.sha256Hex(t.canonical), t.digest);
});
test('layer selection state t feeds the digest', () => {
  const a = lab.briefFor(model, { p: 'pla', l: 45 });
  const b = lab.briefFor(model, { p: 'pla', l: 45, t: 0 });
  assert.notEqual(a.digest, b.digest);
});
test('brief payload carries measured lug and layer values', () => {
  const b = lab.briefFor(model, { p: 'pla', l: 45 });
  assert.equal(b.payload.lug.bearing_area_mm2, 29.25);
  assert.equal(b.payload.layers.stated_vol_mm3, 9139.7);
  assert.equal(b.payload.processes.length, 6);
  assert.equal(b.payload.selected.key, 'pla');
});

/* ---------- in-page self checks ---------- */

test('selfChecks reports at least 18 checks and every one passes', () => {
  const checks = lab.selfChecks(model);
  assert.ok(checks.length >= 18, `only ${checks.length} checks`);
  const failed = checks.filter((c) => !c.ok);
  assert.deepEqual(failed.map((c) => c.id), []);
});
test('selfChecks entries carry id, name and a boolean flag', () => {
  for (const c of lab.selfChecks(model)) {
    assert.equal(typeof c.id, 'string');
    assert.equal(typeof c.name, 'string');
    assert.equal(typeof c.ok, 'boolean');
  }
});

/* ---------- DOM wiring and file hygiene ---------- */

test('index.html wires every lab hook the UI script needs', () => {
  for (const id of [
    'lab', 'lab-unavail', 'lab-load', 'lab-load-n', 'lab-load-v', 'lab-proc',
    'lab-lug-kv', 'lab-procs', 'lab-proc-rows', 'chart-sf', 'chart-sf-legend',
    'chart-sf-readout', 'chart-z', 'chart-z-readout', 'lab-json', 'lab-csv',
    'lab-md', 'lab-verify', 'lab-tamper', 'lab-tests', 'lab-digest',
    'lab-verify-out', 'lab-test-summary', 'lab-test-list',
  ]) {
    assert.ok(html.includes(`id="${id}"`), `missing id ${id}`);
  }
});
test('lab-ui module is loaded as a module and preloaded with the engine', () => {
  assert.match(html, /<script type="module" src="\.\/assets\/lab-ui\.js"><\/script>/);
  assert.match(html, /<link rel="modulepreload" href="assets\/keyring-lab\.js">/);
  assert.match(html, /<link rel="modulepreload" href="assets\/lab-ui\.js">/);
  assert.match(html, /href="#lab"/);
});
test('lab-ui imports the pure engine and degrades gracefully', () => {
  assert.match(labuiSrc, /from "\.\/keyring-lab\.js"/);
  assert.match(labuiSrc, /catch\(\(err\)|catch \(err\)/);
  assert.match(labuiSrc, /lab-unavail/);
});
test('keyring-lab.js is pure: no DOM, fetch, Date or randomness', () => {
  for (const banned of ['innerHTML', 'outerHTML', 'document.', 'window.', 'fetch(', 'XMLHttpRequest', 'Date(', 'Math.random', 'localStorage']) {
    assert.ok(!src.includes(banned), `keyring-lab.js uses ${banned}`);
  }
});
test('lab grid and table wrappers guard mobile overflow', () => {
  assert.match(css, /\.lab-grid\s*\{[^}]*minmax\(0,\s*1fr\)/);
  assert.match(css, /\.table-wrap\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(css, /@media \(max-width: 1000px\)[\s\S]*\.lab-grid\s*\{[^}]*minmax\(0,\s*1fr\)/);
});
test('new lab files carry no en or em dashes', () => {
  const dash = /[\u2013\u2014]/;
  for (const [name, t] of [['keyring-lab.js', src], ['lab-ui.js', labuiSrc], ['index.html', html]]) {
    assert.ok(!dash.test(t), `${name} contains a unicode dash`);
  }
});
