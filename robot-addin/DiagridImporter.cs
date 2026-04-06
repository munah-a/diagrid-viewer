// DiagridImporter - Robot Structural Analysis Add-in
// Reads diagrid model JSON and creates full Robot model including cladding panels.
//
// Build: run build.bat
// Install: copy DiagridImporter.exe to a known location,
//          then run from Robot via Tools > External Tools or directly.

using System;
using System.Collections.Generic;
using System.IO;
using System.Windows.Forms;
using RobotOM;

namespace DiagridImporter
{
    // ================================================================
    // JSON Data Model (simple manual parser - no external dependencies)
    // ================================================================
    public class DiagridNode { public int id; public double x, y, z; }
    public class DiagridBeam { public int id, node_start, node_end; }
    public class DiagridSection { public double D, t; }
    public class DiagridMaterial { public double E, rho, G; }
    public class DiagridSupport { public string type; public string dir; }
    public class DiagridPointLoad { public double fx, fy, fz, mx, my, mz; }
    public class DiagridTriangle { public int a, b, c; public double nx, ny, nz, area; }

    public class DiagridLoadCase
    {
        public int id;
        public string name, nature;
        public bool selfWeight;
        public double liveLoadIntensity, windPressure;
        public string windDir;
        public Dictionary<int, DiagridPointLoad> pointLoads = new Dictionary<int, DiagridPointLoad>();
    }

    public class DiagridModel
    {
        public string version;
        public DiagridNode[] nodes;
        public DiagridBeam[] beams;
        public DiagridSection globalSection;
        public Dictionary<int, DiagridSection> beamSections = new Dictionary<int, DiagridSection>();
        public DiagridMaterial material;
        public Dictionary<int, DiagridSupport> supports = new Dictionary<int, DiagridSupport>();
        public DiagridLoadCase[] loadCases;
        public DiagridTriangle[] envelopeTriangles;
    }

    // ================================================================
    // Main Program
    // ================================================================
    class Program
    {
        static IRobotApplication robot;
        static IRobotStructure structure;
        static IRobotLabelServer labels;
        static Dictionary<int, int> nodeIdMap = new Dictionary<int, int>(); // model ID -> Robot ID

        [STAThread]
        static void Main(string[] args)
        {
            // File picker
            string jsonPath;
            if (args.Length > 0 && File.Exists(args[0]))
            {
                jsonPath = args[0];
            }
            else
            {
                var dlg = new OpenFileDialog
                {
                    Title = "Select Diagrid Model JSON",
                    Filter = "JSON files (*.json)|*.json|All files (*.*)|*.*",
                    InitialDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads")
                };
                if (dlg.ShowDialog() != DialogResult.OK) return;
                jsonPath = dlg.FileName;
            }

            Console.WriteLine("============================================================");
            Console.WriteLine("  Diagrid Importer for Robot Structural Analysis");
            Console.WriteLine("============================================================");

            // Parse JSON
            Console.WriteLine("\nReading: " + jsonPath);
            DiagridModel model;
            try
            {
                string json = File.ReadAllText(jsonPath);
                model = JsonParser.Parse(json);
                Console.WriteLine("  Nodes: " + model.nodes.Length);
                Console.WriteLine("  Beams: " + model.beams.Length);
                Console.WriteLine("  Supports: " + model.supports.Count);
                Console.WriteLine("  Load cases: " + (model.loadCases != null ? model.loadCases.Length : 0));
                Console.WriteLine("  Envelope triangles: " + (model.envelopeTriangles != null ? model.envelopeTriangles.Length : 0));
            }
            catch (Exception ex)
            {
                Console.WriteLine("ERROR parsing JSON: " + ex.Message);
                Console.ReadKey();
                return;
            }

            // Connect to Robot
            Console.WriteLine("\nConnecting to Robot...");
            try
            {
                robot = new RobotApplication();
                robot.Visible = 1;
                robot.Interactive = 0;
                robot.Project.New(IRobotProjectType.I_PT_FRAME_3D);
                structure = robot.Project.Structure;
                labels = structure.Labels;
                Console.WriteLine("  Connected. New 3D frame project created.");
            }
            catch (Exception ex)
            {
                Console.WriteLine("ERROR: Could not connect to Robot.\n" + ex.Message);
                Console.ReadKey();
                return;
            }

            try
            {
                CreateMaterial(model);
                CreateSections(model);
                CreateNodes(model);
                CreateBars(model);
                CreateSupports(model);
                CreateLoadCases(model);

                if (model.envelopeTriangles != null && model.envelopeTriangles.Length > 0)
                    CreatePanels(model);

                // Export results path
                string resultsPath = Path.Combine(
                    Path.GetDirectoryName(jsonPath),
                    "robot_results.json");

                Console.WriteLine("\n============================================================");
                Console.WriteLine("  Model created successfully!");
                Console.WriteLine("  Run analysis in Robot, then use Export Results.");
                Console.WriteLine("============================================================");
            }
            catch (Exception ex)
            {
                Console.WriteLine("\nERROR: " + ex.Message + "\n" + ex.StackTrace);
            }
            finally
            {
                robot.Interactive = 1;
            }

            Console.WriteLine("\nPress Enter to exit...");
            try { Console.ReadLine(); } catch { }
        }

        // ================================================================
        // Material
        // ================================================================
        static string materialName = "S355";

        static void CreateMaterial(DiagridModel model)
        {
            Console.WriteLine("\nCreating material...");
            try
            {
                IRobotLabel matLabel = labels.Create(IRobotLabelType.I_LT_MATERIAL, materialName);
                IRobotMaterialData mat = (IRobotMaterialData)matLabel.Data;
                mat.Type = IRobotMaterialType.I_MT_STEEL;
                mat.E = model.material.E * 1e9;   // GPa -> Pa (in-process COM uses Pa)
                mat.NU = 0.3;
                mat.RO = model.material.rho;
                mat.LX = 1.2e-5;
                mat.Kirchoff = model.material.G > 0
                    ? model.material.G * 1e9
                    : model.material.E * 1e9 / 2.6;
                mat.RE = 355e6;                    // 355 MPa in Pa
                mat.RT = 510e6;                    // 510 MPa in Pa
                labels.Store(matLabel);
                Console.WriteLine("  Material: " + materialName + " (E=" + model.material.E + " GPa)");
            }
            catch (Exception ex)
            {
                Console.WriteLine("  Warning: " + ex.Message + ". Using default STEEL.");
                materialName = "STEEL";
            }
        }

        // ================================================================
        // Sections
        // ================================================================
        static Dictionary<string, string> sectionNames = new Dictionary<string, string>();

        static string EnsureSection(double D_mm, double t_mm)
        {
            string name = "CHS " + D_mm.ToString("F1") + "x" + t_mm.ToString("F1");
            if (sectionNames.ContainsKey(name)) return sectionNames[name];

            try
            {
                IRobotLabel secLabel = labels.Create(IRobotLabelType.I_LT_BAR_SECTION, name);
                IRobotBarSectionData sec = (IRobotBarSectionData)secLabel.Data;
                sec.ShapeType = IRobotBarSectionShapeType.I_BSST_USER_TUBE;
                IRobotBarSectionNonstdData nonstd = sec.CreateNonstd(0);
                nonstd.SetValue(IRobotBarSectionNonstdDataValue.I_BSNDV_TUBE_D, D_mm / 1000.0);
                nonstd.SetValue(IRobotBarSectionNonstdDataValue.I_BSNDV_TUBE_T, t_mm / 1000.0);
                sec.CalcNonstdGeometry();
                labels.Store(secLabel);
                sectionNames[name] = name;
                Console.WriteLine("  Section: " + name);
            }
            catch (Exception ex)
            {
                Console.WriteLine("  Warning: section " + name + ": " + ex.Message);
                sectionNames[name] = name;
            }
            return sectionNames[name];
        }

        static void CreateSections(DiagridModel model)
        {
            Console.WriteLine("\nCreating sections...");
            EnsureSection(model.globalSection.D, model.globalSection.t);
            foreach (var kv in model.beamSections)
                EnsureSection(kv.Value.D, kv.Value.t);
        }

        // ================================================================
        // Nodes
        // ================================================================
        static void CreateNodes(DiagridModel model)
        {
            Console.WriteLine("\nCreating " + model.nodes.Length + " nodes...");
            IRobotNodeServer nodeSrv = structure.Nodes;
            foreach (var n in model.nodes)
            {
                int rid = n.id + 1;
                nodeIdMap[n.id] = rid;
                nodeSrv.Create(rid, n.x, n.y, n.z);
            }
        }

        // ================================================================
        // Bars
        // ================================================================
        static void CreateBars(DiagridModel model)
        {
            Console.WriteLine("\nCreating " + model.beams.Length + " bars...");
            IRobotBarServer barSrv = structure.Bars;
            string globalSecName = "CHS " + model.globalSection.D.ToString("F1") + "x" + model.globalSection.t.ToString("F1");

            for (int idx = 0; idx < model.beams.Length; idx++)
            {
                var b = model.beams[idx];
                int rid = b.id + 1;
                int ns = nodeIdMap[b.node_start];
                int ne = nodeIdMap[b.node_end];
                barSrv.Create(rid, ns, ne);

                IRobotBar bar = (IRobotBar)barSrv.Get(rid);
                string secName = globalSecName;
                if (model.beamSections.ContainsKey(idx))
                {
                    var bs = model.beamSections[idx];
                    secName = "CHS " + bs.D.ToString("F1") + "x" + bs.t.ToString("F1");
                }
                bar.SetLabel(IRobotLabelType.I_LT_BAR_SECTION, secName);
                bar.SetLabel(IRobotLabelType.I_LT_MATERIAL, materialName);
            }
        }

        // ================================================================
        // Supports
        // ================================================================
        static void CreateSupports(DiagridModel model)
        {
            Console.WriteLine("\nCreating " + model.supports.Count + " supports...");
            HashSet<string> created = new HashSet<string>();
            IRobotNodeServer nodeSrv = structure.Nodes;

            foreach (var kv in model.supports)
            {
                int nid = kv.Key;
                var sup = kv.Value;
                string dir = sup.dir != null ? sup.dir : "z";
                string supName = sup.type == "fixed" ? "Fixed" :
                                 sup.type == "pinned" ? "Pinned" :
                                 "Roller_" + dir;

                if (!created.Contains(supName))
                {
                    try
                    {
                        IRobotLabel sl = labels.Create(IRobotLabelType.I_LT_SUPPORT, supName);
                        IRobotNodeSupportData sd = (IRobotNodeSupportData)sl.Data;
                        if (sup.type == "fixed")
                        {
                            sd.UX = 1; sd.UY = 1; sd.UZ = 1;
                            sd.RX = 1; sd.RY = 1; sd.RZ = 1;
                        }
                        else if (sup.type == "pinned")
                        {
                            sd.UX = 1; sd.UY = 1; sd.UZ = 1;
                        }
                        else // roller
                        {
                            string rollerDir = sup.dir != null ? sup.dir : "z";
                            sd.UX = rollerDir == "x" ? 1 : 0;
                            sd.UY = rollerDir == "y" ? 1 : 0;
                            sd.UZ = rollerDir == "z" ? 1 : 0;
                        }
                        labels.Store(sl);
                        created.Add(supName);
                    }
                    catch { created.Add(supName); }
                }

                if (nodeIdMap.ContainsKey(nid))
                {
                    IRobotNode node = (IRobotNode)nodeSrv.Get(nodeIdMap[nid]);
                    node.SetLabel(IRobotLabelType.I_LT_SUPPORT, supName);
                }
            }
        }

        // ================================================================
        // Load Cases
        // ================================================================
        static void CreateLoadCases(DiagridModel model)
        {
            if (model.loadCases == null || model.loadCases.Length == 0) return;
            Console.WriteLine("\nCreating " + model.loadCases.Length + " load cases...");
            IRobotCaseServer cases = structure.Cases;

            foreach (var lc in model.loadCases)
            {
                IRobotCaseNature nature;
                switch (lc.nature)
                {
                    case "live": nature = IRobotCaseNature.I_CN_EXPLOATATION; break;
                    case "wind": nature = IRobotCaseNature.I_CN_WIND; break;
                    case "custom": nature = IRobotCaseNature.I_CN_ACCIDENTAL; break;
                    default: nature = IRobotCaseNature.I_CN_PERMANENT; break;
                }

                IRobotSimpleCase sc = (IRobotSimpleCase)cases.CreateSimple(
                    lc.id, lc.name, nature,
                    IRobotCaseAnalizeType.I_CAT_STATIC_LINEAR);

                // Self-weight
                if (lc.selfWeight)
                {
                    IRobotLoadRecord2 rec = (IRobotLoadRecord2)sc.Records.Create(
                        IRobotLoadRecordType.I_LRT_DEAD);
                    rec.SetValue(0, -1.0); // factor
                    rec.Objects.FromText("all");
                }

                // Live load (uniform on all bars)
                if (lc.liveLoadIntensity > 0)
                {
                    IRobotLoadRecord2 rec = (IRobotLoadRecord2)sc.Records.Create(
                        IRobotLoadRecordType.I_LRT_BAR_UNIFORM);
                    rec.SetValue(2, -lc.liveLoadIntensity); // FZ
                    rec.Objects.FromText("all");
                }

                // Point loads
                foreach (var pl in lc.pointLoads)
                {
                    if (!nodeIdMap.ContainsKey(pl.Key)) continue;
                    IRobotLoadRecord2 rec = (IRobotLoadRecord2)sc.Records.Create(
                        IRobotLoadRecordType.I_LRT_NODE_FORCE);
                    rec.SetValue(0, pl.Value.fx);
                    rec.SetValue(1, pl.Value.fy);
                    rec.SetValue(2, pl.Value.fz);
                    rec.SetValue(3, pl.Value.mx);
                    rec.SetValue(4, pl.Value.my);
                    rec.SetValue(5, pl.Value.mz);
                    rec.Objects.AddOne(nodeIdMap[pl.Key]);
                }

                Console.WriteLine("  Load case: " + lc.name + " (id=" + lc.id + ")");
            }
        }

        // ================================================================
        // Panels (Cladding) - from CFD envelope triangles
        // ================================================================
        static void CreatePanels(DiagridModel model)
        {
            Console.WriteLine("\nCreating " + model.envelopeTriangles.Length + " cladding panels...");

            // Create thickness label
            try
            {
                IRobotLabel thLabel = labels.Create(IRobotLabelType.I_LT_PANEL_THICKNESS, "Cladding_1mm");
                IRobotThicknessData thData = (IRobotThicknessData)thLabel.Data;
                thData.ThicknessType = IRobotThicknessType.I_TT_HOMOGENEOUS;
                thData.MaterialName = materialName;
                IRobotThicknessHomoData homo = (IRobotThicknessHomoData)thData.Data;
                homo.ThickConst = 0.001; // 1mm
                labels.Store(thLabel);
            }
            catch (Exception ex)
            {
                Console.WriteLine("  Warning: thickness label: " + ex.Message);
            }

            IRobotObjObjectServer objects = structure.Objects;
            int panelId = 10000; // Start panel IDs high to avoid conflicts with bars
            int created = 0;

            // Build node coordinate lookup
            Dictionary<int, DiagridNode> nodeById = new Dictionary<int, DiagridNode>();
            foreach (var n in model.nodes) nodeById[n.id] = n;

            foreach (var tri in model.envelopeTriangles)
            {
                try
                {
                    panelId++;

                    // Get triangle vertex coordinates
                    var na = nodeById[tri.a];
                    var nb = nodeById[tri.b];
                    var nc = nodeById[tri.c];

                    // Create RobotPointsArray with 3 vertices
                    RobotPointsArray pts = new RobotPointsArray();
                    pts.SetSize(3);
                    pts.Set(1, na.x, na.y, na.z);
                    pts.Set(2, nb.x, nb.y, nb.z);
                    pts.Set(3, nc.x, nc.y, nc.z);

                    // Create panel from points array
                    objects.CreateContour(panelId, pts);

                    // Assign thickness via selection
                    RobotSelection sel = structure.Selections.Create(IRobotObjectType.I_OT_OBJECT);
                    sel.AddOne(panelId);
                    objects.SetLabel(sel, IRobotLabelType.I_LT_PANEL_THICKNESS, "Cladding_1mm");

                    created++;
                }
                catch (Exception ex)
                {
                    if (created == 0) Console.WriteLine("  Panel error: " + ex.Message);
                }
            }
            Console.WriteLine("  Created " + created + "/" + model.envelopeTriangles.Length + " panels");
        }
    }

    // ================================================================
    // Simple JSON Parser (no external dependencies)
    // ================================================================
    static class JsonParser
    {
        public static DiagridModel Parse(string json)
        {
            var model = new DiagridModel();

            // Use .NET's built-in JavaScriptSerializer
            var serializer = new System.Web.Script.Serialization.JavaScriptSerializer();
            serializer.MaxJsonLength = int.MaxValue;
            var dict = serializer.Deserialize<Dictionary<string, object>>(json);

            model.version = dict.ContainsKey("version") ? dict["version"].ToString() : "1.0";

            // Nodes
            var nodesList = (System.Collections.ArrayList)dict["nodes"];
            model.nodes = new DiagridNode[nodesList.Count];
            for (int i = 0; i < nodesList.Count; i++)
            {
                var nd = (Dictionary<string, object>)nodesList[i];
                model.nodes[i] = new DiagridNode
                {
                    id = Convert.ToInt32(nd["id"]),
                    x = Convert.ToDouble(nd["x"]),
                    y = Convert.ToDouble(nd["y"]),
                    z = Convert.ToDouble(nd["z"])
                };
            }

            // Beams
            var beamsList = (System.Collections.ArrayList)dict["beams"];
            model.beams = new DiagridBeam[beamsList.Count];
            for (int i = 0; i < beamsList.Count; i++)
            {
                var bd = (Dictionary<string, object>)beamsList[i];
                model.beams[i] = new DiagridBeam
                {
                    id = Convert.ToInt32(bd["id"]),
                    node_start = Convert.ToInt32(bd["node_start"]),
                    node_end = Convert.ToInt32(bd["node_end"])
                };
            }

            // Global section
            var gs = (Dictionary<string, object>)dict["globalSection"];
            model.globalSection = new DiagridSection
            {
                D = Convert.ToDouble(gs["D"]),
                t = Convert.ToDouble(gs["t"])
            };

            // Beam sections
            if (dict.ContainsKey("beamSections"))
            {
                var bs = (Dictionary<string, object>)dict["beamSections"];
                foreach (var kv in bs)
                {
                    var sd = (Dictionary<string, object>)kv.Value;
                    model.beamSections[int.Parse(kv.Key)] = new DiagridSection
                    {
                        D = Convert.ToDouble(sd["D"]),
                        t = Convert.ToDouble(sd["t"])
                    };
                }
            }

            // Material
            var mt = (Dictionary<string, object>)dict["material"];
            model.material = new DiagridMaterial
            {
                E = Convert.ToDouble(mt["E"]),
                rho = Convert.ToDouble(mt["rho"]),
                G = Convert.ToDouble(mt["G"])
            };

            // Supports
            if (dict.ContainsKey("supports"))
            {
                var sp = (Dictionary<string, object>)dict["supports"];
                foreach (var kv in sp)
                {
                    var sd = (Dictionary<string, object>)kv.Value;
                    model.supports[int.Parse(kv.Key)] = new DiagridSupport
                    {
                        type = sd["type"].ToString(),
                        dir = sd.ContainsKey("dir") && sd["dir"] != null ? sd["dir"].ToString() : null
                    };
                }
            }

            // Load cases
            if (dict.ContainsKey("loadCases"))
            {
                var lcs = (System.Collections.ArrayList)dict["loadCases"];
                model.loadCases = new DiagridLoadCase[lcs.Count];
                for (int i = 0; i < lcs.Count; i++)
                {
                    var ld = (Dictionary<string, object>)lcs[i];
                    var lc = new DiagridLoadCase
                    {
                        id = Convert.ToInt32(ld["id"]),
                        name = ld["name"].ToString(),
                        nature = ld["nature"].ToString(),
                        selfWeight = ld.ContainsKey("selfWeight") && Convert.ToBoolean(ld["selfWeight"]),
                        liveLoadIntensity = ld.ContainsKey("liveLoadIntensity") ? Convert.ToDouble(ld["liveLoadIntensity"]) : 0,
                        windPressure = ld.ContainsKey("windPressure") ? Convert.ToDouble(ld["windPressure"]) : 0,
                        windDir = ld.ContainsKey("windDir") ? ld["windDir"].ToString() : "x"
                    };

                    if (ld.ContainsKey("pointLoads"))
                    {
                        var pls = (Dictionary<string, object>)ld["pointLoads"];
                        foreach (var pk in pls)
                        {
                            var pv = (Dictionary<string, object>)pk.Value;
                            lc.pointLoads[int.Parse(pk.Key)] = new DiagridPointLoad
                            {
                                fx = Convert.ToDouble(pv["fx"]),
                                fy = Convert.ToDouble(pv["fy"]),
                                fz = Convert.ToDouble(pv["fz"]),
                                mx = Convert.ToDouble(pv["mx"]),
                                my = Convert.ToDouble(pv["my"]),
                                mz = Convert.ToDouble(pv["mz"])
                            };
                        }
                    }
                    model.loadCases[i] = lc;
                }
            }

            // Envelope triangles
            if (dict.ContainsKey("envelope"))
            {
                var env = (Dictionary<string, object>)dict["envelope"];
                if (env.ContainsKey("triangles"))
                {
                    var tris = (System.Collections.ArrayList)env["triangles"];
                    model.envelopeTriangles = new DiagridTriangle[tris.Count];
                    for (int i = 0; i < tris.Count; i++)
                    {
                        var td = (Dictionary<string, object>)tris[i];
                        model.envelopeTriangles[i] = new DiagridTriangle
                        {
                            a = Convert.ToInt32(td["a"]),
                            b = Convert.ToInt32(td["b"]),
                            c = Convert.ToInt32(td["c"]),
                            nx = td.ContainsKey("nx") ? Convert.ToDouble(td["nx"]) : 0,
                            ny = td.ContainsKey("ny") ? Convert.ToDouble(td["ny"]) : 0,
                            nz = td.ContainsKey("nz") ? Convert.ToDouble(td["nz"]) : 0,
                            area = td.ContainsKey("area") ? Convert.ToDouble(td["area"]) : 0
                        };
                    }
                }
            }

            return model;
        }
    }
}
