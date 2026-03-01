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
npm run build:web     # Build the web assets
npm run pack          # Unpacked Electron build
npm run dist:win      # Windows NSIS installer
```

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
