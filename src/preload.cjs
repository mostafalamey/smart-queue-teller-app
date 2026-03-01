const { contextBridge, ipcRenderer } = require("electron");

/**
 * Teller Runtime API exposed to the renderer process via contextBridge.
 *
 * All methods are async IPC calls — the renderer never touches Node.js
 * or Electron internals directly.
 */
contextBridge.exposeInMainWorld("tellerRuntime", {
  /**
   * App configuration sourced from environment variables at startup.
   */
  config: {
    apiBaseUrl: process.env.API_BASE_URL || "http://localhost:3000",
    useMockApi: process.env.USE_MOCK_API === "true",
  },

  /**
   * Retrieve the persistent, per-installation Device ID.
   */
  getDeviceId: () => ipcRenderer.invoke("teller:getDeviceId"),

  /**
   * Retrieve the device ID plus a `persisted` flag.
   * When `persisted` is false the ID is in-memory only and will change on the
   * next launch — the renderer must show a prominent warning to the operator.
   */
  getDeviceIdStatus: () => ipcRenderer.invoke("teller:getDeviceIdStatus"),

  /**
   * Retrieve the app version string from package.json.
   */
  getAppVersion: () => ipcRenderer.invoke("teller:getAppVersion"),

  /**
   * Encrypted secure storage (backed by OS credentials via safeStorage).
   *
   * Used for persisting the refresh token across app restarts.
   */
  secureStorage: {
    get: (key) => {
      if (typeof key !== "string") throw new TypeError("key must be a string");
      return ipcRenderer.invoke("teller:secureStorage:get", key);
    },
    set: (key, value) => {
      if (typeof key !== "string") throw new TypeError("key must be a string");
      if (typeof value !== "string")
        throw new TypeError("value must be a string");
      return ipcRenderer.invoke("teller:secureStorage:set", key, value);
    },
    delete: (key) => {
      if (typeof key !== "string") throw new TypeError("key must be a string");
      return ipcRenderer.invoke("teller:secureStorage:delete", key);
    },
  },
});
