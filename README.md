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
npm run build:web     # Type-check + Vite renderer + compile main process (dist/ + dist-main/)
npm run pack          # Unpacked Electron build → release/win-unpacked/
npm run dist:win      # Windows NSIS installer + portable exe → release/
```

### Packaging / Distribution

The build pipeline uses two steps:

1. **Renderer** — Vite bundles `src/renderer/` → `dist/`
2. **Main process** — esbuild compiles `src/main.ts` → `dist-main/main.js`

`electron-builder` then packages both into an ASAR archive and wraps it with Electron.

**Windows requirements for `dist:win`:**

- **Developer Mode must be enabled** (Settings → System → For developers → Developer Mode).  
  Without it, the ASAR integrity embedding step fails with a symlink permission error.  
  The unpacked app (`--dir`) still builds correctly either way.
- No code-signing certificate is required for internal distribution.

**Output artifacts:**

| File | Description |
|---|---|
| `release/Smart-Queue-Teller-Setup-{version}.exe` | NSIS installer (recommended) |
| `release/Smart-Queue-Teller-Portable-{version}.exe` | Portable — runs without installation |

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
