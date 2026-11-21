const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/sheet.css'), 'utf8');
const viewerSrc = fs.readFileSync(path.join(root, 'assets/viewer.js'), 'utf8');

const TEXT_EXT = new Set(['.md', '.html', '.css', '.js', '.py', '.csv', '.json', '.svg', '.txt', '.step', '.ino']);
function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules' || e.name === 'tests' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (TEXT_EXT.has(path.extname(e.name).toLowerCase())) yield p;
  }
}

test('repo text files contain no em/en dashes, AI mentions, smooth scroll, or vendor-prefixed placeholders', () => {
  const dash = /[\u2013\u2014]/;
  const ai = /\b(claude|anthropic|openai|chatgpt|gpt-\d|copilot|devin|swe-2|codex)\b|ai-generated/i;
  const secret = /(tskey-|ghp_|github_pat_|AKIA|xox[baprs]-|gsk_|nvapi-|tvly-|AIza[0-9A-Za-z]|sk-[a-zA-Z0-9]{8,})/;
  const bad = [];
  for (const f of walk(root)) {
    const t = fs.readFileSync(f, 'utf8');
    const rel = path.relative(root, f);
    if (dash.test(t)) bad.push(`${rel}: en/em dash`);
    if (ai.test(t)) bad.push(`${rel}: AI mention`);
    if (/scroll-behavior\s*:\s*smooth/.test(t)) bad.push(`${rel}: scroll-behavior smooth`);
    if (secret.test(t)) bad.push(`${rel}: vendor-prefixed placeholder`);
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('ui.js number formatting handles edge inputs', async () => {
  const src = fs.readFileSync(path.join(root, 'assets/ui.js'), 'utf8');
  const ui = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(src));
  assert.equal(ui.mm(62.5, 1), '62.5 mm');
  assert.equal(ui.mm(4.5, 2), '4.5 mm');
  assert.equal(ui.mm('54.0', 1), '54 mm');
  assert.equal(ui.num(6.5, 1), '6.5');
  assert.equal(ui.fmtBytes(0), '0 B');
  assert.equal(ui.fmtBytes(1023), '1023 B');
  assert.equal(ui.fmtBytes(1024), '1.0 KB');
  assert.equal(ui.fmtBytes(1048576), '1.00 MB');
  assert.equal(ui.fmtBytes(3896), '3.8 KB');
});

test('3D viewer failure path cannot take the whole page down', () => {
  assert.match(html, /try\s*\{\s*viewer\s*=\s*await\s+createViewer/, 'createViewer must be called inside try/catch');
  assert.match(html, /catch\s*\(err\)[\s\S]{0,200}3D viewer unavailable/, 'catch must warn instead of propagating');
});

test('viewer.js falls back instead of rendering black on a missing CSS token', () => {
  assert.match(viewerSrc, /if\s*\(!value\)\s*return\s+new\s+T\.Color\(fallback\)/);
});

test('no innerHTML-style injection sinks anywhere in the page or shared JS', () => {
  const js = fs.readFileSync(path.join(root, 'assets/ui.js'), 'utf8') + viewerSrc;
  for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write']) {
    assert.ok(!html.includes(sink) && !js.includes(sink), `found ${sink}`);
  }
  assert.ok(!/href\s*=\s*["']?\s*javascript:/i.test(html), 'javascript: href present');
});

test('2D plan svg is not touch-locked (mobile users can scroll over it)', () => {
  assert.ok(!/\.canvas\s+svg\s*\{[^}]*touch-action\s*:\s*none/.test(css), '.canvas svg still sets touch-action:none');
  assert.match(css, /\.canvas\s+\.gl\s+canvas\s*\{[^}]*touch-action\s*:\s*none/, 'WebGL canvas lost its own touch lock');
});

test('plan viewBox is computed from the measured bounding box', () => {
  assert.ok(!html.includes('"-34 -32 76 68"'), 'hardcoded viewBox still present');
  assert.match(html, /m\.bbox_min\[0\]\s*-\s*pad[\s\S]{0,160}viewBox/, 'viewBox no longer derives from model data');
});

test('model.json measurements stay inside the stated limits', () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, 'assets/model.json'), 'utf8'));
  assert.equal(m.valid, true);
  assert.equal(m.solids, 1);
  assert.ok(m.size[0] <= m.limits_mm.x && m.size[1] <= m.limits_mm.y && m.size[2] <= m.limits_mm.z, 'size exceeds limits');
  assert.ok(m.holes.length >= 1 && m.holes[0].diameter >= m.limits_mm.min_hole, 'hole under minimum');
  assert.ok(Array.isArray(m.plan) && m.plan.length > 0 && m.bottom && m.bottom.outer.length > 2);
  assert.equal(m.file, 'fusering_astrolabe_keyring.step');
});

test('generator only writes sibling-repo cutter files when that repo is checked out', () => {
  const gen = fs.readFileSync(path.join(root, 'generate_keyring.py'), 'utf8');
  const guard = gen.indexOf('if bake_dir.is_dir():');
  const keyring = gen.indexOf('export_step(fusering.part');
  assert.ok(guard > 0, 'bakebuild sections are not guarded');
  assert.ok(keyring > guard, 'keyring export must be outside the guard');
  assert.ok(gen.indexOf('bakebuild-cutters') < guard, 'sibling path defined after guard');
  for (const marker of ['cutter_1_benzene_ring', 'cutter_2_octagram_star', 'cutter_3_erlenmeyer_flask', 'bakebuild_3_cookie_cutters_set']) {
    const i = gen.indexOf(marker);
    assert.ok(i > guard && i < keyring, `${marker} escaped the sibling-repo guard`);
  }
});

test('python tools stay syntactically valid', () => {
  const { execFileSync } = require('node:child_process');
  for (const rel of ['generate_keyring.py', 'tools/inspect_cad.py']) {
    assert.doesNotThrow(() => execFileSync('python3', ['-m', 'py_compile', path.join(root, rel)]), `${rel} failed py_compile`);
  }
});
