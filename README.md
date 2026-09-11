# CodeUML

Turn TypeScript source code into UML class diagrams, right in the browser.

**English** | [简体中文](README.zh-CN.md)

## Features

- 🔄 **Real-time parsing** — the diagram updates as you type
- 📊 Supports **classes, interfaces, abstract classes and enums**
- 🔗 Detects **inheritance, implementation, association, aggregation, composition and dependency**
- 🗂️ **Multi-file projects** — drag in a folder and files are grouped into packages
  (package name = folder path + file name)
- 🔍 **Zoom & pan** — Ctrl/⌘ + wheel or the toolbar buttons, middle-mouse drag to pan
- 🎯 **Highlighting** — click a class to highlight its relations, double-click a relation to highlight it and both ends
- 🎚️ **Relation strength modes** — show all relations, or only the stronger ones
- 📥 **Export** to Draw.io XML, SVG and PlantUML
- ⚪ Light theme by default
- 🚀 **Zero-dependency** static web server (Node built-in `http`)

## Getting Started

### Requirements

- Node.js 18+

### Install

```bash
git clone https://github.com/yanhuojiyusheng/CodeUML.git
cd CodeUML
npm install
```

### Run as a web server

```bash
npm start          # build + start the server + open the browser
```

Default address is `http://localhost:3000` (change with the `PORT` environment variable).

```bash
PORT=8080 npm start
npm start -- --debug   # log every HTTP request
```

### Use without the server

```bash
npm run build      # bundle to dist/bundle.js + dist/typescript.min.js
# then open index.html directly in a browser
```

> The TypeScript compiler is bundled locally into `dist/typescript.min.js` by `npm run build`,
> so no internet connection is required.

## Usage

1. Paste TypeScript code into the left editor (or drop `.ts` / `.tsx` files).
2. The UML class diagram is rendered on the right in real time.
3. Switch tabs: **Diagram / Draw.io XML / PlantUML**.

### File sidebar

- **Drop a folder** to load every `.ts` / `.tsx` file inside it, recursively.
  Relative paths become folders (package name = folder path + file name).
- **Skip rules**: directories named `dist` and `node_modules` are skipped entirely
  (not read, not shown).
- **Folders**: create subfolders (select a folder, then `+ Folder`), rename by
  double-clicking, delete with `×` (removes everything inside).
- **Bulk loading** uses chunked reading plus debounced parsing, so the UI stays
  responsive and files appear as they are read.
- The `⊟` button at the top collapses / expands all folders.

### Diagram controls

| Action | How |
|--------|-----|
| Zoom | Ctrl/⌘ + wheel, or `−` / `+` / `Reset` |
| Pan | Hold the middle mouse button and drag |
| Highlight a class | Click it |
| Highlight a relation | Double-click it |
| Relation strength | `Relations: All / Stronger / Strongest` |

## Project Structure

```
CodeUML/
├── server.js               # Static file server (zero deps, opens the browser)
├── index.html              # Page shell (loads styles/app.css, dist/typescript.min.js and dist/bundle.js)
├── styles/
│   └── app.css             # Page styles
├── src/
│   ├── main.ts             # Entry: wires core capabilities to the UI and boots
│   │
│   ├── core/               # Pure logic (no DOM, independently testable)
│   │   ├── types.ts        # Core type definitions
│   │   ├── utils.ts        # Escaping / text width / LAYOUT constants
│   │   ├── members.ts      # Member selection (shared by layout and rendering)
│   │   ├── parser.ts       # Code parser
│   │   ├── layout.ts       # Layout engine
│   │   ├── merge.ts        # Multi-file merge / cross-file type awareness
│   │   ├── relations.ts    # Relation strength and display modes
│   │   ├── svg.ts          # SVG renderer
│   │   ├── drawio.ts       # Draw.io XML exporter
│   │   └── plantuml.ts     # PlantUML text generator
│   │
│   └── ui/                 # DOM layer
│       ├── dom.ts          # Element lookup / HTML escaping
│       ├── samples.ts      # Default sample code
│       ├── highlight.ts    # Diagram highlighting
│       ├── tabs.ts         # File tabs and folders
│       ├── panes.ts        # Split-pane resizing
│       ├── actions.ts      # Export actions
│       └── zoom.ts         # Zoom & pan
│
├── tests/                  # Tests
└── dist/                   # Build output (bundle.js + vendored typescript.min.js)
```

### Core modules

| Module | Responsibility |
|--------|----------------|
| `core/parser.ts` | Parses code, extracts classes / interfaces / relations |
| `core/layout.ts` | Places classes and picks a near-square arrangement of packages |
| `core/svg.ts` | Renders the layout to SVG (boxes and relation arrows) |
| `core/drawio.ts` | Generates Draw.io-compatible mxfile XML |
| `core/plantuml.ts` | Generates PlantUML text |
| `core/members.ts` | Member selection rules (shared by layout height and rendering) |
| `ui/*` | DOM events, file sidebar, split panes, exports |
| `main.ts` | Wiring and boot |

### Development commands

```bash
npm run dev            # rebuild on change
npm run build          # bundle to dist/bundle.js
npm test               # run tests (no coverage by default)
npm run test:coverage  # run tests with a coverage report
npm run typecheck      # type check
node server.js --check # server self-check
```

## Supported UML Relations

| Relation | Detected from | Arrow |
|----------|---------------|-------|
| Inheritance | `extends` | solid line + hollow triangle ▷ |
| Implementation | `implements` | dashed line + hollow triangle ▷ |
| Association | a plain property reference | solid line + filled triangle ▶ |
| Aggregation | an array / collection property (`T[]`, `Array<T>`, `Set<T>`, …) | solid line + hollow diamond ◇ |
| Composition | a property initialized with `new` | solid line + filled diamond ◆ |
| Dependency | a method parameter / return type / `new` inside a method body | dashed line + open arrow → |

Multiplicity: `*` for arrays/collections, `0..1` for optional or nullable types, `1` otherwise.

## Supported Languages

- TypeScript / JavaScript (current)
- More languages planned

## Tech Stack

- **TypeScript Compiler API** — code parsing
- **SVG** — diagram rendering
- **esbuild** — bundling
- **Node built-in `http`** — static file server
- **Jest** — tests
- Pure frontend, no backend services

## License

MIT
