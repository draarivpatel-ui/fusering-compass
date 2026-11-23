// Wires the DFM and lug-mechanics lab section to the pure engine in keyring-lab.js.
// Degrades gracefully: any failure leaves the rest of the page working.
import { h, svg, num, toast } from "./ui.js";
import * as L from "./keyring-lab.js";

const $ = (s, r = document) => r.querySelector(s);
const PROC_COLOR = {
  pla: "var(--accent)", petg: "var(--color-ink-2)", sla: "var(--color-ok)",
  sls: "var(--color-focus)", alu: "var(--color-flag)", brass: "var(--color-ink)",
};

const fmt = (v, d = 2) => (+v).toFixed(d);

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h("a", { href: url, download: name, style: "display:none" });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function activate(el, fn) {
  el.addEventListener("click", fn);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(e); }
  });
}

async function init() {
  const section = $("#lab");
  if (!section) return;
  const model = await fetch("assets/model.json").then((r) => {
    if (!r.ok) throw new Error(`model.json ${r.status}`);
    return r.json();
  });

  const layers = L.layerMetrics(model);
  const lug = L.lugMetrics(model);
  const state = { p: "pla", l: 45, t: null };

  /* ---------- controls ---------- */
  const loadRange = $("#lab-load"), loadNum = $("#lab-load-n"), procSel = $("#lab-proc");
  for (const p of L.PROCESSES) procSel.append(h("option", { value: p.key, text: p.label }));
  procSel.value = state.p;

  const setLoad = (v, commit = true) => {
    const n = +v;
    if (!Number.isFinite(n)) return;
    state.l = Math.min(L.LOAD_MAX, Math.max(L.LOAD_MIN, n));
    if (commit) commitState(); else render();
  };
  loadRange.addEventListener("input", () => setLoad(loadRange.value));
  loadNum.addEventListener("change", () => setLoad(loadNum.value));
  procSel.addEventListener("change", () => { state.p = procSel.value; commitState(); });

  /* ---------- hash state ---------- */
  const applyHash = () => {
    const s = L.decodeLabHash(location.hash);
    if (s) { state.p = s.p; state.l = s.l; state.t = s.t; }
  };
  applyHash();
  addEventListener("hashchange", () => { applyHash(); render(); });
  function commitState() {
    const enc = L.encodeLabState(state);
    if (enc) history.replaceState(null, "", enc);
    render();
  }

  /* ---------- comparator table ---------- */
  const rowsEl = $("#lab-proc-rows");
  function renderTable(metrics) {
    rowsEl.replaceChildren(...metrics.map((m) => {
      const tr = h("tr", {
        "data-key": m.proc.key, tabindex: "0",
        "aria-selected": m.proc.key === state.p ? "true" : "false",
      },
        h("td", {}, h("span", { class: "proc-swatch", style: `background:${PROC_COLOR[m.proc.key]}` }), " ", m.proc.label),
        h("td", { class: "num", text: fmt(m.massG, 2) }),
        h("td", { class: "num", text: fmt(m.lugArea, 2) }),
        h("td", { class: "num", text: fmt(m.sfBearing, 1) }),
        h("td", { class: "num", text: fmt(m.sfShear, 1) }),
        h("td", { class: "num", text: fmt(m.sfNet, 1) }),
        h("td", {}, h("span", { class: `badge ${m.sf >= 2 ? "ok" : "flag"}`, text: `${fmt(m.sf, 1)} ${m.mode}` })),
        h("td", { class: "num", text: `${fmt(m.minMargin.value, 2)} (${m.minMargin.key})` }),
        h("td", { text: `${m.fidelity.rating} (${fmt(m.fidelity.score, 1)}x)` }));
      activate(tr, () => { state.p = m.proc.key; commitState(); });
      return tr;
    }));
  }

  /* ---------- chart 1: load vs safety factor ---------- */
  const chartSF = $("#chart-sf"), readoutSF = $("#chart-sf-readout");
  const CW = 660, CH = 400, PL = 64, PT = 16, PR = 14, PB = 44;
  const pw = CW - PL - PR, ph = CH - PT - PB;
  const xOf = (load) => PL + ((load - 10) / (150 - 10)) * pw;
  const LOG_MIN = 1, LOG_MAX = 1000;
  const yOf = (sf) => PT + ph - ((Math.log10(Math.max(sf, LOG_MIN)) - 0) / Math.log10(LOG_MAX)) * ph;

  function renderChartSF() {
    const kids = [];
    for (const gy of [1, 10, 100, 1000]) {
      kids.push(svg("line", { x1: PL, x2: CW - PR, y1: yOf(gy), y2: yOf(gy), class: "chart-grid" }));
      kids.push(svg("text", { x: PL - 8, y: yOf(gy) + 4, "text-anchor": "end", class: "chart-tick" }, String(gy)));
    }
    for (const gx of [10, 50, 100, 150]) {
      kids.push(svg("line", { x1: xOf(gx), x2: xOf(gx), y1: PT, y2: PT + ph, class: "chart-grid" }));
      kids.push(svg("text", { x: xOf(gx), y: CH - PB + 18, "text-anchor": "middle", class: "chart-tick" }, `${gx} N`));
    }
    // SF = 1 failure line
    kids.push(svg("line", { x1: PL, x2: CW - PR, y1: yOf(1), y2: yOf(1), class: "chart-fail" }));
    kids.push(svg("text", { x: CW - PR - 4, y: yOf(1) - 6, "text-anchor": "end", class: "chart-fail-label" }, "SF = 1 fails"));

    const series = L.PROCESSES.map((p) => ({ p, pts: L.sweepSF(model, p).map((s) => ({ load: s.load, sf: s.sf, mode: s.mode, x: xOf(s.load), y: yOf(s.sf) })) }));
    const all = series.flatMap((s) => s.pts.map((pt) => ({ pt, proc: s.p })));

    series.forEach((s) => {
      const sel = s.p.key === state.p;
      kids.push(svg("polyline", {
        points: s.pts.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" "),
        fill: "none", style: `stroke:${PROC_COLOR[s.p.key]}`, "stroke-width": sel ? 2.6 : 1.3,
        opacity: sel ? 1 : 0.55, "stroke-linejoin": "round",
      }));
    });
    series.forEach((s) => {
      const sel = s.p.key === state.p;
      s.pts.forEach((pt) => kids.push(svg("circle", {
        cx: pt.x, cy: pt.y, r: sel ? 4 : 2.6,
        style: `stroke:${PROC_COLOR[s.p.key]};fill:${sel ? PROC_COLOR[s.p.key] : "var(--color-paper)"}`,
        "stroke-width": 1.4,
      })));
    });
    // adaptive hit circles: radius capped at half the nearest sibling distance
    all.forEach(({ pt, proc }) => {
      let dmin = Infinity;
      all.forEach((o) => {
        if (o.pt === pt) return;
        dmin = Math.min(dmin, Math.hypot(o.pt.x - pt.x, o.pt.y - pt.y));
      });
      const hitR = Math.min(18, Math.max(1, dmin / 2));
      const hit = svg("circle", {
        cx: pt.x, cy: pt.y, r: hitR.toFixed(2), fill: "rgba(0,0,0,0)",
        class: "chart-hit", tabindex: "0", role: "button",
        "aria-label": `${proc.label} at ${pt.load} N: safety factor ${fmt(pt.sf, 1)}`,
      });
      activate(hit, () => { state.p = proc.key; state.l = pt.load; commitState(); });
      kids.push(hit);
    });
    chartSF.replaceChildren(...kids);

    const m = L.processMetrics(model, L.processByKey(state.p), state.l);
    readoutSF.textContent =
      `${m.proc.label} at ${fmt(state.l, 0)} N: governing SF ${fmt(m.sf, 1)} by ${m.mode} ` +
      `(bearing ${fmt(m.sfBearing, 1)}, tear-out ${fmt(m.sfShear, 1)}, net section ${fmt(m.sfNet, 1)})`;
  }

  /* ---------- chart 2: z-layer profile ---------- */
  const chartZ = $("#chart-z"), readoutZ = $("#chart-z-readout");
  const ZP = { top: 30, bottom: 330 };
  const bars = (metrics) => {
    const sel = L.processByKey(state.p);
    const selM = metrics.find((r) => r.proc.key === state.p);
    const totalMass = selM.massG;
    const share = layers.integratedVolPoly;
    const baseMass = totalMass * (layers.baseVolPoly / share);
    const reliefMass = totalMass * (layers.reliefVolPoly / share);
    return [
      { cluster: "Section area mm2", name: "plate net", value: layers.plateNetPoly, unit: "mm2",
        detail: `plate net ${fmt(layers.plateNetPoly)} mm2 shoelace vs exact ${fmt(layers.plateExact)}` },
      { cluster: "Section area mm2", name: "exposed", value: layers.exposedPoly, unit: "mm2",
        detail: `exposed base at z ${fmt(layers.zBase, 1)}: ${fmt(layers.exposedPoly)} mm2 vs stated ${fmt(layers.exposedExact)}` },
      { cluster: "Section area mm2", name: "relief", value: layers.reliefPoly, unit: "mm2",
        detail: `relief footprint at z ${fmt(layers.zTop, 1)}: ${fmt(layers.reliefPoly)} mm2 vs stated ${fmt(layers.reliefExact)}` },
      { cluster: "Solid volume mm3", name: "base", value: layers.baseVolPoly, unit: "mm3",
        detail: `base plate solid ${fmt(layers.baseVolPoly)} mm3 vs exact ${fmt(layers.baseVolExact)}` },
      { cluster: "Solid volume mm3", name: "relief", value: layers.reliefVolPoly, unit: "mm3",
        detail: `relief solid ${fmt(layers.reliefVolPoly)} mm3 vs exact ${fmt(layers.reliefVolExact)}` },
      { cluster: `Mass g (${sel.label})`, name: "base", value: baseMass, unit: "g",
        detail: `base share ${fmt(baseMass, 2)} g of ${fmt(totalMass, 2)} g ${sel.label}` },
      { cluster: `Mass g (${sel.label})`, name: "relief", value: reliefMass, unit: "g",
        detail: `relief share ${fmt(reliefMass, 2)} g of ${fmt(totalMass, 2)} g ${sel.label}` },
    ];
  };

  function renderChartZ(metrics) {
    const items = bars(metrics);
    const clusters = [...new Set(items.map((b) => b.cluster))];
    const perCluster = clusters.map((c) => items.filter((b) => b.cluster === c));
    const maxes = perCluster.map((g) => Math.max(...g.map((b) => b.value)));
    const barW = 56, gapIn = 26, gapOut = 78;
    const totalW = perCluster.reduce((s, g) => s + g.length * (barW + gapIn) - gapIn, 0) + gapOut * (perCluster.length - 1);
    let x = Math.max(12, (CW - totalW) / 2);
    const kids = [];
    kids.push(svg("line", { x1: 8, x2: CW - 8, y1: ZP.bottom, y2: ZP.bottom, class: "chart-axis" }));
    const placed = [];

    perCluster.forEach((g, ci) => {
      const cmax = maxes[ci];
      const cStart = x;
      g.forEach((b, i) => {
        const hgt = Math.max(2, (b.value / cmax) * (ZP.bottom - ZP.top));
        const bx = x, by = ZP.bottom - hgt;
        const idx = placed.length;
        const hit = svg("rect", {
          x: bx - gapIn / 2, y: ZP.top - 14, width: barW + gapIn, height: ZP.bottom - ZP.top + 14,
          fill: "rgba(0,0,0,0)", class: "chart-hit", tabindex: "0", role: "button",
          "aria-label": `${b.cluster} ${b.name}: ${fmt(b.value, 2)} ${b.unit}`,
        });
        activate(hit, () => { state.t = idx; commitState(); });
        const sel = state.t === idx;
        kids.push(hit);
        kids.push(svg("rect", {
          x: bx, y: by, width: barW, height: hgt,
          class: `chart-bar ${i % 2 ? "relief" : "base"} ${sel ? "sel" : ""}`,
        }));
        placed.push({ b, x: bx + barW / 2, y: by, idx });
        x += barW + gapIn;
      });
      kids.push(svg("text", {
        x: (cStart + x - gapIn) / 2, y: ZP.bottom + 34, "text-anchor": "middle", class: "chart-cluster",
      }, g[0].cluster));
      x += gapOut - gapIn;
    });

    // collision-free value labels: stagger upward when neighbors overlap
    const estW = (s) => s.length * 7.2;
    const levels = placed.map(() => 0);
    for (let i = 1; i < placed.length; i++) {
      const prev = placed[i - 1], cur = placed[i];
      const label = fmt(cur.b.value, cur.b.unit === "g" ? 2 : 0);
      if (Math.abs(cur.x - prev.x) < (estW(label) + estW(fmt(prev.b.value, 0))) / 2 + 6 &&
          Math.abs((cur.y - levels[i] * 14) - (prev.y - levels[i - 1] * 14)) < 14) {
        levels[i] = levels[i - 1] + 1;
      }
    }
    placed.forEach((p, i) => {
      const b = p.b;
      const d = b.unit === "g" ? 2 : 0;
      kids.push(svg("text", {
        x: p.x, y: p.y - 6 - levels[i] * 14, "text-anchor": "middle",
        class: `chart-val ${state.t === i ? "sel" : ""}`,
      }, `${fmt(b.value, d)}`));
      kids.push(svg("text", { x: p.x, y: ZP.bottom + 16, "text-anchor": "middle", class: "chart-tick" }, b.name));
    });
    chartZ.replaceChildren(...kids);

    const sel = state.t != null && items[state.t] ? items[state.t] : null;
    readoutZ.textContent = sel
      ? sel.detail
      : `stated STEP volume ${model.volume_mm3} mm3; integrated ${fmt(layers.integratedVolPoly)} mm3 ` +
        `(${(100 * layers.integratedVolPoly / model.volume_mm3).toFixed(2)}% of stated)`;
  }

  /* ---------- lug readout ---------- */
  function renderLug() {
    const el = $("#lab-lug-kv");
    el.replaceChildren(...[
      ["Lug width at hole", `${fmt(lug.lugWidth)} mm`],
      ["Lug thickness", `${fmt(lug.lugThk)} mm`],
      ["Net section area", `${fmt(lug.netArea)} mm2`],
      ["Tear-out shear area", `${fmt(lug.shearArea)} mm2`],
      ["Bearing area", `${fmt(lug.bearingArea)} mm2`],
      ["Edge distance", `${fmt(lug.edgeDistance)} mm`],
    ].map(([k, v]) => h("div", { class: "lug-cell" }, h("dt", { text: k }), h("dd", { text: v }))));
    $("#chart-sf-legend").replaceChildren(...L.PROCESSES.map((p) =>
      h("span", { class: "chip" }, h("i", { style: `background:${PROC_COLOR[p.key]}` }), p.label)));
  }

  /* ---------- digest + brief ---------- */
  const digestEl = $("#lab-digest"), verifyOut = $("#lab-verify-out");
  function renderDigest() {
    const brief = L.briefFor(model, state);
    digestEl.textContent = `sha256 ${brief.digest}`;
  }

  $("#lab-json").addEventListener("click", () => {
    download("fusering-dfm-brief.json", L.briefFor(model, state).json, "application/json");
    toast("JSON brief downloaded");
  });
  $("#lab-csv").addEventListener("click", () => {
    download("fusering-dfm-brief.csv", L.briefFor(model, state).csv, "text/csv");
    toast("CSV brief downloaded");
  });
  $("#lab-md").addEventListener("click", () => {
    download("fusering-dfm-brief.md", L.briefFor(model, state).md, "text/markdown");
    toast("Markdown brief downloaded");
  });
  $("#lab-verify").addEventListener("click", () => {
    const brief = L.briefFor(model, state);
    const ok = L.verifyBrief(brief);
    verifyOut.textContent = ok
      ? `Verified: recomputed SHA-256 equals the stamped digest ${brief.digest.slice(0, 16)}...`
      : "MISMATCH: the stamped digest does not match the payload";
    verifyOut.className = ok ? "ok-text" : "flag-text";
  });
  $("#lab-tamper").addEventListener("click", () => {
    const brief = L.briefFor(model, state);
    const t = L.tamperBrief(brief);
    verifyOut.textContent =
      `Tamper demo: ${t.field} gives digest ${t.digest.slice(0, 16)}... ` +
      `(stamped ${brief.digest.slice(0, 16)}...): ${t.digest !== brief.digest ? "change detected" : "undetected"}`;
    verifyOut.className = t.digest !== brief.digest ? "ok-text" : "flag-text";
  });

  /* ---------- self tests ---------- */
  function runChecks() {
    const checks = L.selfChecks(model);
    const pass = checks.filter((c) => c.ok).length;
    $("#lab-test-list").replaceChildren(...checks.map((c) =>
      h("li", {},
        h("span", { class: `badge ${c.ok ? "ok" : "flag"}`, text: c.ok ? "pass" : "FAIL" }),
        " ", c.name, c.detail ? h("span", { class: "check-detail", text: ` (${c.detail})` }) : "")));
    $("#lab-test-summary").textContent = `${pass}/${checks.length} deterministic checks pass`;
    return { pass, total: checks.length };
  }
  $("#lab-tests").addEventListener("click", () => {
    const r = runChecks();
    toast(`Self-tests: ${r.pass}/${r.total} pass`);
  });

  /* ---------- render ---------- */
  function render() {
    loadRange.value = state.l;
    loadNum.value = state.l;
    procSel.value = state.p;
    $("#lab-load-v").textContent = `${fmt(state.l, 0)} N`;
    const metrics = L.compareAll(model, state.l);
    renderTable(metrics);
    renderChartSF();
    renderChartZ(metrics);
    renderDigest();
  }

  renderLug();
  render();
  runChecks();
  section.dataset.ready = "1";
}

init().catch((err) => {
  console.warn("DFM lab unavailable:", err);
  const note = $("#lab-unavail");
  if (note) note.hidden = false;
});
