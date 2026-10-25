import math
from pathlib import Path
from build123d import *

# Both repos are expected to sit side by side in one parent folder.
repos_dir = Path(__file__).resolve().parent.parent
bake_dir = repos_dir / "bakebuild-cutters"
fuse_dir = repos_dir / "fusering-compass"

# 1. Cutter 1: Hexagonal Honeycomb Molecule Cutter (82 x 76 x 18 mm)
with BuildPart() as c1:
    with BuildSketch():
        RegularPolygon(radius=38.0, side_count=6)
    extrude(amount=3.0)
    with BuildSketch():
        RegularPolygon(radius=34.0, side_count=6)
    extrude(amount=18.0)
    with BuildSketch():
        RegularPolygon(radius=33.1, side_count=6)
    extrude(amount=18.0, mode=Mode.SUBTRACT)
    # Inner stamp ring
    with BuildSketch():
        RegularPolygon(radius=22.0, side_count=6)
        RegularPolygon(radius=20.4, side_count=6, mode=Mode.SUBTRACT)
        Rectangle(68.0, 2.4)
    extrude(amount=12.0)
    with BuildSketch():
        RegularPolygon(radius=14.0, side_count=6)
    extrude(amount=18.0, mode=Mode.SUBTRACT)

export_step(c1.part, str(bake_dir / "cutter_1_benzene_ring.step"))
export_stl(c1.part, str(bake_dir / "cutter_1_benzene_ring.stl"))

# 2. Cutter 2: 8-Pointed Compass Star Cookie Cutter (86 x 86 x 18 mm)
with BuildPart() as c2:
    pts_outer_lip = []
    pts_blade_out = []
    pts_blade_in = []
    for i in range(16):
        ang = i * math.pi / 8.0
        r_base = 42.0 if i % 2 == 0 else 25.0
        pts_outer_lip.append(((r_base + 3.2) * math.cos(ang), (r_base + 3.2) * math.sin(ang)))
        pts_blade_out.append((r_base * math.cos(ang), r_base * math.sin(ang)))
        pts_blade_in.append(((r_base - 0.9) * math.cos(ang), (r_base - 0.9) * math.sin(ang)))
    with BuildSketch():
        Polygon(*pts_outer_lip)
    extrude(amount=3.0)
    with BuildSketch():
        Polygon(*pts_blade_out)
    extrude(amount=18.0)
    with BuildSketch():
        Polygon(*pts_blade_in)
    extrude(amount=18.0, mode=Mode.SUBTRACT)

export_step(c2.part, str(bake_dir / "cutter_2_octagram_star.step"))
export_stl(c2.part, str(bake_dir / "cutter_2_octagram_star.stl"))

# 3. Cutter 3: Erlenmeyer Lab Flask Cookie Cutter (74 x 88 x 18 mm)
with BuildPart() as c3:
    outer_pts = [(-14, 42), (14, 42), (14, 22), (35, -34), (32, -40), (-32, -40), (-35, -34), (-14, 22)]
    lip_pts = [(-18, 44), (18, 44), (18, 22), (39, -34), (35, -43), (-35, -43), (-39, -34), (-18, 22)]
    inner_pts = [(-13.1, 41.1), (13.1, 41.1), (13.1, 22), (34.1, -33.8), (31.2, -39.1), (-31.2, -39.1), (-34.1, -33.8), (-13.1, 22)]
    with BuildSketch():
        Polygon(*lip_pts)
    extrude(amount=3.0)
    with BuildSketch():
        Polygon(*outer_pts)
    extrude(amount=18.0)
    with BuildSketch():
        Polygon(*inner_pts)
    extrude(amount=18.0, mode=Mode.SUBTRACT)

export_step(c3.part, str(bake_dir / "cutter_3_erlenmeyer_flask.step"))
export_stl(c3.part, str(bake_dir / "cutter_3_erlenmeyer_flask.stl"))

# Combined 3-cutter plate STEP file
assy = Compound(children=[
    c1.part.located(Location((-95, 0, 0))),
    c2.part.located(Location((0, 0, 0))),
    c3.part.located(Location((95, 0, 0))),
])
export_step(assy, str(bake_dir / "bakebuild_3_cookie_cutters_set.step"))

# 4. FuseRing Keyring: 68mm x 56mm x 4.5mm flat-bottom vector-to-CAD astrolabe keyring with 6.5mm carabiner hole (>= 5mm)
with BuildPart() as fusering:
    # Base plate (Z=0 to Z=3.0mm, completely flat bottom)
    with BuildSketch():
        Circle(radius=27.0)
        with Locations((26.0, 0)):
            Circle(radius=9.5)
    extrude(amount=3.0)
    # Raised vector relief layer (Z=3.0 to Z=4.5mm, total thickness = 4.5mm <= 6mm)
    with BuildSketch(Plane.XY.offset(3.0)):
        Circle(radius=25.5)
        Circle(radius=22.0, mode=Mode.SUBTRACT)
        RegularPolygon(radius=19.0, side_count=8)
        RegularPolygon(radius=15.0, side_count=8, mode=Mode.SUBTRACT)
        Rectangle(44.0, 2.6)
        Rectangle(2.6, 44.0)
        Circle(radius=7.5)
        Circle(radius=4.0, mode=Mode.SUBTRACT)
        with Locations((26.0, 0)):
            Circle(radius=9.5)
    extrude(amount=1.5)
    # Carabiner hole: diameter 6.5mm (>= 5.0mm requirement) through the lug at (26.0, 0)
    with BuildSketch():
        with Locations((26.0, 0)):
            Circle(radius=3.25)
    extrude(amount=10.0, mode=Mode.SUBTRACT)

export_step(fusering.part, str(fuse_dir / "fusering_astrolabe_keyring.step"))
export_stl(fusering.part, str(fuse_dir / "fusering_astrolabe_keyring.stl"))

bb = fusering.part.bounding_box()
print("FuseRing BBox:", bb.size)
print("Done exporting STEP and STL files!")
