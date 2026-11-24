import { createViewer } from "./viewer.js";
import { h, svg, num, kv, tabs, bench } from "./ui.js";

const $ = (s) => document.querySelector(s);

let m = null;
try {
  m = await fetch("assets/model.json").then((r) => r.json());
  const lim = m.limits_mm;
  const hole = m.holes[0];
  const ok = m.valid && m.solids === 1;

  // ---- title block
  $("#tb-size").textContent = `${num(m.size[0], 1)} x ${num(m.size[1], 1)} x ${num(m.size[2], 1)} mm`;
  $("#tb-hole").textContent = hole ? `${num(hole.diameter, 1)} mm` : "none";
  $("#tb-valid").textContent = ok ? "yes, 1 solid" : "check";

  // ---- 3D viewer
  let viewer = null;
  try {
    viewer = await createViewer($("#gl"), {
      meshes: [{ key: "ring", url: "fusering_astrolabe_keyring.stl", color: "--accent" }],
      label: "FuseRing astrolabe keyring",
    });
  } catch (err) {
    console.warn("3D viewer unavailable:", err);
  }
  if (!viewer) {
    ["#views", "#wire", "#hint", "#sep1"].forEach((s) => ($(s).hidden = true));
  } else {
    document.querySelectorAll("#views button").forEach((b) => b.addEventListener("click", () => viewer.frame(b.dataset.view)));
    $("#wire").addEventListener("click", (e) => {
      const on = e.currentTarget.getAttribute("aria-pressed") !== "true";
      e.currentTarget.setAttribute("aria-pressed", on);
      viewer.setWireframe(on);
    });
  }

  // ---- plan view (STEP coordinates, y up, so flip y for SVG)
  const ring = (pts) => "M" + pts.map(([x, y], i) => `${i ? "L" : ""}${x.toFixed(3)} ${(-y).toFixed(3)}`).join(" ") + "Z";
  const planSvg = $("#plan");
  const pad = 6.5, labelRoom = 7;
  const vx = m.bbox_min[0] - pad, vy = -m.bbox_max[1] - pad;
  planSvg.setAttribute("viewBox", `${vx} ${vy} ${m.size[0] + 2 * pad} ${m.size[1] + 2 * pad + labelRoom}`);
  planSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const kids = [];
  if (m.bottom) {
    kids.push(svg("path", { d: [m.bottom.outer, ...m.bottom.holes].map(ring).join(" "), "fill-rule": "evenodd", style: "fill:var(--color-paper-3)", class: "ink", "stroke-width": 1.4, "stroke-linejoin": "round" }));
  }
  m.plan.forEach((s) => kids.push(svg("path", { d: [s.outer, ...s.holes].map(ring).join(" "), "fill-rule": "evenodd", style: "fill:var(--accent-wash);fill-opacity:.85", class: "ink", "stroke-width": 1.2, "stroke-linejoin": "round" })));
  m.holes.forEach((c) => {
    kids.push(svg("circle", { cx: c.cx, cy: -c.cy, r: c.diameter / 2, style: "fill:var(--color-paper)", class: "ink", "stroke-width": 1.4 }));
    kids.push(svg("text", { x: c.cx, y: -c.cy + 8, "text-anchor": "middle", style: "font-size:1.2px" }, `hole ${num(c.diameter, 1)} mm`));
  });
  kids.push(svg("text", { x: (m.bbox_min[0] + m.bbox_max[0]) / 2, y: -m.bbox_min[1] + 5, "text-anchor": "middle", style: "font-size:1.3px" }, `${num(m.size[0], 1)} x ${num(m.size[1], 1)} mm`));
  planSvg.replaceChildren(...kids);

  tabs($("#modes"), { d3: $("#gl"), d2: $("#flat") }, (id) => {
    $("#legend").hidden = id !== "d2";
    $("#hint").hidden = id !== "d3" || !viewer;
    $("#fallback").classList.toggle("show", id === "d3" && !viewer);
    if (viewer) { $("#views").hidden = id !== "d3"; $("#wire").hidden = id !== "d3"; $("#sep1").hidden = id !== "d3"; }
  });

  // ---- limits
  const fitsAll = m.size[0] <= lim.x && m.size[1] <= lim.y && m.size[2] <= lim.z;
  const holeOk = !hole || hole.diameter >= lim.min_hole;

  kv($("#insp-kv"), [
    ["Length X", `${num(m.size[0], 2)} mm`],
    ["Width Y", `${num(m.size[1], 2)} mm`],
    ["Height Z", `${num(m.size[2], 2)} mm`],
    ["Volume", `${num(m.volume_mm3, 1)} mm3`],
    ["Faces", String(m.faces)],
    ["Solids", String(m.solids)],
    ["Key hole", hole ? `${num(hole.diameter, 2)} mm at X ${num(hole.cx, 1)}, Y ${num(hole.cy, 1)}` : "none"],
  ]);
  if (viewer) {
    const st = viewer.stats("ring");
    $("#insp-kv").append(h("dt", { text: "STL triangles" }), h("dd", { text: String(st.triangles) }));
  }
  const badge = (good, label) => h("span", { class: `badge ${good ? "ok" : "flag"}`, text: good ? "OK" : "FLAG" }, "");
  $("#insp-checks").replaceChildren(
    h("li", {}, badge(ok), "STEP is one valid solid"),
    h("li", {}, badge(fitsAll), fitsAll ? `Fits ${lim.x} x ${lim.y} x ${lim.z} mm` : `Exceeds ${lim.x} x ${lim.y} x ${lim.z} mm`),
    h("li", {}, badge(holeOk), holeOk ? `Hole is at least ${num(lim.min_hole, 1)} mm` : `Hole is under ${num(lim.min_hole, 1)} mm`),
  );

  const row = (name, value, limitText, margin, good) => h("tr", {},
    h("td", { text: name }),
    h("td", { class: "num", text: value }),
    h("td", { class: "num", text: limitText }),
    h("td", { class: "num", text: margin }),
    h("td", {}, h("span", { class: `badge ${good ? "ok" : "flag"}`, text: good ? "within" : "over" })));
  $("#limit-rows").replaceChildren(
    row("Length X", `${num(m.size[0], 2)} mm`, `max ${lim.x} mm`, `${num(lim.x - m.size[0], 2)} mm`, m.size[0] <= lim.x),
    row("Width Y", `${num(m.size[1], 2)} mm`, `max ${lim.y} mm`, `${num(lim.y - m.size[1], 2)} mm`, m.size[1] <= lim.y),
    row("Height Z", `${num(m.size[2], 2)} mm`, `max ${lim.z} mm`, `${num(lim.z - m.size[2], 2)} mm`, m.size[2] <= lim.z),
    ...(hole ? [row("Key hole diameter", `${num(hole.diameter, 2)} mm`, `min ${num(lim.min_hole, 1)} mm`, `${num(hole.diameter - lim.min_hole, 2)} mm`, holeOk)] : []),
  );

} catch (err) {
  $("#limits-note").textContent = "Could not load the model data. Serve this folder over HTTP and reload.";
  console.error(err);
}

try {
  // ---- downloads (hashes computed from the served bytes); renders even if the model data above failed
  const groups = [
    { title: "CAD", files: [
      { path: m?.file ?? "fusering_astrolabe_keyring.step", desc: "Keyring solid, STEP" },
      { path: "fusering_astrolabe_keyring.stl", desc: "Mesh for slicers and the viewer" },
    ] },
    { title: "Source", files: [
      { path: "fusering_astrolabe_keyring.svg", desc: "2D astrolabe vector artwork shipped with the CAD" },
      { path: "generate_keyring.py", desc: "build123d script that writes the STEP and STL" },
      { path: "fusering_keyring_cad.png", desc: "Reference render" },
    ] },
  ];
  const manifest = [];
  if (globalThis.crypto?.subtle) {
    await Promise.all(groups.flatMap((g) => g.files).map(async (f) => {
      try {
        const buf = await fetch(f.path).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(f.path))));
        const hex = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map((b) => b.toString(16).padStart(2, "0")).join("");
        manifest.push({ path: f.path, bytes: buf.byteLength, sha256: hex });
      } catch (e) { console.warn("no hash for", f.path); }
    }));
  }
  bench($("#bench"), groups, manifest);
} catch (err) {
  console.error("downloads section:", err);
}
