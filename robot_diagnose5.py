# -*- coding: utf-8 -*-
"""
Diagnostic 5: CORRECT enum values from Robot API docs.

CORRECTED Robot API enum values:
  I_LRT_NODE_FORCE = 0              (NOT 26!)
  I_LRT_NODE_DISPLACEMENT = 1
  I_LRT_BAR_DILATATION = 2
  I_LRT_BAR_FORCE_CONCENTRATED = 3
  I_LRT_BAR_MOMENT_DISTRIBUTED = 4
  I_LRT_BAR_UNIFORM = 5             (NOT 7!)
  I_LRT_BAR_TRAPEZOIDALE = 6
  I_LRT_DEAD = 7                    (NOT 4!)
  I_LRT_UNIFORM = 26                (surface load)

SetValue indices for I_LRT_BAR_UNIFORM:
  I_BURV_PX = 0, I_BURV_PY = 1, I_BURV_PZ = 2

SetValue indices for I_LRT_NODE_FORCE:
  FX = 0, FY = 1, FZ = 2, MX = 3, MY = 4, MZ = 5

All units SI: N, m, Pa, N/m, N.m
"""
import time, os
import win32com.client.dynamic
import pythoncom

pythoncom.CoInitialize()

# Correct enum values
I_LRT_NODE_FORCE = 0
I_LRT_BAR_UNIFORM = 5
I_LRT_DEAD = 7
I_LT_SUPPORT = 0
I_LT_BAR_SECTION = 3
I_LT_MATERIAL = 8

print("=" * 60)
print("  CORRECTED CANTILEVER TEST")
print("  project.New(3) [2D Frame] + correct enums")
print("=" * 60)

robot = win32com.client.dynamic.Dispatch("Robot.Application")
try: robot.Visible = 1
except: pass

robot.Interactive = 0
try: robot.Project.Close()
except: pass
time.sleep(1)

# Use 2D Frame (type 3) to avoid 3D instabilities
robot.Project.New(3)
time.sleep(2)

project = robot.Project
struct = project.Structure
labels = struct.Labels

# Material from database
print("\n1. Material from database...")
mat = labels.Create(I_LT_MATERIAL, "S355")
md = mat.Data
md.LoadFromDBase("S355")
labels.Store(mat)
E = md.E
print(f"   E = {E} Pa = {E/1e9} GPa")

# Section from database
print("\n2. Section from database...")
sec = labels.Create(I_LT_BAR_SECTION, "CHS_273x10")
sd = sec.Data
sd.LoadFromDBase("CHS 273x10")
sd.MaterialName = "S355"
labels.Store(sec)
A = sd.GetValue(0)
Iy = sd.GetValue(4)
print(f"   A = {A} m^2, Iy = {Iy} m^4")

# Nodes
print("\n3. Creating cantilever beam...")
ns = struct.Nodes
ns.Create(1, 0.0, 0.0, 0.0)
ns.Create(2, 5.0, 0.0, 0.0)

# Bar
bsrv = struct.Bars
bsrv.Create(1, 1, 2)
bar = bsrv.Get(1)
bar.SetLabel(I_LT_BAR_SECTION, "CHS_273x10")
bar.SetLabel(I_LT_MATERIAL, "S355")
print(f"   Bar: sec='{bar.GetLabelName(I_LT_BAR_SECTION)}', mat='{bar.GetLabelName(I_LT_MATERIAL)}'")

# Fixed support at node 1
print("\n4. Fixed support...")
sl = labels.Create(I_LT_SUPPORT, "Fixed")
sld = sl.Data
sld.UX = 1; sld.UY = 1; sld.UZ = 1
sld.RX = 1; sld.RY = 1; sld.RZ = 1
labels.Store(sl)
ns.Get(1).SetLabel(I_LT_SUPPORT, "Fixed")

# ============================================================
# LOAD CASE 1: Self-weight (I_LRT_DEAD = 7)
# ============================================================
print("\n5. Load cases...")
cases = struct.Cases
lc1 = cases.CreateSimple(1, "SelfWeight", 1, 1)
rec1 = lc1.Records.Create(I_LRT_DEAD)  # 7 = self-weight!
rec1.Objects.FromText("all")
print("   LC1: Self-weight (I_LRT_DEAD=7)")

# ============================================================
# LOAD CASE 2: Bar uniform load -10 kN/m = -10000 N/m (I_LRT_BAR_UNIFORM = 5)
# ============================================================
lc2 = cases.CreateSimple(2, "UniformLoad", 1, 1)
rec2 = lc2.Records.Create(I_LRT_BAR_UNIFORM)  # 5 = bar uniform!
rec2.SetValue(2, -10000.0)  # PZ = -10000 N/m = -10 kN/m
rec2.Objects.FromText("1")
print("   LC2: Bar uniform PZ = -10000 N/m (-10 kN/m)")

# ============================================================
# LOAD CASE 3: Node force -100 kN = -100000 N (I_LRT_NODE_FORCE = 0)
# ============================================================
lc3 = cases.CreateSimple(3, "PointLoad", 1, 1)
rec3 = lc3.Records.Create(I_LRT_NODE_FORCE)  # 0 = node force!
rec3.Objects.FromText("2")
rec3.SetValue(2, -100000.0)  # FZ = -100000 N = -100 kN
ot = rec3.Objects.ToText()
print(f"   LC3: Node force FZ = -100000 N (-100 kN), Objects = '{ot}'")

# ============================================================
# CALCULATE
# ============================================================
print("\n6. Calculating...")
calc = project.CalcEngine
calc.GenerateModel()
calc.Calculate()
time.sleep(5)
robot.Interactive = 1

# ============================================================
# RESULTS
# ============================================================
print("\n7. Results:")
avail = struct.Results.Available
print(f"   Available: {avail}")

L = 5.0  # m

for case_id, case_name in [(1, "SelfWeight"), (2, "UniformLoad -10kN/m"), (3, "PointLoad -100kN")]:
    print(f"\n   --- Case {case_id}: {case_name} ---")
    try:
        d = struct.Results.Nodes.Displacements.Value(2, case_id)
        uz = float(d.UZ)
        print(f"   Node 2: UZ = {uz:.6e} m = {uz*1000:.3f} mm")
    except Exception as e:
        print(f"   Displacement error: {e}")
        uz = None

    try:
        r = struct.Results.Nodes.Reactions.Value(1, case_id)
        fz = float(r.FZ)
        my = float(r.MY)
        print(f"   Node 1: FZ = {fz:.1f} N = {fz/1000:.3f} kN")
        print(f"   Node 1: MY = {my:.1f} N.m = {my/1000:.3f} kN.m")
    except Exception as e:
        print(f"   Reaction error: {e}")
        fz = my = None

    try:
        f0 = struct.Results.Bars.Forces.Value(1, case_id, 0)
        f1 = struct.Results.Bars.Forces.Value(1, case_id, 1)
        print(f"   Bar 1 start: FX={float(f0.FX):.1f} FZ={float(f0.FZ):.1f} MY={float(f0.MY):.1f}")
        print(f"   Bar 1 end:   FX={float(f1.FX):.1f} FZ={float(f1.FZ):.1f} MY={float(f1.MY):.1f}")
    except Exception as e:
        print(f"   Member force error: {e}")

# ============================================================
# HAND CALC COMPARISON
# ============================================================
print(f"\n{'='*60}")
print("  HAND CALCULATION COMPARISON")
print(f"{'='*60}")

# CHS 273x10: A=0.00826, Iy=7.154e-5, E=205 GPa
rho_area = 77010 * A  # N/m = weight per meter

print(f"\n  Material: E={E/1e9} GPa, RO=77010 N/m^3")
print(f"  Section: CHS 273x10, A={A} m^2, Iy={Iy} m^4")
print(f"  Self-weight/m = RO*A = {rho_area:.1f} N/m = {rho_area/1000:.3f} kN/m")

# Case 1: Self-weight (q = rho*A = 636 N/m)
q1 = rho_area
print(f"\n  Case 1 (self-weight q={q1:.1f} N/m):")
print(f"    UZ = qL^4/(8EI) = {q1*L**4/(8*E*Iy):.6e} m")
print(f"    FZ = qL = {q1*L:.1f} N")
print(f"    MY = qL^2/2 = {q1*L**2/2:.1f} N.m")

# Case 2: Uniform load q = 10000 N/m
q2 = 10000
print(f"\n  Case 2 (uniform q={q2} N/m = 10 kN/m):")
print(f"    UZ = qL^4/(8EI) = {q2*L**4/(8*E*Iy):.6e} m = {q2*L**4/(8*E*Iy)*1000:.3f} mm")
print(f"    FZ = qL = {q2*L:.1f} N = {q2*L/1000:.1f} kN")
print(f"    MY = qL^2/2 = {q2*L**2/2:.1f} N.m = {q2*L**2/2/1000:.1f} kN.m")

# Case 3: Point load P = 100000 N = 100 kN
P = 100000
print(f"\n  Case 3 (point load P={P} N = 100 kN):")
print(f"    UZ = PL^3/(3EI) = {P*L**3/(3*E*Iy):.6e} m = {P*L**3/(3*E*Iy)*1000:.3f} mm")
print(f"    FZ = P = {P:.1f} N = {P/1000:.1f} kN")
print(f"    MY = PL = {P*L:.1f} N.m = {P*L/1000:.1f} kN.m")

print(f"\n{'='*60}")

pythoncom.CoUninitialize()
