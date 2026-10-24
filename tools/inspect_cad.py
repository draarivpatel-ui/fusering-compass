"""Read the shipped STEP file and write assets/model.json for index.html.

Everything in model.json is measured from the STEP geometry (bounding box, volume, plan outlines,
wall thickness). Nothing here is typed in by hand except the part labels.

Run with a Python that has build123d and shapely installed:  python tools/inspect_cad.py
"""
import json
import math
from pathlib import Path

from build123d import Axis, import_step
from OCP.BRepTools import BRepTools_WireExplorer
from shapely.geometry import LinearRing, Polygon

ROOT = Path(__file__).resolve().parent.parent
STEP = ROOT / "fusering_astrolabe_keyring.step"


def wire_points(wire, arc_steps=48):
    """Ordered polyline for a wire. Straight edges keep their two end points."""
    from build123d import Edge
    exp = BRepTools_WireExplorer(wire.wrapped)
    pts = []
    while exp.More():
        edge = Edge(exp.Current())
        if edge.geom_type.name == "LINE":
            seg = [edge @ 0, edge @ 1]
        else:
            seg = [edge @ (i / arc_steps) for i in range(arc_steps + 1)]
        if pts:
            last = pts[-1]
            if (seg[0] - last).length > (seg[-1] - last).length:
                seg.reverse()
        pts.extend(seg if not pts else seg[1:])
        exp.Next()
    return [[round(p.X, 4), round(p.Y, 4)] for p in pts]


def plan_faces(shape):
    out = []
    for face in shape.faces():
        n = face.normal_at()
        if abs(n.Z) < 0.999 or n.Z < 0:
            continue
        out.append(dict(z=round(face.center().Z, 4),
                        area=round(face.area, 4),
                        outer=wire_points(face.outer_wire()),
                        holes=[wire_points(w) for w in face.inner_wires()]))
    out.sort(key=lambda f: f["z"])
    return out


def bottom_face(shape):
    for face in shape.faces():
        n = face.normal_at()
        if n.Z < -0.999 and abs(face.center().Z) < 1e-6:
            return dict(outer=wire_points(face.outer_wire()),
                        holes=[wire_points(w) for w in face.inner_wires()])


def hole_info(pts):
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return dict(cx=round((min(xs) + max(xs)) / 2, 3), cy=round((min(ys) + max(ys)) / 2, 3),
                diameter=round(max(xs) - min(xs), 3))


def wall_stats(top_face):
    outer = Polygon(top_face["outer"])
    inner = Polygon(top_face["holes"][0])
    ring_o, ring_i = LinearRing(top_face["outer"]), LinearRing(top_face["holes"][0])
    from shapely.geometry import Point
    ds = [ring_i.distance(Point(p)) for p in top_face["outer"]] + [ring_o.distance(Point(p)) for p in top_face["holes"][0]]
    mean = (outer.area - inner.area) / ((outer.exterior.length + inner.exterior.length) / 2)
    return dict(min=round(min(ds), 3), mean=round(mean, 3))


def describe(shape):
    bb = shape.bounding_box()
    return dict(
        bbox_min=[round(bb.min.X, 3), round(bb.min.Y, 3), round(bb.min.Z, 3)],
        bbox_max=[round(bb.max.X, 3), round(bb.max.Y, 3), round(bb.max.Z, 3)],
        size=[round(bb.size.X, 2), round(bb.size.Y, 2), round(bb.size.Z, 2)],
        volume_mm3=round(shape.volume, 1),
        valid=bool(shape.is_valid),
        solids=len(shape.solids()),
        faces=len(shape.faces()),
    )


def main():
    shape = import_step(str(STEP))
    bottom = bottom_face(shape)
    model = dict(file=STEP.name, **describe(shape), plan=plan_faces(shape), bottom=bottom,
                 holes=[hole_info(h) for h in bottom["holes"]],
                 limits_mm=dict(x=80, y=80, z=6, min_hole=5.0))
    (ROOT / "assets" / "model.json").write_text(json.dumps(model))
    print(model["size"], model["volume_mm3"], model["valid"], model["holes"], [f["z"] for f in model["plan"]])


if __name__ == "__main__":
    main()
