import { app, BrowserWindow, ipcMain, protocol, safeStorage, session } from "electron";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

/* -------------------------------------------------------------------------- */
/*  ESM __dirname shim                                                        */
/* -------------------------------------------------------------------------- */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const DEVICE_ID_FILE = "device-id.txt";
const WINDOW_DEFAULT_WIDTH = 628;
const WINDOW_DEFAULT_HEIGHT = 520;

let isAppQuitting = false;

/* -------------------------------------------------------------------------- */
/*  Device ID — persistent, per-installation unique identifier                */
/* -------------------------------------------------------------------------- */

/**
 * In-memory cache so the device ID is stable for the entire session even if
 * the write to disk fails. `deviceIdPersisted` tracks whether the ID was
 * successfully saved; the renderer should poll `teller:getDeviceIdStatus` and
 * surface a prominent warning when it is false.
 */
let cachedDeviceId: string | null = null;
let deviceIdPersisted = false;

function getDeviceIdFilePath(): string {
  return path.join(app.getPath("userData"), DEVICE_ID_FILE);
}

function readOrCreateDeviceId(): string {
  // Return the in-memory cache if already resolved this session.
  if (cachedDeviceId !== null) return cachedDeviceId;

  const filePath = getDeviceIdFilePath();

  try {
    if (fs.existsSync(filePath)) {
      const existing = fs.readFileSync(filePath, "utf-8").trim();
      if (existing) {
        cachedDeviceId = existing;
        deviceIdPersisted = true;
        return cachedDeviceId;
      }
    }
  } catch (readErr) {
    console.error("[device-id] Failed to read existing device ID:", readErr);
  }

  // Generate a new ID and attempt to persist it.
  const newId = randomUUID();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, newId, "utf-8");
    deviceIdPersisted = true;
  } catch (writeErr) {
    deviceIdPersisted = false;
    console.error(
      "[device-id] CRITICAL: Failed to persist device ID — this installation " +
        "will receive a new ID on next launch, breaking device→station binding.",
      writeErr,
    );
  }

  cachedDeviceId = newId;
  return cachedDeviceId;
}

/* -------------------------------------------------------------------------- */
/*  Secure Storage — encrypted key-value via Electron safeStorage             */
/* -------------------------------------------------------------------------- */

/** Only word chars, hyphens, and colons; max 128 characters. */
const SAFE_KEY_RE = /^[\w\-:]{1,128}$/;
const BLOCKED_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/**
 * Validates a renderer-supplied storage key.
 * Throws if the key is not a string, is a blocked prototype property,
 * or contains characters outside the allowed set.
 */
/** Returns a safely truncated preview of a key for use in error messages. */
function keyPreview(key: string): string {
  const MAX_PREVIEW = 40;
  return key.length > MAX_PREVIEW ? `${key.slice(0, MAX_PREVIEW)}…` : key;
}

function validateKey(key: unknown): string {
  if (typeof key !== "string") throw new Error("Storage key must be a string");
  if (BLOCKED_KEYS.has(key))
    throw new Error(`Disallowed storage key: "${keyPreview(key)}"`);
  if (!SAFE_KEY_RE.test(key))
    throw new Error(`Invalid storage key: "${keyPreview(key)}"`);
  return key;
}

const secureStoragePath = (): string =>
  path.join(app.getPath("userData"), "secure-store.enc");

function readSecureStore(): Record<string, string> {
  const filePath = secureStoragePath();
  try {
    if (!fs.existsSync(filePath)) return Object.create(null) as Record<string, string>;
    const encrypted = fs.readFileSync(filePath);
    const decrypted = safeStorage.decryptString(encrypted);
    const parsed = JSON.parse(decrypted) as Record<string, unknown>;
    // Rebuild into a null-prototype object to prevent prototype pollution
    const store: Record<string, string> = Object.create(null);
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof k === "string" && typeof v === "string") store[k] = v;
    }
    return store;
  } catch {
    return Object.create(null) as Record<string, string>;
  }
}

function writeSecureStore(store: Record<string, string>): boolean {
  const filePath = secureStoragePath();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const encrypted = safeStorage.encryptString(JSON.stringify(store));
    fs.writeFileSync(filePath, encrypted);
    return true;
  } catch (err) {
    console.error("Failed to write secure store:", err);
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*  IPC Handlers                                                              */
/* -------------------------------------------------------------------------- */

function registerIpcHandlers(): void {
  ipcMain.handle("teller:getDeviceId", () => readOrCreateDeviceId());

  ipcMain.handle("teller:getAppVersion", () => app.getVersion());

  /**
   * Returns the device ID together with a `persisted` flag.
   * The renderer must check `persisted === false` and show a warning banner
   * advising the operator that the device→station binding will break on the
   * next launch until the underlying file-system issue is resolved.
   */
  ipcMain.handle("teller:getDeviceIdStatus", () => ({
    id: readOrCreateDeviceId(),
    persisted: deviceIdPersisted,
  }));

  ipcMain.handle(
    "teller:secureStorage:get",
    (_event, key: unknown): string | null => {
      const safeKey = validateKey(key);
      if (!safeStorage.isEncryptionAvailable()) return null;
      const store = readSecureStore();
      return Object.prototype.hasOwnProperty.call(store, safeKey) ? store[safeKey] : null;
    },
  );

  ipcMain.handle(
    "teller:secureStorage:set",
    (_event, key: unknown, value: unknown): boolean => {
      const safeKey = validateKey(key);
      if (typeof value !== "string") throw new Error("Storage value must be a string");
      if (!safeStorage.isEncryptionAvailable()) return false;
      const store = readSecureStore();
      store[safeKey] = value;
      return writeSecureStore(store);
    },
  );

  ipcMain.handle(
    "teller:secureStorage:delete",
    (_event, key: unknown): boolean => {
      const safeKey = validateKey(key);
      if (!safeStorage.isEncryptionAvailable()) return false;
      const store = readSecureStore();
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete store[safeKey];
      return writeSecureStore(store);
    },
  );
}

const TELLER_FKEYS = new Set(["F1", "F2", "F3", "F4", "F5", "F6", "F12"]);

/* -------------------------------------------------------------------------- */
/*  Window Creation                                                           */
/* -------------------------------------------------------------------------- */

function createWindow(): void {
  const win = new BrowserWindow({
    width: WINDOW_DEFAULT_WIDTH,
    height: WINDOW_DEFAULT_HEIGHT,
    minWidth: 628,
    minHeight: 580,
    alwaysOnTop: true,
    icon: app.isPackaged
      ? path.join(process.resourcesPath, "icon.ico")
      : path.join(__dirname, "..", "build-resources", "icon.ico"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  /* ---- Intercept keys to prevent default browser behavior ---------------- */
  win.webContents.on("before-input-event", (_event, input) => {
    if (input.type !== "keyDown") return;

    // Ctrl+Shift+I — toggle DevTools (dev only)
    if (!app.isPackaged && input.control && input.shift && input.code === "KeyI") {
      win.webContents.toggleDevTools();
    }

    // Ctrl+Shift+Q — quit application
    if (input.control && input.shift && input.code === "KeyQ") {
      _event.preventDefault();
      isAppQuitting = true;
      app.quit();
    }

    // F1–F6, F12 — teller action shortcuts.
    // Prevent Electron/Chrome default behaviours (F5 reload, F12 DevTools, etc.)
    // so they are handled exclusively by the renderer's useKeyboardShortcuts hook.
    if (!input.control && !input.alt && !input.meta && TELLER_FKEYS.has(input.key)) {
      _event.preventDefault();
    }
  });

  /* ---- Load renderer ----------------------------------------------------- */
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    win.loadURL(devServerUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

/* -------------------------------------------------------------------------- */
/*  App Lifecycle                                                             */
/* -------------------------------------------------------------------------- */

app.whenReady().then(() => {
  registerIpcHandlers();

  /* ---- Content-Security-Policy ----------------------------------------- */
  /* Suppress the Electron "Insecure CSP" dev warning and harden the renderer */
  const isDev = !app.isPackaged;

  let connectSrcHosts: string;
  if (isDev) {
    connectSrcHosts = "http://localhost:* ws://localhost:*";
  } else {
    // Default to localhost:3000 — IT can override by setting API_BASE_URL
    // before launching the app (e.g. via a wrapper batch file or system env var).
    const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3000";
    // Derive the ws:// counterpart from the http(s):// base URL.
    const wsBaseUrl = apiBaseUrl.replace(/^http/, "ws");
    connectSrcHosts = `${apiBaseUrl} ${wsBaseUrl}`;
  }

  const csp = [
    "default-src 'none'",
    // 'unsafe-eval' is required for Vite HMR; 'unsafe-inline' is required for the
    // @vitejs/plugin-react Fast Refresh preamble inline script. Both are dev-only.
    isDev ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'" : "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src 'self' ${connectSrcHosts}`,
    "font-src 'self' data:",
  ].join("; ");

  if (isDev) {
    // onHeadersReceived fires correctly for HTTP (Vite dev server) — keep it for dev.
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      
    const cleanResponseHeaders = Object.fromEntries(
      Object.entries(details.responseHeaders ?? {}).filter(
        ([headerName]) => headerName.toLowerCase() !== "content-security-policy",
      ),
    );

    callback({
      responseHeaders: {
        ...cleanResponseHeaders,
          "Content-Security-Policy": [csp],
        },
      });
    });
  } else {
    // In production the renderer loads via file:// and webRequest.onHeadersReceived
    // does NOT fire for file:// navigations, so the CSP would be silently bypassed.
    // Intercept the file: scheme at the protocol level instead.
    const MIME: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript",
      ".mjs": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
      ".ttf": "font/ttf",
    };

    protocol.handle("file", async (request) => {
      let filePath: string;
      try {
        filePath = fileURLToPath(request.url);
      } catch {
        return new Response("Bad Request", { status: 400 });
      }

      let data: Buffer;
      try {
        data = await fs.promises.readFile(filePath);
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code;
        return new Response("Not Found", { status: code === "ENOENT" ? 404 : 500 });
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME[ext] ?? "application/octet-stream";
      const headers: Record<string, string> = { "Content-Type": contentType };

      // Inject CSP only on HTML responses — the entry-point that bootstraps the renderer.
      if (ext === ".html") {
        headers["Content-Security-Policy"] = csp;
      }

      // Response's BodyInit doesn't include Node's Buffer type directly;
      // Uint8Array (which Buffer extends) is accepted.
      return new Response(new Uint8Array(data), { headers });
    });
  }

  createWindow();

  app.on("activate", () => {
    if (!isAppQuitting && BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  isAppQuitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
