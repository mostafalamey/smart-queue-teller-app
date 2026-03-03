# Smart Queue — Teller App

Electron-wrapped desktop application for hospital teller staff to operate service queues.

## Tech Stack

- **Electron** — desktop shell (Windows target)
- **React 18 + TypeScript** — renderer UI
- **Tailwind CSS v4 + shadcn/ui** — styling (consistent with admin app)
- **Vite** — build tooling
- **Socket.IO** — real-time queue updates (future phase)

## Features (Planned)

- Staff login with email/password
- Device ID + counter/station binding (IT configures via Admin app)
- Queue dashboard with real-time updates
- Teller actions: Call Next, Start Serving, Recall, Skip/No-Show, Complete, Transfer
- Keyboard shortcuts (F1–F6) for USB HID peripheral support
- Bilingual support (Arabic/English)

## Development

### Prerequisites

- Node.js >= 20
- npm

### Setup

```bash
npm install
```

### Run (dev mode)

```bash
npm run dev
```

This starts Vite dev server on port 5174 and launches Electron loading from it.

### Build

```bash
npm run build:web     # Type-check + Vite renderer + compile main process (dist/ + dist-electron/)
npm run pack          # Unpacked Electron build → release/win-unpacked/
npm run dist:win      # Windows NSIS installer → release/
```

### Packaging / Distribution

The build pipeline compiles two targets:

1. **Renderer** — Vite bundles `src/renderer/` → `dist/`
2. **Main process** — esbuild compiles `src/main.ts` → `dist-electron/main.js` + copies `src/preload.cjs` → `dist-electron/preload.cjs`

`electron-builder` packages both into an ASAR archive and produces a Windows NSIS installer. The app icon is embedded into the exe via `scripts/after-pack.cjs` (`rcedit`) — no code-signing certificate or Developer Mode required.

**Output artifacts:**

| File | Description |
|---|---|
| `release/Smart-Queue-Teller-Setup-{version}.exe` | NSIS installer |
| `release/win-unpacked/Smart Queue Teller.exe` | Unpacked — run directly without installing |

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `API_BASE_URL` | `http://localhost:3000` | Backend API base URL |
| `USE_MOCK_API` | `false` | Use mock data provider instead of live backend |

### Keyboard Shortcuts (Dev)

- `Ctrl+Shift+I` — Toggle DevTools
- `Ctrl+Shift+Q` — Quit application

## Branch Workflow

- `main` — protected, reviewed merges only
- `feature/*` — one feature per branch/PR

## Documentation

See [docs/teller-app-implementation-plan.md](docs/teller-app-implementation-plan.md) for the full implementation plan.
