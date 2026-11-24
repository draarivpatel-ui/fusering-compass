const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/sheet.css'), 'utf8');
const viewerSrc = fs.readFileSync(path.join(root, 'assets/viewer.js'), 'utf8');
const bootSrc = fs.readFileSync(path.join(root, 'assets/boot.js'), 'utf8');

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

test('ui.js exposes every helper the page imports, plus Home/End tab keys', async () => {
  const src = fs.readFileSync(path.join(root, 'assets/ui.js'), 'utf8');
  const ui = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(src));
  for (const name of ['h', 'svg', 'num', 'mm', 'fmtBytes', 'copy', 'kv', 'tabs', 'bench', 'safePath']) {
    assert.equal(typeof ui[name], 'function', `ui.js missing export ${name}`);
  }
  assert.match(src, /e\.key\s*===\s*"Home"[\s\S]{0,90}"End"/, 'tablist lost Home/End keys');
});

test('download hrefs are confined to same-origin relative paths', async () => {
  const src = fs.readFileSync(path.join(root, 'assets/ui.js'), 'utf8');
  const ui = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(src));
  for (const good of ['fusering_astrolabe_keyring.step', 'assets/model.json', 'gerbers/a-b_c.zip']) {
    assert.equal(ui.safePath(good), good, `safe path rejected: ${good}`);
  }
  for (const bad of ['javascript:window.__x=1', 'https://evil.example/x', '../../etc/passwd', '/abs/path', 'a b.step', 'C:\\tmp\\x', '', '.hidden', null, 42, {}]) {
    assert.equal(ui.safePath(bad), null, `unsafe path allowed: ${JSON.stringify(bad)}`);
  }
});

test('downloads bench renders even when model.json fails to load', () => {
  const firstCatch = bootSrc.indexOf('} catch (err)');
  const secondTry = bootSrc.indexOf('try {', firstCatch);
  const benchCall = bootSrc.indexOf('bench($("#bench")');
  assert.ok(firstCatch > 0, 'model-loading try/catch missing');
  assert.ok(secondTry > firstCatch && benchCall > secondTry, 'bench is still inside the model-loading try');
});

test('notes credit only build123d; hole label stays inside the lug; fallback yields to plan tab', () => {
  const pageCode = html + '\n' + bootSrc;
  assert.ok(!pageCode.includes('and shapely'), 'stale shapely claim still present');
  assert.ok(!pageCode.includes('-c.cy + 13.5'), 'hole label still floats below the lug');
  assert.match(bootSrc, /y:\s*-c\.cy\s*\+\s*8\b/, 'hole label offset changed unexpectedly');
  assert.match(bootSrc, /classList\.toggle\("show",\s*id\s*===\s*"d3"\s*&&\s*!viewer\)/, 'fallback not gated to the 3D tab');
});

test('generator resolves its own directory instead of hardcoding the repo name', () => {
  const gen = fs.readFileSync(path.join(root, 'generate_keyring.py'), 'utf8');
  assert.match(gen, /fuse_dir\s*=\s*Path\(__file__\)/, 'fuse_dir still depends on the directory name');
  assert.ok(!/fuse_dir\s*=\s*repos_dir\s*\/\s*"fusering-compass"/.test(gen));
});

test('3D viewer failure path cannot take the whole page down', () => {
  assert.match(bootSrc, /try\s*\{\s*viewer\s*=\s*await\s+createViewer/, 'createViewer must be called inside try/catch');
  assert.match(bootSrc, /catch\s*\(err\)[\s\S]{0,200}3D viewer unavailable/, 'catch must warn instead of propagating');
});

test('viewer.js falls back instead of rendering black on a missing CSS token', () => {
  assert.match(viewerSrc, /if\s*\(!value\)\s*return\s+new\s+T\.Color\(fallback\)/);
});

test('no innerHTML-style injection sinks anywhere in the page or shared JS', () => {
  const js = fs.readFileSync(path.join(root, 'assets/ui.js'), 'utf8') + viewerSrc + bootSrc;
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
  const pageCode = html + '\n' + bootSrc;
  assert.ok(!pageCode.includes('"-34 -32 76 68"'), 'hardcoded viewBox still present');
  assert.match(pageCode, /m\.bbox_min\[0\]\s*-\s*pad[\s\S]{0,160}viewBox/, 'viewBox no longer derives from model data');
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

test('CSP meta locks the page to self-hosted resources and forbids plugin objects', () => {
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
  assert.ok(m, 'index.html is missing a Content-Security-Policy meta tag');
  for (const d of ["default-src 'none'", "script-src 'self'", "connect-src 'self'", "object-src 'none'", "form-action 'none'"]) {
    assert.ok(m[1].includes(d), 'CSP is missing ' + d);
  }
  const inlineScripts = html.match(/<script>([\s\S]*?)<\/script>/g) || [];
  assert.deepEqual(inlineScripts, [], 'inline scripts are forbidden by script-src self');
  const staticSrcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((s) => s[1]);
  assert.ok(staticSrcs.length >= 2, 'expected module script tags for boot and lab-ui');
  for (const src of staticSrcs) {
    assert.ok(!/^https?:\/\//.test(src) && !src.startsWith('//'), 'script ' + src + ' is outside the self-only CSP script-src');
  }
  const inlineHandlers = html.match(/\son[a-z]+\s*=/g) || [];
  assert.deepEqual(inlineHandlers, [], 'CSP cannot express inline handler permissions');
});

test('boot module exists as a self-hosted file and carries the extracted page script', () => {
  assert.match(bootSrc, /from "\.\/viewer\.js"/, 'boot.js must import viewer.js relative to assets/');
  assert.match(bootSrc, /from "\.\/ui\.js"/, 'boot.js must import ui.js relative to assets/');
  assert.match(html, /<script type="module" src="\.\/assets\/boot\.js"><\/script>/, 'index.html must load assets/boot.js');
  assert.match(html, /<link rel="modulepreload" href="assets\/boot\.js">/, 'index.html must modulepreload assets/boot.js');
});
