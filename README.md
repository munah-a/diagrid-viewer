# Diagrid Structural Analysis Viewer

A browser-based 3D structural analysis tool for diagrid structures, featuring FEM and CFD solvers, Autodesk Revit integration via MCP, and Robot Structural Analysis export.

## Features

- **3D Visualization** — Interactive Three.js viewer with orbit controls, node/beam display, labels
- **FEM Solver** — 3D frame element analysis with sparse matrix CG solver (Euler-Bernoulli beam theory)
- **CFD Wind Analysis** — SIMPLE algorithm RANS solver with k-epsilon turbulence model
- **Load Cases** — Self-weight, live load, point loads, wind pressure with multi-case support
- **Support Types** — Fixed, pinned, roller with automatic bottom-node assignment
- **Section Properties** — CHS (Circular Hollow Section) with per-member overrides and perimeter detection
- **Result Visualization** — Deformed shape, axial force, bending moment, reaction coloring
- **Results Table** — Sortable node/member results with CSV export
- **Model Import** — JSON model loading with full scene rebuild
- **Ring Connect** — Z-level ring detection for sequential/radial cross-section connections
- **Robot Integration** — Python script generation for Autodesk Robot Structural Analysis
- **Revit Integration** — MCP-based control of Autodesk Revit (requires plugin)

## Getting Started

### Prerequisites

- Node.js 18+

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

Opens the viewer at [http://localhost:3001](http://localhost:3001).

### Build

```bash
npm run build
```

Produces a static site in `dist/`.

### Test

```bash
npm test
```

Runs FEM physics benchmarks (cantilever deflection, simply-supported beam, portal frame equilibrium) and solver unit tests.

### Lint

```bash
npm run lint
```

## Architecture

```
src/
  core/         State management, constants, coordinate transforms
  solvers/      Pure computation: FEM solver, CFD solver, section properties
  scene/        Three.js scene setup, mesh factory, orbit controls
  features/     Business logic: supports, loads, results, import/export
  ui/           DOM panel management, mode switching, table overlay
  styles/       CSS partials
  main.js       Entry point
  index.html    HTML shell with panels and toolbar
```

### Solver Modules (zero UI dependencies)

The FEM and CFD solvers are pure computational modules that can be used independently:

```js
import { SparseMatrix } from './solvers/sparse-matrix.js';
import { solveCG } from './solvers/conjugate-gradient.js';
import { build3DFrameLocalK, buildRotationMatrix, transformKtoGlobal } from './solvers/fem-core.js';
```

### Revit MCP Integration

Requires [mcp-server-for-revit](https://www.npmjs.com/package/mcp-server-for-revit) and Autodesk Revit 2025/2026 with the plugin installed. See [SETUP.md](SETUP.md) for details.

## Data Format

Model files are JSON with nodes and beams:

```json
{
  "nodes": [{ "id": 0, "x": -42.2, "y": 0.9, "z": 7.9 }],
  "beams": [{ "id": 0, "node_start": 0, "node_end": 1 }]
}
```

Coordinates in metres. X right, Y forward, Z up.

## License

[MIT](LICENSE)
