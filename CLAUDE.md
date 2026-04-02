# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A browser-based 3D structural analysis tool for diagrid structures, with FEM/CFD solvers and Autodesk Revit integration via MCP.

## Architecture

```
src/
  index.html          HTML shell (panels, toolbar, overlays)
  main.js             Entry point (imports app.js)
  app.js              Application logic (Three.js scene, UI, all features)
  styles/index.css    All CSS
  core/               Coordinate transforms, constants
  solvers/            Pure computation: FEM, CG solver, section properties
    sparse-matrix.js
    conjugate-gradient.js
    fem-core.js
    section-props.js

tests/                Vitest test suites
  solvers/            FEM physics benchmarks (cantilever, simply-supported, portal frame)
  core/               Coordinate and utility tests

public/
  beam_model.json     Sample diagrid model (661 nodes, 1267 beams)
```

**Revit MCP integration:**
```
Claude Code  →  MCP Server (npx mcp-server-for-revit)  →  WebSocket  →  Revit Plugin (C#)  →  Revit API
```

## Build System

- **Vite** for dev server and production builds
- **Vitest** for testing
- **ESLint** for linting
- **Three.js** as npm dependency (not CDN)

```bash
npm run dev       # Dev server on port 3001
npm run build     # Production build to dist/
npm test          # Run tests (56 physics benchmarks)
npm run lint      # Lint check
```

## Solver Modules (Pure Computation)

The FEM solver lives in `src/solvers/` with zero DOM or Three.js dependencies:

- `sparse-matrix.js` — Map-of-Maps sparse storage with penalty BC method
- `conjugate-gradient.js` — Preconditioned CG solver (Jacobi, tol=1e-8, max 8000 iter)
- `fem-core.js` — 3D frame element stiffness (Euler-Bernoulli), rotation matrices, global transform
- `section-props.js` — CHS section properties, presets

Unit system: kN and m. E in kPa (GPa * 1e6).

## Diagrid Viewer (app.js)

### Toolbar Groups

| Group | Modes | Purpose |
|-------|-------|---------|
| **Model** | Import Model, Section & Material, Add Member, Edit Beam, Ring Connect | Geometry and properties |
| **Boundary** | Supports, Load Cases & Loads, Tension Cables | Boundary conditions |
| **Analysis** | FEM Solver, CFD Wind, Robot Export | Solvers and external tools |

To add a new mode:
1. Add `<button class="mode-btn">` inside the appropriate `.tb-group > .tb-dropdown` in index.html
2. Add the mode name to `toolbarGroups` object in app.js
3. Add a `panel-{mode-name}` div in index.html
4. Add entry to `panelMap` in `setMode()`

### Coordinate System

Model: X right, Y forward, Z up (metres). Three.js: `m2t(x,y,z)` → `(x, z, -y)`.

### Key Data Structures

- `nodes[]` / `beams[]` — Raw model arrays from JSON
- `nodeMap` (Map: nodeId → node), `nIdx` (Map: nodeId → index)
- `supports` (Map: nodeId → {type, dir})
- `loadCases[]` — Array of {id, name, nature, selfWeight, liveLoadIntensity, pointLoads: Map, windLoad}
- `beamSections` (Map: beamIdx → {D,t}) — per-beam CHS overrides
- `femResults` — Displacements, member forces, reactions

### Load Cases

Each load case stores its own self-weight flag, live load intensity, point loads map, and wind load. `saveActiveLoadCase()` must be called before switching cases. FEM uses `computeTotalForceVector()` which sums all cases.

## MCP Tools (Revit)

All Revit interaction via `mcp__revit__*` tools. Requires Revit open with plugin loaded.

- **Query**: `get_current_view_info`, `get_current_view_elements`, `ai_element_filter`, `get_available_family_types`
- **Create**: `create_line_based_element`, `create_point_based_element`, `create_surface_based_element`, `create_grid`, `create_level`, `create_room`
- **Modify**: `operate_element`, `color_elements`, `delete_element`, `tag_all_rooms`, `tag_all_walls`
- **Advanced**: `send_code_to_revit` (C# execution), `store_project_data`/`query_stored_data`

## Legacy Files

The original monolithic files are kept in the repo root for reference:
- `diagrid-viewer.html` — Original single-file app (5078 lines)
- `fem-tests.html` — Browser-based FEM tests (migrated to Vitest)
- `cfd-test.html` / `cfd-test-node.js` — CFD tests
