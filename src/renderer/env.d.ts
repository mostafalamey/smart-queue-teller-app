/// <reference types="vite/client" />

/**
 * Type declarations for the `tellerRuntime` bridge exposed
 * from the Electron preload script via contextBridge.
 */
interface TellerRuntimeConfig {
  readonly apiBaseUrl: string;
  readonly useMockApi: boolean;
}

interface TellerSecureStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<boolean>;
  delete(key: string): Promise<boolean>;
}

interface TellerRuntime {
  readonly config: TellerRuntimeConfig;
  getDeviceId(): Promise<string>;
  getAppVersion(): Promise<string>;
  readonly secureStorage: TellerSecureStorage;
}

declare global {
  interface Window {
    tellerRuntime: TellerRuntime;
  }
}

export {};
