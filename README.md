# PRINTER LAB

### Interactive 3D Printing Simulator · Built with React, Three.js and TypeScript

PRINTER LAB is a browser-based 3D printing visualization and simulation project. It lets you load STL models, inspect their geometry, configure key FDM printing parameters, generate layer-based toolpaths, and watch a virtual print process unfold in an interactive Three.js environment.

The project is designed as an accessible, hands-on way to explore the visual workflow behind FDM 3D printing — directly in the browser, without requiring a local slicer application or a backend service.

> **Created by Armin Mehraein**

---

## Overview

PRINTER LAB combines a 3D workspace with a configurable print simulation interface. Import your own STL model or choose from the built-in sample library, adjust print settings, inspect the generated layers, and control the virtual printing process.

The interface is currently presented in Persian with right-to-left layout. The application itself runs locally in the browser and performs model loading and geometry processing on the client side.

## Features

### 3D workspace
- Interactive Three.js viewport with orbit, pan, and zoom controls.
- Virtual build plate, build-volume outline, grid, lighting, and a visual print head.
- STL model preview with model framing and geometry inspection.
- Layer and toolpath visualization, including a moving nozzle and rendered extrusion segments.

### Model import and samples
- Import binary and ASCII STL files.
- Drag and drop STL files into the workspace.
- Built-in sample models generated locally at runtime.
- Model measurements including dimensions, triangle count, and an approximate mesh volume.

### Print configuration
The settings panel exposes the following parameters:

| Parameter | Description | Current simulation role |
| --- | --- | --- |
| Layer Height | Vertical thickness of each printed layer, in millimeters. | Recalculates the layer count and sliced toolpaths. |
| Nozzle Diameter | Nominal nozzle width, in millimeters. | Influences toolpath spacing and the visual extrusion width. |
| Filament Diameter | Diameter of the input filament, in millimeters. | Used to estimate the required filament length. |
| Wall Count | Number of perimeter passes around each layer. | Generates configurable perimeter paths. |
| Print Speed | Target movement speed, in millimeters per second. | Controls playback speed and the remaining-time estimate. |
| Infill Density | Internal infill percentage. | Controls the spacing/density of clipped infill paths. |
| Nozzle Temperature | Target nozzle temperature, in degrees Celsius. | Displayed as a process setting; thermal behavior is not simulated. |
| Bed Temperature | Target build-plate temperature, in degrees Celsius. | Displayed as a process setting; thermal behavior is not simulated. |

### Simulation controls and estimates
- Start, pause, resume, and reset the simulation.
- Adjust playback speed and inspect print progress.
- Navigate the layer-based toolpath preview.
- View estimated path length, filament usage, material weight, elapsed time, and remaining time.
- Export a plain-text toolpath preview for inspection.

## Tech Stack

- **React 18** — application UI
- **TypeScript** — application and simulation logic
- **Three.js** — real-time 3D rendering
- **STLLoader** — STL model import
- **Vite** — development server and production build
- **Lucide React** — interface icons

## Getting Started

### Requirements

- Node.js 18 or newer
- npm

### Install dependencies

```bash
npm install
```

### Start the development server

```bash
npm run dev
```

Open the local URL printed by Vite, usually:

```text
http://localhost:5173
```

### Create a production build

```bash
npm run build
```

### Preview the production build locally

```bash
npm run preview
```

## How to Use

1. Launch PRINTER LAB in your browser.
2. Select a built-in sample model or import an STL file.
3. Inspect the model in the 3D workspace.
4. Configure layer height, nozzle diameter, filament diameter, wall count, print speed, infill density, and temperature targets.
5. Review the generated layer paths.
6. Start the simulation and use the playback controls to observe the virtual print process.
7. Review the process estimates and export the text-based toolpath preview if needed.

## Project Structure

```text
.
├── src/
│   ├── engine/
│   │   ├── sampleModels.ts   # Built-in sample geometry
│   │   └── slicer.ts         # Layer intersection, contours and toolpath generation
│   ├── App.tsx               # Main application and simulation interface
│   ├── main.tsx              # React application entry point
│   └── styles.css            # Application styling and responsive layout
├── index.html
├── package.json
└── vite.config.ts
```

## Technical Scope and Limitations

PRINTER LAB is an interactive visualization and learning project. It is **not a validated manufacturing slicer**, and its generated paths must not be treated as machine-ready instructions.

The current implementation has important limitations:

- Slicing and toolpath generation are visualization-oriented and are not validated against professional slicers or physical printer output.
- Perimeter offsets and infill clipping are simplified geometry operations. Complex, non-manifold, intersecting, or open meshes may produce incomplete or unexpected paths.
- Infill patterns and perimeter generation do not implement the full range of strategies found in production slicers.
- Support structures, bridging analysis, retraction, travel optimization, pressure advance, flow calibration, and material-specific process models are not implemented.
- Temperature values are configuration targets only. The application does not simulate heat transfer, cooling, warping, or material behavior.
- Time, filament length, and material weight are estimates based on simplified assumptions; they are not equivalent to estimates from a calibrated slicer.
- The exported text file is a **visual toolpath preview**, not validated G-code. Do not send it to a 3D printer.

For reliable manufacturing, prepare and validate models with an established slicer and check the resulting machine instructions before printing.

## Privacy

STL files are loaded and processed in the browser by the client-side application. The project does not require an application backend for its current model-import and visualization workflow. Avoid importing confidential or sensitive models into any hosted deployment unless you have reviewed that deployment's hosting and privacy configuration.

## Contributing

Ideas, bug reports, and improvements are welcome. If you find an issue, please include:
- A clear description of the problem.
- The steps needed to reproduce it.
- The browser and operating system you are using.
- A sample STL file, if the issue depends on a particular model and you are able to share it.

Contributions that improve geometry robustness, slicing accuracy, usability, performance, accessibility, and documentation are especially valuable.

## License

No license has been specified for this repository yet. Unless a license is added, the default copyright rules apply and reuse, modification, and redistribution are not automatically granted.

---

**PRINTER LAB**  
An interactive 3D printing simulation project by **Armin Mehraein**.
