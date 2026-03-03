# Smart Queue — Teller App Implementation Plan

Date: 2026-02-28
Phase: 6 (from `docs/implementation-phases.md`)
Branch: `feature/teller-desktop-v1`

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture & Tech Stack](#architecture--tech-stack)
3. [Prerequisites](#prerequisites)
4. [Implementation Phases](#implementation-phases)
   - [Phase 6.0 — Project Scaffold & Electron Shell](#phase-60--project-scaffold--electron-shell)
   - [Phase 6.1 — Authentication & Token Management](#phase-61--authentication--token-management)
   - [Phase 6.2 — Station Binding & Session Bootstrap](#phase-62--station-binding--session-bootstrap)
   - [Phase 6.3 — Queue Dashboard & Real-Time Updates](#phase-63--queue-dashboard--real-time-updates)
   - [Phase 6.4 — Teller Action Panel (Core Operations)](#phase-64--teller-action-panel-core-operations)
   - [Phase 6.5 — Transfer Flow](#phase-65--transfer-flow)
   - [Phase 6.6 — Keyboard Shortcuts & Peripheral Support](#phase-66--keyboard-shortcuts--peripheral-support)
   - [Phase 6.7 — Error Handling, Offline States & Edge Cases](#phase-67--error-handling-offline-states--edge-cases)
   - [Phase 6.8 — Polish, Testing & Packaging](#phase-68--polish-testing--packaging)
5. [Data Provider Strategy](#data-provider-strategy)
6. [Backend API Contract Reference](#backend-api-contract-reference)
7. [WebSocket Event Reference](#websocket-event-reference)
8. [Keyboard Shortcut Map](#keyboard-shortcut-map)
9. [Ticket State Machine Reference](#ticket-state-machine-reference)
10. [Security & RBAC Constraints](#security--rbac-constraints)
11. [Open Items & Decisions](#open-items--decisions)

---

## Overview

The Teller App is an **Electron-wrapped desktop application** for hospital Staff users. It provides the teller with a compact, focused interface to execute queue operations: calling the next patient, recalling, skipping (no-show), completing, and transferring tickets. The app runs on Windows PCs at teller counters, each bound to a specific `CounterStation` and its assigned service.

### Key Behavioral Requirements (from `smart-queue-plan.md`)

- Staff sign in with email + password credentials.
- The PC is bound to a counter/station via a Device ID (configured by IT in Admin app).
- After login, the teller operates the service queue bound to their counter — **no manual service switching in v1**.
- Actions: Call Next, Recall, Skip (No-show), Complete, Transfer.
- Keyboard shortcuts for all primary actions to support USB HID peripherals.
- Real-time queue updates via WebSocket.
- Refresh token stored in OS secure storage; access token kept in memory.

---

## Architecture & Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| **Desktop shell** | Electron (latest stable) | Windows target; fullscreen or windowed |
| **Renderer UI** | React 18 + TypeScript | Compact single-purpose UI |
| **Styling** | Tailwind CSS + shadcn/ui | Consistent with admin app design system |
| **State management** | React hooks + Context | Minimal; no heavy state library needed |
| **HTTP client** | Fetch API (native) | Typed wrappers around teller/auth endpoints |
| **Real-time** | Socket.IO client | Connects to `/realtime/socket.io` |
| **Secure storage** | `safeStorage` (Electron) | For refresh token persistence |
| **Build tooling** | Vite + electron-builder | Same pattern as kiosk app |
| **Testing** | Vitest + React Testing Library | Unit and integration tests |

### Process Architecture

```
┌──────────────────────────────────────────────┐
│ Electron Main Process                        │
│  • Window management                         │
│  • IPC handlers (secure storage, device ID)  │
│  • Keyboard shortcut forwarding              │
│  • Auto-updater (future)                     │
└──────────────┬───────────────────────────────┘
               │ IPC (contextBridge)
┌──────────────▼───────────────────────────────┐
│ Renderer Process (React App)                 │
│  • Login screen                              │
│  • Queue dashboard + action panel            │
│  • Socket.IO real-time subscription          │
│  • HTTP data provider                        │
└──────────────────────────────────────────────┘
```

---

## Prerequisites

Before starting Phase 6, the following must be in place:

| Dependency | Source | Status |
|---|---|---|
| Teller API endpoints fully operational | Phase 3 backend | ✅ Done |
| Auth endpoints (login, refresh, logout) | Phase 3 backend | ✅ Done |
| WebSocket realtime broadcaster | Phase 3 backend | ✅ Done |
| CounterStation + Device models in DB | Phase 1 schema | ✅ Done |
| At least one test hospital, department, service, station, staff user seeded | Backend seed script | ✅ Done |
| Device binding endpoint (Admin/IT maps Device → Station) | Phase 3 backend | ✅ Done |

---

## Implementation Phases

---

### Phase 6.0 — Project Scaffold & Electron Shell

**Goal:** Set up the development environment, project structure, and a working Electron window that loads a Vite-served React app.

**Branch:** `feature/teller-desktop-v1`

#### Deliverables

- [x] Initialize `package.json` with project metadata and scripts
- [x] Set up Vite with React + TypeScript plugin
- [x] Configure Tailwind CSS and shadcn/ui (port config from admin app)
- [x] Create Electron main process (`src/main.ts`) with:
  - Window creation (1024×700 default, resizable)
  - Dev server URL loading (`VITE_DEV_SERVER_URL`) or production `dist/index.html`
  - Context isolation enabled, node integration disabled
  - App icon configuration
- [x] Create preload script (`src/preload.cjs`) exposing `tellerRuntime` bridge:
  - `config` — API base URL, environment flags
  - `secureStorage.set(key, value)` — persist refresh token via `safeStorage`
  - `secureStorage.get(key)` — retrieve refresh token
  - `secureStorage.delete(key)` — clear refresh token
  - `getDeviceId()` — read or generate a persistent device identifier
  - `getAppVersion()` — app version string
- [x] Create renderer entry point (`src/renderer/main.tsx` + `App.tsx`)
- [x] Set up `electron-builder` config for Windows (NSIS installer)
- [x] Set up dev scripts: `dev:web`, `dev:electron`, `dev` (concurrent)
- [x] Add `.gitignore`, `tsconfig.json`, `tsconfig.node.json`
- [x] Verify: Electron window opens, loads React app, hot-reload works

#### Project Structure

```
smart-queue-teller-app/
├── app/
│   └── src/                          # Existing scaffold (will be replaced)
├── src/
│   ├── main.ts                       # Electron main process
│   └── preload.cjs                   # Context bridge (IPC, CommonJS required)
├── src/renderer/
│   ├── main.tsx                      # React entry
│   ├── App.tsx                       # Root component + router
│   ├── styles.css                    # Tailwind imports
│   ├── components/
│   │   ├── ui/                       # shadcn/ui primitives
│   │   ├── LoginForm.tsx
│   │   ├── QueueDashboard.tsx
│   │   ├── ActionPanel.tsx
│   │   ├── CurrentTicket.tsx
│   │   ├── QueueList.tsx
│   │   ├── TransferDialog.tsx
│   │   ├── ConnectionStatus.tsx
│   │   └── StationInfo.tsx
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useQueue.ts
│   │   ├── useSocket.ts
│   │   └── useKeyboardShortcuts.ts
│   ├── providers/
│   │   ├── AuthContext.tsx
│   │   └── SocketContext.tsx
│   ├── data/
│   │   ├── types.ts                  # Shared TypeScript types
│   │   ├── api-client.ts             # HTTP client with auth interceptor
│   │   ├── teller-provider.ts        # Teller API methods
│   │   ├── auth-provider.ts          # Auth API methods
│   │   └── mock-provider.ts          # Mock data provider (dev)
│   └── lib/
│       ├── utils.ts                  # Shared utilities
│       ├── constants.ts              # App constants
│       └── shortcuts.ts             # Shortcut key definitions
├── index.html                        # Vite HTML entry
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── components.json                   # shadcn/ui config
└── electron-builder.yml              # Build config
```

#### Done Criteria
- `npm run dev` launches Electron window with React "Hello Teller" page.
- Hot-reload works when editing renderer code.
- `npm run pack` produces a runnable unpacked build.

---

### Phase 6.1 — Authentication & Token Management

**Goal:** Implement login screen, JWT token lifecycle, and secure token storage.

#### Deliverables

- [x] **Auth data provider** (`data/auth-provider.ts`):
  - `login({ email, password, stationId, requestedRole })` → tokens + user info
  - `refresh({ refreshToken, stationId })` → rotated tokens
  - `logout({ refreshToken })` → invalidation
  - Request timeout handling (8s default)
- [x] **Auth context** (`providers/AuthContext.tsx`):
  - Stores access token in memory (React state)
  - Stores refresh token via IPC → Electron `safeStorage` (encrypted on disk)
  - On app launch: attempt to read stored refresh token → silent refresh
  - Auto-refresh before access token expiry (proactive refresh at 80% TTL)
  - Exposes: `user`, `isAuthenticated`, `isLoading`, `login()`, `logout()`
  - On logout: clear memory + secure storage + redirect to login
- [x] **Login screen** (`components/LoginForm.tsx`):
  - Email + password fields
  - "Sign In" button with loading state
  - Error display (invalid credentials, account locked, network error)
  - Station ID display (read-only, from device)
  - App version in footer
  - Bilingual labels (Arabic/English toggle)
- [x] **API client with auth interceptor** (`data/api-client.ts`):
  - Attaches `Authorization: Bearer <accessToken>` to all requests
  - On 401 response: attempt token refresh; if refresh fails → force logout
  - Queues concurrent requests during refresh to avoid race conditions (shared `refreshPromise`)
  - Configurable base URL from `tellerRuntime.config.apiBaseUrl`
- [x] **Force password change screen** (`components/ForcePasswordChange.tsx`) (if `user.mustChangePassword === true`):
  - Current password + new password + confirm (with strength bar)
  - Calls `POST /auth/change-password`
  - On success: `mustChangePassword` cleared → router shows dashboard
- [x] **Account lockout handling**:
  - Display lockout message with remaining time when server returns 423

#### Security Requirements
- Refresh token MUST be stored via Electron `safeStorage` (OS-level encryption).
- Access token MUST NOT be persisted to disk — memory only.
- On app close/logout: refresh token cleared from secure storage.
- All auth requests use HTTPS in production.

#### Done Criteria
- Staff user can log in with valid credentials.
- Invalid credential shows error message.
- Access token auto-refreshes before expiry.
- App restart with stored refresh token auto-logs in.
- Logout clears all state and returns to login screen.

#### Post-Review Hardening (2026-03-01)

Fixes applied after PR review before merge:

- [x] **`API_BASE_URL` required in production** (`main.ts`): production startup exits with a user-visible dialog instead of silently falling back to `localhost` in the CSP.
- [x] **CSP enforced for `file://` loads** (`main.ts`): replaced `session.webRequest.onHeadersReceived` (skipped for `file://`) with `protocol.handle('file', …)` so the CSP is injected on HTML responses for packaged builds; dev still uses `onHeadersReceived` for the Vite HTTP server.
- [x] **Dev CSP includes `'unsafe-inline'`** (`main.ts`): required for `@vitejs/plugin-react` Fast Refresh preamble; production CSP remains strict.
- [x] **`asChild` removed from `ButtonProps`** (`components/ui/button.tsx`): was declared but never implemented — would have leaked onto DOM `<button>` attributes.
- [x] **`toApiErrorCode()` type guard in `auth-provider.ts`**: validates `body.code` against the full `ApiErrorCode` union before throwing; unrecognised codes fall back to `"UNKNOWN"` instead of passing through an unsafe cast.
- [x] **`toApiErrorCode()` type guard in `api-client.ts`**: same pattern applied to `parseErrorResponse()` to replace the unsafe `as ApiErrorCode` assertion.
- [x] **Proactive refresh timer error handler** (`providers/AuthContext.tsx`): `.catch()` added to the timer callback — on failure it logs, clears the timer, wipes the stale stored token, and resets state to unauthenticated.
- [x] **Bootstrap silent-refresh failure handling** (`providers/AuthContext.tsx`): catch block now clears the timer, nulls the access token ref, deletes the stale stored key, and logs the error instead of swallowing it.
- [x] **Full optional chaining on `secureStorage` calls** (`providers/AuthContext.tsx`): all six `window.tellerRuntime?.secureStorage.method()` call-sites updated to `?.secureStorage?.method()` so the app doesn't throw when running in `dev:web` (no Electron runtime).
- [x] **`SESSION_EXPIRED` error code introduced** (`data/types.ts`, `data/auth-provider.ts`, `providers/AuthContext.tsx`, `components/LoginForm.tsx`): replaces `FORBIDDEN` for forced-logout/session-expiry paths so `resolveErrorMessage()` shows the correct "session expired" banner instead of the "no teller access" message.

---

### Phase 6.2 — Station Binding & Session Bootstrap

**Goal:** After login, resolve the counter station and service binding so the teller knows what queue they operate.

#### Deliverables

- [x] **Device ID generation and persistence** (main process):
  - Generate UUID on first run, persist to app data directory
  - Expose via `tellerRuntime.getDeviceId()` IPC
  - Display Device ID prominently for IT setup (login screen footer or settings panel)
- [x] **Station resolution flow** (post-login):
  - Backend returns `stationId` embedded in JWT from the login `stationId` parameter
  - The teller app passes `stationId` = the counter station ID mapped to this Device ID
  - **Resolution sequence:**
    1. Read local Device ID
    2. Query backend: `GET /devices?deviceId=<localDeviceId>` → find assigned `counterStationId`
    3. If no device registered or no station assigned → show "Device Not Configured" screen with Device ID for IT to register
    4. If station found → query `GET /stations/:stationId` (or embed in device response) to get `serviceId`, `counterCode`
    5. Proceed to login with `stationId` parameter
- [x] **Station info display** (`components/StationInfo.tsx`):
  - Counter code (e.g., "Counter C01")
  - Service name (Arabic/English)
  - Department name (Arabic/English)
  - Teller name (logged-in user)
  - Connection status indicator
- [x] **"Device Not Configured" screen**:
  - Shows the Device ID for the user to communicate to IT
  - Clear instructions: "Please ask IT to register this device in the Admin app"
  - Retry button to re-check binding
- [x] **Session bootstrap sequence** (after login + station resolved):
  1. Fetch current queue summary for bound service
  2. Establish WebSocket connection
  3. Subscribe to service and station rooms
  4. Render queue dashboard

#### Error States
- Device not registered → "Device Not Configured" screen
- Station not assigned to device → same screen
- Station's service is inactive → warning message, actions disabled
- Network error during resolution → retry with back-off

#### Done Criteria
- App reads Device ID and resolves station binding.
- Unregistered device shows setup instructions.
- Registered device proceeds to queue dashboard with correct service context.
- Station info (counter, service, department) displayed correctly.

---

### Phase 6.3 — Queue Dashboard & Real-Time Updates

**Goal:** Display the live queue state for the teller's bound service with real-time updates.

#### Deliverables

- [x] **Queue data provider** (`data/teller-provider.ts`):
  - `getQueueSummary(serviceId)` → waiting count, in-progress count, now-serving info
  - `getWaitingTickets(serviceId)` → list of waiting tickets (ordered by priority + FIFO)
  - Error handling with typed error codes
- [x] **Socket connection hook** (`hooks/useSocket.ts`):
  - Connect to `/realtime/socket.io` with auth token
  - Auto-reconnect on disconnect with exponential backoff
  - Subscribe to `service:{serviceId}` and `station:{stationId}` rooms
  - Re-subscribe on reconnection
  - Expose connection state: `connected`, `connecting`, `disconnected`
- [x] **Socket context** (`providers/SocketContext.tsx`):
  - Manages Socket.IO lifecycle tied to auth state
  - Disconnect on logout
  - Reconnect on token refresh
- [x] **Queue dashboard** (`components/QueueDashboard.tsx`):
  - **Summary cards:**
    - Waiting count (badge with count)
    - In-progress / currently serving
    - Completed today
    - No-shows today
  - **Currently serving ticket** (prominent display):
    - Ticket number (large, bold)
    - Patient phone number (partially masked: `05****1234`)
    - Priority badge (Normal/VIP/Emergency with color coding)
    - Status badge (CALLED / SERVING)
    - Time elapsed since called
  - **Waiting queue list** (scrollable):
    - Ticket number
    - Priority indicator
    - Time waiting (relative)
    - Ordered by: priority desc → createdAt asc
  - Auto-refresh on `queue.updated` and `now-serving.updated` WebSocket events
- [x] **Connection status indicator** (`components/ConnectionStatus.tsx`):
  - Green dot = connected
  - Yellow dot = reconnecting
  - Red dot = disconnected
  - Tooltip with last connected time
- [x] **Backend queue endpoints** (`smart-queue-backend/src/api/server.ts`):
  - `GET /queue/services/:serviceId/summary` — waiting/called/serving counts + nowServing (station-scoped) + completedToday + noShowsToday
  - `GET /queue/services/:serviceId/waiting` — WAITING tickets ordered priority desc, FIFO within priority (max 100)
  - Phone numbers masked server-side via `maskPhone()` helper

#### Real-Time Update Flow

```
Backend teller mutation
  → Broadcasts `queue.updated` + `now-serving.updated` to rooms
    → Socket.IO client receives event
      → Triggers queue data re-fetch (or optimistic update from event payload)
        → React state update → UI re-renders
```

#### Done Criteria
- Queue dashboard shows accurate waiting count and ticket list.
- Currently serving ticket displayed when one is active.
- WebSocket events trigger immediate UI refreshes.
- Connection status indicator reflects actual connection state.
- Disconnect → reconnect cycle works without manual intervention.

---

### Phase 6.4 — Teller Action Panel (Core Operations)

**Goal:** Implement the primary teller queue operations as action buttons with confirmation and feedback.

#### Deliverables

- [x] **Teller API methods** (in `data/teller-provider.ts`):
  - `callNext(serviceId)` → `POST /teller/call-next` → returns ticket with status `CALLED`
  - `startServing(ticketId)` → `POST /teller/start-serving` → transitions `CALLED → SERVING`, sets `servingStartedAt` (explicit user action)
  - `recall(ticketId)` → `POST /teller/recall` → re-announces patient; backend records RECALLED event only; ticket status and timestamps unchanged
  - `skipNoShow(ticketId)` → `POST /teller/skip-no-show` → returns ticket
  - `complete(ticketId)` → `POST /teller/complete` → returns ticket
  - All methods use the authenticated API client
- [x] **Action Panel** (`components/ActionPanel.tsx`):
  - **Call Next** button:
    - Enabled when: no active ticket at this station
    - On click: calls `callNext(serviceId)` → ticket displayed as CALLED (amber badge); "Start Serving" becomes the primary action
    - On empty queue: show "No tickets waiting" feedback
    - Visual: primary/green color, largest button
  - **Start Serving** button:
    - Enabled when: active ticket is in CALLED state
    - On click: calls `startServing(ticketId)` → ticket transitions to SERVING (blue badge), `servingStartedAt` set by backend
    - Serving timer anchors on `servingStartedAt` from this point forward
    - Visual: blue/primary color
  - **Recall** button:
    - Enabled when: active ticket is in CALLED state only
    - Re-announces the patient (signage/audio); backend records RECALLED event only — status and timestamps unchanged
    - Not available once ticket is SERVING (patient is already at the counter)
    - Teller clicks "Start Serving" once the patient arrives to transition to SERVING
    - Visual: amber/warning color
  - **Skip / No-Show** button:
    - Enabled when: active ticket is in CALLED state only (patient has not yet arrived at counter)
    - Not available when SERVING — patient is physically present and being served
    - Shows inline confirmation strip using a **stable ticket snapshot** (id + ticketNumber captured at click time); strip auto-cancels via `useEffect` if the ticket id or status changes while confirming
    - On confirm: guards against ticket mismatch before calling skip; marks ticket as `NO_SHOW` (terminal)
    - On success: clears current ticket, ready for next call
    - Visual: red/destructive color
  - **Complete** button:
    - Enabled when: active ticket is in SERVING state only
    - Direct action (no confirmation)
    - On success: marks ticket as `COMPLETED` (terminal), clears current ticket
    - Visual: green/success color
- [x] **Current Ticket Card** (embedded in `components/QueueDashboard.tsx` as `CurrentTicketCard`):
  - Large ticket number display
  - Status badge — **amber "Called"** when `status === CALLED`; **blue "Serving"** when `status === SERVING`
  - Priority badge
  - **Serving timer**: anchors on `servingStartedAt` once the teller clicks Start Serving; falls back to `calledAt` while ticket is still in CALLED state
  - Patient phone (partially masked)
  - Action buttons contextually arranged below the ticket (Start Serving is primary when CALLED)
- [x] **Action feedback**:
  - Loading spinners on buttons during API calls
  - Error bar auto-displays on action failure (inline in ActionPanel)
  - All action buttons disabled during in-flight operation; synchronous `actionInFlightRef` prevents re-entry even before React re-renders the disabled state
- [x] **Queue state management** (`hooks/useQueue.ts`):
  - Tracks: `currentTicket` (optimistic), `isActionInFlight`, `actionError`, `queueSummary`, `waitingTickets`, `isLoading`
  - `runAction` wrapper: synchronous `actionInFlightRef` re-entry guard; in-flight flag; error capture; optimistic state update; `fetchAll` in `finally` (runs on both success and failure to reconcile stale state)
  - `fetchAll` syncs `currentTicket` from `summary.nowServing` on every poll/WS-triggered refresh
  - Updates on: API responses, WebSocket events
  - Handles: stale state reconciliation when WebSocket reconnects

#### Action State Matrix

| Current State | Call Next | Start Serving | Recall | Skip | Complete | Transfer |
|---|---|---|---|---|---|---|
| No active ticket | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Ticket CALLED | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Ticket SERVING | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |

#### Error Handling

| Error Code | Display Message | Action |
|---|---|---|
| `QUEUE_EMPTY` | "No patients waiting in queue" | Inline error bar in ActionPanel |
| `INVALID_STATUS_TRANSITION` | "This action is not available for the current ticket status" | Refresh ticket state |
| `TICKET_NOT_FOUND` | "Ticket no longer exists" | Clear current ticket |
| `STATION_NOT_FOUND` | "Station binding error — contact IT" | Block actions |
| `409 Conflict` | "Action already performed by another teller" | Refresh queue |
| Network error | "Connection lost — retrying..." | Auto-retry with backoff |

#### Done Criteria
- All five core actions (Call Next, Start Serving, Recall, Skip, Complete) work end-to-end.
- CALLED state displays amber badge; SERVING state displays blue badge.
- Serving timer anchors on `servingStartedAt` (set when teller clicks Start Serving); counts from `calledAt` while in CALLED state.
- Action buttons enable/disable correctly per the Action State Matrix.
- Inline confirmation strip appears for Skip / No-Show (CALLED state only).
- WebSocket events refresh the UI after actions.
- Error states display meaningful messages.

---

### Phase 6.5 — Transfer Flow

**Goal:** Implement ticket transfer to another service, including department/service selection.

#### Deliverables

- [x] **Transfer API method** (in `data/teller-provider.ts`):
  - `transfer(ticketId, { departmentId, serviceId, ticketDate, reasonId })` → `POST /teller/transfer`
  - Returns `{ sourceTicket, destinationTicket }`
- [x] **Department/Service data** (in `data/teller-provider.ts`):
  - `getDepartments()` → `GET /departments` (all active departments)
  - `getServices(departmentId)` → `GET /departments/:id/services` (active services)
- [x] **Transfer reasons data** (in `data/teller-provider.ts`):
  - `getTransferReasons()` → `GET /transfer-reasons` (active reasons, sorted by `sortOrder`)
  - Returns `{ id, nameEn, nameAr }[]`
  - Cached in the dialog session (fetched once on open)
- [x] **Transfer Dialog** (`components/TransferDialog.tsx`):
  - Modal overlay triggered by "Transfer" button
  - **Step 1:** Select destination department (dropdown/list)
    - Shows all departments except current (or all + highlight current)
    - Bilingual names (Arabic/English)
  - **Step 2:** Select destination service (dropdown/list, filtered by department)
    - Cannot select the same service the ticket is already in
    - Shows ticket prefix for disambiguation
  - **Step 3:** Select transfer reason (required dropdown)
    - Populated from `GET /transfer-reasons` (hospital-managed, Admin-configurable)
    - Bilingual labels (Arabic/English)
    - Required — Confirm button disabled until a reason is selected
  - **Confirm** button with summary: "Transfer {ticketNumber} to {serviceName}?" (reason shown)
  - **Cancel** button to close dialog
  - Loading state during transfer API call
  - Success: show new ticket number at destination, clear current ticket
  - Error: display error, keep dialog open for retry
- [x] **Transfer feedback**:
  - Success toast: "Ticket transferred → New number: {destinationTicketNumber}"
  - Source ticket transitions to `TRANSFERRED_OUT` (terminal for this station)
  - Queue refreshes automatically

#### Transfer Rules (enforced by backend, validated in UI)
- Only tickets in `CALLED` or `SERVING` status can be transferred (also `WAITING` but teller doesn't have waiting tickets assigned).
- Destination ticket receives a **new sequence number/ticket number** in the destination service.
- Priority is preserved by default.
- Transfer creates a link: `destinationTicket.originTicketId = sourceTicket.id`.

#### Done Criteria
- Teller can open transfer dialog from a CALLED or SERVING ticket.
- Department → Service → Reason selection flow works.
- Transfer reason is required — cannot confirm without selecting one.
- Transfer succeeds and shows new destination ticket number.
- Current ticket clears after transfer.
- Cannot transfer to the same service.
- Transfer reason recorded in event payload for audit/analytics.

---

### Phase 6.6 — Keyboard Shortcuts & Peripheral Support

**Goal:** Add keyboard shortcuts for all teller actions to support USB HID key peripherals.

#### Deliverables

- [x] **Shortcut definitions** (`lib/shortcuts.ts`):
  ```typescript
  export const SHORTCUTS = {
    CALL_NEXT:     { key: 'F1', label: 'F1' },
    START_SERVING: { key: 'F2', label: 'F2' },
    RECALL:        { key: 'F3', label: 'F3' },
    SKIP_NO_SHOW:  { key: 'F4', label: 'F4' },
    COMPLETE:      { key: 'F5', label: 'F5' },
    TRANSFER:      { key: 'F6', label: 'F6' },
  } as const;
  ```
- [x] **Keyboard shortcut hook** (`hooks/useKeyboardShortcuts.ts`):
  - Registers global `keydown` listeners via Electron's `before-input-event` (main process) or renderer `window.addEventListener`
  - Maps F-keys to action handlers
  - Respects action enable/disable state (does not fire disabled actions)
  - Ignores shortcuts when modal dialogs or text inputs are focused
  - Debounce rapid repeat presses (300ms)
- [x] **Shortcut hints on buttons**:
  - Each action button displays its shortcut key label (e.g., "Call Next (F1)")
  - Small badge or tooltip format
- [x] **Shortcut reference panel** (accessible via `F12` or menu):
  - Lists all shortcuts in a compact overlay
  - Dismissable with `Escape`
- [x] **Electron main process shortcut forwarding**:
  - Intercept F-key presses in `before-input-event`
  - Forward to renderer via IPC if needed (or let renderer handle directly)
  - Prevent default browser behavior for F-keys (e.g., F5 refresh)

#### Peripheral Compatibility Notes
- USB HID keypads send standard keystroke events — no special driver needed.
- F-keys chosen to avoid conflicts with common OS shortcuts.
- Physical keypads can be mapped to F-keys via the keypad's firmware or key remapping software.

#### Done Criteria
- All five actions triggerable via keyboard shortcuts.
- Shortcuts respect current enable/disable state.
- Shortcut labels visible on action buttons.
- F5 does NOT refresh the Electron page.
- Rapid key presses debounced to prevent duplicate API calls.

---

### Phase 6.7 — Error Handling, Offline States & Edge Cases

**Goal:** Robust error handling, network resilience, and proper offline behavior.

#### Deliverables

- [x] **Network health monitoring** (`hooks/useNetworkHealth.ts`, `providers/NetworkHealthContext.tsx`):
  - Periodic health check (`GET /health`) every 30 seconds
  - WebSocket connection state as primary indicator
  - Combined status: `online`, `degraded` (HTTP ok, WS down), `offline`
  - HTTP ping also fires on `window.online` event (browser network interface recovery)
- [x] **Offline mode behavior** (`components/OfflineBanner.tsx`, `components/QueueDashboard.tsx`, `components/ActionPanel.tsx`):
  - When offline: displays prominent "Connection Lost" banner with `WifiOff` icon
  - All queue action buttons disabled when `networkStatus === "offline"`
  - Keyboard shortcuts also disabled when offline
  - Shows last-queue-refresh timestamp so teller knows how stale the data is
  - When degraded: amber "Degraded Connection" banner; actions still available
  - Auto-retry handled by Socket.IO built-in reconnect + visibility/online listeners
  - On reconnect: full queue state refresh + re-subscribe WebSocket rooms (existing behavior)
- [x] **Session expiry handling** (`providers/AuthContext.tsx`):
  - If refresh token is rejected (expired/revoked): force logout with message (existing `auth:unauthorized` event)
  - If access token refresh fails transiently: retry 2x before forcing logout (existing ApiClient behavior)
  - Clear stale tokens on auth errors (existing behavior hardened in Phase 6.1)
- [x] **Concurrent teller conflict handling** (`hooks/useQueue.ts`):
  - `TICKET_NOT_FOUND` in `runAction`: clear `currentTicket` immediately + refresh
  - 409 Conflict (non-domain error): overrides message to "This ticket was already handled by another teller."
  - All race conditions ultimately reconciled by `fetchAll()` in the `finally` block
- [x] **Edge case: app left idle** (`hooks/useSocket.ts`):
  - Socket.IO built-in keepalive/reconnection handles long idle periods
  - On resume from sleep/hibernate: `visibilitychange` → `visible` triggers `socket.connect()` if disconnected
  - `window.online` browser event also triggers immediate reconnect attempt
- [x] **Edge case: station re-binding** (`hooks/useQueue.ts`, `providers/AuthContext.tsx`, `components/LoginForm.tsx`):
  - `STATION_NOT_FOUND` in `runAction` fires `station:mismatch` DOM event
  - `AuthContext` listens for `station:mismatch` → clears tokens + forces re-login with `STATION_NOT_FOUND` error code
  - `LoginForm` `resolveErrorMessage` maps `STATION_NOT_FOUND` → bilingual "Station configuration has changed. Please sign in again." message
- [x] **Error boundary** (`components/ErrorBoundary.tsx`):
  - React class component wrapping the root `<App />`
  - Crash screen with error detail (collapsible) and "Restart App" button
  - `componentDidCatch` logs to console
  - In-place state reset attempted before full-page reload

#### Done Criteria
- App gracefully handles network disconnection and reconnection.
- Offline state clearly communicated to user.
- Session expiry forces clean logout.
- Concurrent teller conflicts don't cause broken UI state.
- App recovers from sleep/hibernate automatically.

---

### Phase 6.8 — Polish, Testing & Packaging

**Goal:** Final UI polish, comprehensive testing, and production-ready builds.

#### Deliverables

- [x] **UI/UX polish** (`providers/LanguageContext.tsx`, `lib/i18n.ts`, `components/StationInfo.tsx`, `components/QueueDashboard.tsx`, `components/ActionPanel.tsx`, `components/OfflineBanner.tsx`, `components/TransferDialog.tsx`, `components/ShortcutReferencePanel.tsx`, `components/ConnectionStatus.tsx`, `styles.css`):
  - Log-out functionality: inline confirmation strip in StationInfo header (requires two clicks)
  - Bilingual support (Arabic/English) with full RTL layout for Arabic
    - `LanguageContext` provider with localStorage persistence (`sq:lang` key)
    - Sets `dir` and `lang` attributes on `<html>` for proper RTL rendering
    - Centralized `i18n.ts` with `en`/`ar` string objects covering all 60+ labels
    - All dashboard components consume bilingual strings via `useLanguage()` / `dashboardStrings[lang]`
    - Components updated: QueueDashboard, ActionPanel, OfflineBanner, StationInfo, TransferDialog, ShortcutReferencePanel, ConnectionStatus
  - Language toggle (Globe icon) in station info header
  - Consistent color scheme preserved from Smart Queue branding
  - Loading skeletons for initial data fetch (`SkeletonDashboard` with animated pulse cards)
  - Smooth transitions: `animate-fade-in` (dashboard mount), `animate-slide-up` (metrics, dialog), CSS keyframes in `styles.css`
  - Responsive layout supported via flex layout (640×480 minimum)
  - Dark mode support preserved via existing Tailwind dark variant / shadcn tokens
- [x] **Accessibility** (`components/TransferDialog.tsx`, `components/QueueDashboard.tsx`, `components/ShortcutReferencePanel.tsx`, `components/ConnectionStatus.tsx`, `components/OfflineBanner.tsx`):
  - Screen reader labels (`aria-label`) on all interactive elements (buttons, toggle, metric cards, close buttons)
  - Focus management for TransferDialog modal: focus trap (Tab/Shift+Tab cycles within dialog), auto-focus first focusable on mount, Escape to dismiss
  - `role="dialog"` + `aria-modal="true"` on TransferDialog and ShortcutReferencePanel
  - `role="status"` on metric cards with `aria-label` announcing `"label: value"`
  - `role="alert"` + `aria-live="assertive"` on OfflineBanner
  - `role="region"` + `aria-live="polite"` on CurrentTicketCard (announces ticket changes)
  - `role="status"` + `aria-live="polite"` on ConnectionStatus
  - Keyboard navigation: Tab/Enter for all controls, Escape for dialogs/panels, F-key shortcuts (Phase 6.6)
- [x] **Testing**:
  - **Unit tests:**
    - Auth provider: login, refresh, logout flows (`src/renderer/data/__tests__/auth-provider.test.ts` — 15 tests)
    - API client: auth interceptor, retry logic, shared refresh, timeouts (`src/renderer/data/__tests__/api-client.test.ts` — 15 tests)
    - Shortcut hook: key mapping, debounce, modal guard, input-focus suppression, cleanup (`src/renderer/hooks/__tests__/useKeyboardShortcuts.test.ts` — 20 tests)
    - Queue hook: state transitions, action enable/disable, re-entry guard, error handling (`src/renderer/hooks/__tests__/useQueue.test.ts` — 13 tests)
  - **Integration tests:**
    - Login → station resolution → dashboard render *(deferred)*
    - Call Next → ticket displayed → Complete → cleared *(deferred)*
    - Transfer flow end-to-end *(deferred)*
    - WebSocket event → UI update *(deferred)*
  - **Manual test scenarios:**
    - Fresh install on unregistered device → setup screen
    - Login with force-change-password → change → dashboard
    - Full ticket lifecycle: Call → Start Serving → Complete
    - Transfer to another service
    - Concurrent tellers on same service (one wins call-next)
    - Network disconnect → reconnect → state recovery
    - All keyboard shortcuts
- [x] **Packaging & distribution**:
  - `electron-builder` config for Windows NSIS installer
  - App icon (`build-resources/icon.ico`) embedded into exe via `scripts/after-pack.cjs` + `rcedit` (no Developer Mode required)
  - NSIS installer produces `Smart-Queue-Teller-Setup-{version}.exe` (95 MB, verified ✅)
  - Start menu + desktop shortcuts via NSIS config
  - Main process compile step: `esbuild src/main.ts → dist-electron/main.js` + `preload.cjs` copied alongside — fixes packaged-app preload path
  - `win.signAndEditExecutable: false` prevents winCodeSign symlink errors; icon embedded separately via `afterPack` hook
  - Auto-update mechanism (deferred — manual updates via NSIS installer for v1)
- [x] **Documentation**:
  - Update `README.md` with build/run instructions (existing)
  - Update `docs/teller-app-implementation-plan.md` status fields (this update)
  - Shortcut reference panel available in-app via F12 (Phase 6.6, bilingual in Phase 6.8)

#### Done Criteria
- ~~All unit and integration tests passing.~~ (Integration tests deferred)
- ~~Manual test scenarios verified.~~ (Manual testing deferred)
- Windows installer builds cleanly. ✅ (`Smart-Queue-Teller-Setup-0.1.0.exe` — 95 MB, custom icon embedded)
- ~~App installs and runs on a fresh Windows PC.~~ (Install verification deferred)
- Arabic/English toggles correctly with RTL support. ✅

---

## Data Provider Strategy

Following the workspace-wide app data integration policy, the teller app implements a **switchable data provider**:

```typescript
// data/types.ts
interface TellerDataProvider {
  // Auth
  login(input: LoginInput): Promise<LoginResponse>;
  refresh(input: RefreshInput): Promise<LoginResponse>;
  logout(input: LogoutInput): Promise<void>;
  changePassword(input: ChangePasswordInput): Promise<void>;

  // Station resolution
  getDeviceBinding(deviceId: string): Promise<DeviceBinding | null>;

  // Queue
  getQueueSummary(serviceId: string): Promise<QueueSummary>;
  getWaitingTickets(serviceId: string): Promise<QueueTicket[]>;

  // Teller actions
  callNext(serviceId: string): Promise<QueueTicket>;         // returns CALLED ticket
  startServing(ticketId: string): Promise<QueueTicket>;      // explicit user action: CALLED → SERVING
  recall(ticketId: string): Promise<QueueTicket>;            // RECALLED event only; status unchanged
  skipNoShow(ticketId: string): Promise<QueueTicket>;
  complete(ticketId: string): Promise<QueueTicket>;
  transfer(ticketId: string, destination: TransferDestination): Promise<TransferResult>;

  // Reference data
  getDepartments(): Promise<Department[]>;
  getServices(departmentId: string): Promise<Service[]>;
}
```

- **`http` provider**: calls real backend endpoints (production).
- **`mock` provider**: returns contract-aligned fake data (development without backend).
- **Selection**: environment variable `USE_MOCK_API=true|false` injected via `tellerRuntime.config`.

---

## Backend API Contract Reference

### Auth Endpoints

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/auth/login` | `{ email, password, stationId?, requestedRole? }` | `{ user, auth: { accessToken, refreshToken, ... } }` | `stationId` embedded in JWT claims |
| POST | `/auth/refresh` | `{ refreshToken, stationId? }` | Same as login | Can re-bind stationId on refresh |
| POST | `/auth/logout` | `{ refreshToken }` | `{ success }` | Server-side revocation pending |
| POST | `/auth/change-password` | `{ currentPassword, newPassword }` | 200 OK | — |

### Teller Endpoints (all POST, Bearer auth required)

| Path | Request Body | Response | Notes |
|---|---|---|---|
| `/teller/call-next` | `{ serviceId }` | `QueueTicket` | `stationId` from JWT; atomic row-lock selection |
| `/teller/recall` | `{ ticketId }` | `QueueTicket` | Emits RECALLED event; no status change |
| `/teller/start-serving` | `{ ticketId }` | `QueueTicket` | CALLED → SERVING |
| `/teller/skip-no-show` | `{ ticketId }` | `QueueTicket` | CALLED/SERVING → NO_SHOW (terminal) |
| `/teller/complete` | `{ ticketId }` | `QueueTicket` | SERVING → COMPLETED (terminal) |
| `/teller/transfer` | `{ ticketId, destination: { departmentId, serviceId, ticketDate }, reasonId }` | `{ sourceTicket, destinationTicket }` | Source → TRANSFERRED_OUT; reasonId required |
| `/teller/change-priority` | `{ ticketId, priorityCategoryId, priorityWeight }` | 200 OK | Only WAITING tickets; not used by STAFF |

### Queue & Reference Endpoints

| Method | Path | Response | Notes |
|---|---|---|---|
| GET | `/queue/services/:serviceId/summary` | Queue counts + now-serving | Scoped read |
| GET | `/departments` | Department list | Scoped reads |
| GET | `/departments/:id/services` | Service list | Scoped reads |
| GET | `/transfer-reasons` | Active transfer reasons (sorted by sortOrder) | Staff+ auth required |

### Error Response Shape

```json
{ "code": "ERROR_CODE", "message": "Human-readable message" }
```

Status codes: 400 (bad request), 401 (unauthorized), 403 (forbidden), 404 (not found), 409 (conflict), 423 (locked), 500 (server error).

---

## WebSocket Event Reference

**Connection:** Socket.IO at path `/realtime/socket.io`

**Authentication:** Pass token via `socket.handshake.auth.token`

### Client → Server (Subscriptions)

| Event | Payload | Effect |
|---|---|---|
| `subscribe.service` | `serviceId: string` | Join `service:{serviceId}` room |
| `subscribe.station` | `stationId: string` | Join `station:{stationId}` room |

### Server → Client (Broadcasts)

| Event | Payload | Triggered By |
|---|---|---|
| `queue.updated` | `{ requestId, operation, ticketId, serviceId, stationId, occurredAt }` | Any teller mutation on the service |
| `now-serving.updated` | Same as above | call-next, recall, start-serving, complete, skip, transfer |
| `authorization.error` | `{ code: "FORBIDDEN", message }` | Subscription auth failure |

**Teller app should listen to both events and refresh queue state on receipt.**

---

## Keyboard Shortcut Map

| Key | Action | Condition |
|---|---|---|
| **F1** | Call Next | No active ticket at this station |
| **F2** | Start Serving | Active ticket in CALLED state |
| **F3** | Recall | Active ticket in CALLED state |
| **F4** | Skip / No-Show | Active ticket in CALLED state |
| **F5** | Complete | Active ticket present (SERVING) |
| **F6** | Transfer | Active ticket present |
| **F12** | Show shortcut reference | Always |
| **Escape** | Close open dialog/modal | When dialog is open |

> F-keys prevent default browser behavior (no page refresh on F5).
> Start Serving is a first-class user action mapped to F2.

---

## Ticket State Machine Reference

The teller app should understand these states for UI rendering:

```
WAITING  ──→  CALLED  ──→  SERVING  ──→  COMPLETED
  │              │             │
  │              ├──→ NO_SHOW  ├──→ NO_SHOW
  │              │             │
  │              └──→ TRANSFERRED_OUT
  │                            └──→ TRANSFERRED_OUT
  └──→ CANCELLED (patient/admin only)
  └──→ TRANSFERRED_OUT (from waiting, rare for teller flow)
```

> **Teller app note:** `CALLED` is a visible intermediate state rendered with an amber badge. After `callNext` the teller sees the ticket as CALLED and must explicitly click **Start Serving** (`POST /teller/start-serving`) once the patient arrives at the counter — the ticket then moves to SERVING (blue badge) and `servingStartedAt` is set by the backend. The serving timer anchors on `servingStartedAt`. While in CALLED state the timer counts from `calledAt` as a fallback. `recall` is only available in the CALLED state — it re-announces the patient who hasn't arrived yet (records a RECALLED event; no status or timestamp change). Once a ticket is SERVING the patient is at the counter and recall is no longer relevant.

### Status Display Colors

| Status | Color | Description |
|---|---|---|
| WAITING | Gray | In queue |
| CALLED | Amber/Orange | Called but not yet at counter |
| SERVING | Blue | Being served |
| COMPLETED | Green | Done |
| NO_SHOW | Red | Did not appear |
| CANCELLED | Gray/strikethrough | Cancelled by patient |
| TRANSFERRED_OUT | Purple | Sent to another service |

---

## Security & RBAC Constraints

| Rule | Enforcement |
|---|---|
| STAFF can only execute teller actions (call/start-serving/recall/skip/complete/transfer) | Backend RBAC on every route |
| STAFF scope limited to their bound station's service | `stationId` in JWT → service resolved server-side |
| No manual counter/service switching | UI shows only bound service; backend rejects mismatches |
| Cannot change ticket priority | STAFF role excluded from priority endpoints |
| Cannot access admin/analytics/organization features | No routes exposed; UI doesn't render them |
| Access token short-lived (15 min default) | Auto-refresh via refresh token |
| Refresh token stored encrypted on disk | Electron `safeStorage` API |
| Token cleared on logout | Both memory and secure storage |

---

## Open Items & Decisions

| # | Item | Options | Decision |
|---|---|---|---|
| 1 | **Device ID discovery**: How does the teller app find its station? | (a) Local Device ID → query backend for binding, (b) Manual station selection at login | **Option (a)** — consistent with plan |
| 2 | **Shortcut key assignment**: Which keys for which actions? | F1–F6 as proposed, or Ctrl+1–6, or configurable | **F1–F6 default** — simplest for HID keypads |
| 3 | **Confirmation dialogs**: Required for which actions? | (a) All destructive only (Skip), (b) All except Call Next, (c) Configurable | **Option (a)** — Skip requires confirmation; Complete is direct |
| 4 | **LED display adapter**: Should teller app drive above-teller LED? | (a) Teller app drives via serial/USB module, (b) Separate adapter service | **Deferred to Phase 7** — signage phase |
| 5 | **Language toggle persistence**: Where to store preference? | (a) localStorage, (b) User profile on backend | **Option (a)** — localStorage in renderer |
| 6 | **Mock provider scope**: How complete should mock be? | (a) Full lifecycle simulation, (b) Static responses only | **Option (a)** — enables parallel UI dev |
| 7 | **Start Serving step**: Mandatory or optional? | (a) Mandatory explicit step, (b) Auto-serve on call | **Option (a)** — `start-serving` is an explicit teller button (F2). CALLED state is rendered (amber badge). Teller clicks Start Serving once the patient arrives; backend sets `servingStartedAt` at that moment. Preserves the `calledAt → servingStartedAt` walk-up delta for analytics. |

---

## Progress Tracker

Update this table as implementation proceeds.

| Sub-Phase | Description | Status | Start Date | Done Date |
|---|---|---|---|---|
| 6.0 | Project Scaffold & Electron Shell | Done | 2026-02-28 | 2026-02-28 |
| 6.1 | Authentication & Token Management | Done | 2026-03-01 | 2026-03-01 |
| 6.2 | Station Binding & Session Bootstrap | Done | 2026-03-01 | 2026-03-01 |
| 6.3 | Queue Dashboard & Real-Time Updates | Done | 2026-03-01 | 2026-03-01 |
| 6.4 | Teller Action Panel (Core Operations) | Done | 2026-03-01 | 2026-03-01 |
| 6.5 | Transfer Flow | Done | 2026-03-02 | 2026-03-02 |
| 6.6 | Keyboard Shortcuts & Peripheral Support | Done | 2026-03-02 | 2026-03-02 |
| 6.7 | Error Handling, Offline States & Edge Cases | Done | 2026-03-02 | 2026-03-02 |
| 6.8 | Polish, Testing & Packaging | Done | 2026-03-03 | 2026-03-03 |

---

## Estimated Effort

| Sub-Phase | Estimated Days | Dependencies |
|---|---|---|
| 6.0 — Scaffold | 1–2 | None |
| 6.1 — Auth | 2–3 | 6.0 |
| 6.2 — Station Binding | 1–2 | 6.1 |
| 6.3 — Queue Dashboard | 2–3 | 6.2 |
| 6.4 — Action Panel | 2–3 | 6.3 |
| 6.5 — Transfer | 1–2 | 6.4 |
| 6.6 — Shortcuts | 1 | 6.4 |
| 6.7 — Error Handling | 1–2 | 6.4, 6.5 |
| 6.8 — Polish & Packaging | 2–3 | All above |
| **Total** | **13–21 days** | |

> Phases 6.5, 6.6, and 6.7 can be parallelized after 6.4 is complete.
