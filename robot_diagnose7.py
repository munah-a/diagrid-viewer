# -*- coding: utf-8 -*-
"""
Diagnostic 7: 3D portal frame (stable structure) — verify no instabilities.
4 columns + 4 beams forming a box at top, all fixed at base.
"""
import time, os, json
import win32com.client.dynamic
import pythoncom

pythoncom.CoInitialize()

I_LRT_NODE_FORCE = 0
I_LRT_BAR_UNIFORM = 5
I_LRT_DEAD = 7
I_LT_SUPPORT = 0
I_LT_BAR_SECTION = 3
I_LT_MATERIAL = 8

print("=" * 60)
print("  3D PORTAL FRAME TEST — no instability expected")
print("=" * 60)

robot = win32com.client.dynamic.Dispatch("Robot.Application")
try: robot.Visible = 1
except: pass

robot.Interactive = 0
try: robot.Project.Close()
except: pass
time.sleep(1)

robot.Project.New(5)  # 3D Frame
time.sleep(2)

project = robot.Project
struct = project.Structure
labels = struct.Labels

# Material
mat = labels.Create(I_LT_MATERIAL, "S355")
mat.Data.LoadFromDBase("S355")
labels.Store(mat)
E = mat.Data.E

# Section
sec = labels.Create(I_LT_BAR_SECTION, "CHS_273x10")
sec.Data.LoadFromDBase("CHS 273x10")
sec.Data.MaterialName = "S355"
labels.Store(sec)
A = sec.Data.GetValue(0)
Iy = sec.Data.GetValue(4)
print(f"  CHS 273x10: A={A}, Iy={Iy}, E={E/1e9} GPa")

# Portal frame: 4 columns (3m high) + 4 beams (5m x 5m top)
#   5--6--7--8  (top, z=3)
#   |        |
#   1--2--3--4  (base, z=0)
# Layout (plan view):
#   1(0,0) -- 2(5,0)
#   |            |
#   4(0,5) -- 3(5,5)
ns = struct.Nodes
# Base (z=0)
ns.Create(1, 0.0, 0.0, 0.0)
ns.Create(2, 5.0, 0.0, 0.0)
ns.Create(3, 5.0, 5.0, 0.0)
ns.Create(4, 0.0, 5.0, 0.0)
# Top (z=3)
ns.Create(5, 0.0, 0.0, 3.0)
ns.Create(6, 5.0, 0.0, 3.0)
ns.Create(7, 5.0, 5.0, 3.0)
ns.Create(8, 0.0, 5.0, 3.0)
print("  8 nodes created")

# Bars: 4 columns + 4 beams
bsrv = struct.Bars
# Columns
bsrv.Create(1, 1, 5)  # col 1-5
bsrv.Create(2, 2, 6)  # col 2-6
bsrv.Create(3, 3, 7)  # col 3-7
bsrv.Create(4, 4, 8)  # col 4-8
# Top beams
bsrv.Create(5, 5, 6)  # beam 5-6
bsrv.Create(6, 6, 7)  # beam 6-7
bsrv.Create(7, 7, 8)  # beam 7-8
bsrv.Create(8, 8, 5)  # beam 8-5

for i in range(1, 9):
    bar = bsrv.Get(i)
    bar.SetLabel(I_LT_BAR_SECTION, "CHS_273x10")
    bar.SetLabel(I_LT_MATERIAL, "S355")
print("  8 bars created (4 cols + 4 beams)")

# Fixed supports at base nodes
sl = labels.Create(I_LT_SUPPORT, "Fixed")
sld = sl.Data
sld.UX = 1; sld.UY = 1; sld.UZ = 1
sld.RX = 1; sld.RY = 1; sld.RZ = 1
labels.Store(sl)
for nid in [1, 2, 3, 4]:
    ns.Get(nid).SetLabel(I_LT_SUPPORT, "Fixed")
print("  4 fixed supports at base")

# Load cases
cases = struct.Cases

# LC1: Self-weight
lc1 = cases.CreateSimple(1, "SelfWeight", 1, 1)
rec1 = lc1.Records.Create(I_LRT_DEAD)
rec1.Objects.FromText("all")
print("  LC1: Self-weight")

# LC2: Uniform load -5 kN/m on top beams
lc2 = cases.CreateSimple(2, "UniformLoad", 1, 1)
rec2 = lc2.Records.Create(I_LRT_BAR_UNIFORM)
rec2.SetValue(2, -5000.0)  # PZ = -5 kN/m in N/m
rec2.Objects.FromText("5 6 7 8")  # top beams only
print("  LC2: Uniform -5 kN/m on top beams")

# LC3: Point load -50 kN at node 5 (corner)
lc3 = cases.CreateSimple(3, "PointLoad", 1, 1)
rec3 = lc3.Records.Create(I_LRT_NODE_FORCE)
rec3.Objects.FromText("5")
rec3.SetValue(2, -50000.0)  # FZ = -50 kN
print(f"  LC3: Point -50 kN at node 5, Objects='{rec3.Objects.ToText()}'")

# LC4: Lateral point load +20 kN in X at node 5
lc4 = cases.CreateSimple(4, "Lateral", 1, 1)
rec4 = lc4.Records.Create(I_LRT_NODE_FORCE)
rec4.Objects.FromText("5")
rec4.SetValue(0, 20000.0)  # FX = +20 kN
print(f"  LC4: Lateral +20 kN X at node 5")

# Calculate
print("\n  Calculating...")
calc = project.CalcEngine
calc.GenerateModel()
calc.Calculate()
time.sleep(5)
robot.Interactive = 1

# Results
print("\n  RESULTS:")
avail = struct.Results.Available
print(f"  Available: {avail}")

for cid, name in [(1,"SelfWeight"), (2,"Uniform"), (3,"PointLoad"), (4,"Lateral")]:
    print(f"\n  Case {cid} ({name}):")
    # Node 5 displacement
    try:
        d = struct.Results.Nodes.Displacements.Value(5, cid)
        print(f"    Node 5: UX={float(d.UX)*1000:.3f}mm UY={float(d.UY)*1000:.3f}mm UZ={float(d.UZ)*1000:.3f}mm")
    except Exception as e:
        print(f"    Disp error: {e}")
    # Reactions at node 1
    try:
        r = struct.Results.Nodes.Reactions.Value(1, cid)
        print(f"    Node 1: FX={float(r.FX)/1000:.3f}kN FY={float(r.FY)/1000:.3f}kN FZ={float(r.FZ)/1000:.3f}kN MY={float(r.MY)/1000:.3f}kN.m")
    except Exception as e:
        print(f"    React error: {e}")
    # Bar 1 (column) forces
    try:
        f0 = struct.Results.Bars.Forces.Value(1, cid, 0)
        print(f"    Bar 1 start: FX={float(f0.FX)/1000:.3f}kN FZ={float(f0.FZ)/1000:.3f}kN MY={float(f0.MY)/1000:.3f}kN.m")
    except Exception as e:
        print(f"    Force error: {e}")

# Check equilibrium for LC3 (point load -50 kN at node 5)
print("\n  Equilibrium check LC3 (P=-50kN at node 5):")
total_fz = 0
for nid in [1, 2, 3, 4]:
    try:
        r = struct.Results.Nodes.Reactions.Value(nid, 3)
        fz = float(r.FZ) / 1000
        total_fz += fz
        print(f"    Node {nid}: FZ={fz:.3f} kN")
    except:
        pass
print(f"    Sum FZ = {total_fz:.3f} kN (should be 50.0 kN)")

print(f"\n{'='*60}")
print("  Check Robot GUI Calculation Messages for warnings")
print(f"{'='*60}")

pythoncom.CoUninitialize()
