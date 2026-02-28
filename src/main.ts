import { app, BrowserWindow, ipcMain, safeStorage } from "electron";
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
const WINDOW_DEFAULT_WIDTH = 1024;
const WINDOW_DEFAULT_HEIGHT = 700;

let isAppQuitting = false;

/* -------------------------------------------------------------------------- */
/*  Device ID — persistent, per-installation unique identifier                */
/* -------------------------------------------------------------------------- */

function getDeviceIdFilePath(): string {
  return path.join(app.getPath("userData"), DEVICE_ID_FILE);
}

function readOrCreateDeviceId(): string {
  const filePath = getDeviceIdFilePath();

  try {
    if (fs.existsSync(filePath)) {
      const existing = fs.readFileSync(filePath, "utf-8").trim();
      if (existing) return existing;
    }
  } catch {
    // Fall through to create a new one
  }

  const newId = randomUUID();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, newId, "utf-8");
  } catch (err) {
    console.error("Failed to persist device ID:", err);
  }
  return newId;
}

/* -------------------------------------------------------------------------- */
/*  Secure Storage — encrypted key-value via Electron safeStorage             */
/* -------------------------------------------------------------------------- */

const secureStoragePath = (): string =>
  path.join(app.getPath("userData"), "secure-store.enc");

function readSecureStore(): Record<string, string> {
  const filePath = secureStoragePath();
  try {
    if (!fs.existsSync(filePath)) return {};
    const encrypted = fs.readFileSync(filePath);
    const decrypted = safeStorage.decryptString(encrypted);
    return JSON.parse(decrypted) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeSecureStore(store: Record<string, string>): void {
  const filePath = secureStoragePath();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const encrypted = safeStorage.encryptString(JSON.stringify(store));
    fs.writeFileSync(filePath, encrypted);
  } catch (err) {
    console.error("Failed to write secure store:", err);
  }
}

/* -------------------------------------------------------------------------- */
/*  IPC Handlers                                                              */
/* -------------------------------------------------------------------------- */

function registerIpcHandlers(): void {
  ipcMain.handle("teller:getDeviceId", () => readOrCreateDeviceId());

  ipcMain.handle("teller:getAppVersion", () => app.getVersion());

  ipcMain.handle(
    "teller:secureStorage:get",
    (_event, key: string): string | null => {
      if (!safeStorage.isEncryptionAvailable()) return null;
      const store = readSecureStore();
      return store[key] ?? null;
    },
  );

  ipcMain.handle(
    "teller:secureStorage:set",
    (_event, key: string, value: string): boolean => {
      if (!safeStorage.isEncryptionAvailable()) return false;
      const store = readSecureStore();
      store[key] = value;
      writeSecureStore(store);
      return true;
    },
  );

  ipcMain.handle(
    "teller:secureStorage:delete",
    (_event, key: string): boolean => {
      if (!safeStorage.isEncryptionAvailable()) return false;
      const store = readSecureStore();
      delete store[key];
      writeSecureStore(store);
      return true;
    },
  );
}

/* -------------------------------------------------------------------------- */
/*  Window Creation                                                           */
/* -------------------------------------------------------------------------- */

function createWindow(): void {
  const win = new BrowserWindow({
    width: WINDOW_DEFAULT_WIDTH,
    height: WINDOW_DEFAULT_HEIGHT,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  /* ---- Intercept keys to prevent default browser behavior ---------------- */
  win.webContents.on("before-input-event", (_event, input) => {
    if (input.type !== "keyDown") return;

    // Ctrl+Shift+I — toggle DevTools (dev only)
    if (input.control && input.shift && input.code === "KeyI") {
      win.webContents.toggleDevTools();
    }

    // Ctrl+Shift+Q — quit application
    if (input.control && input.shift && input.code === "KeyQ") {
      _event.preventDefault();
      isAppQuitting = true;
      app.quit();
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
