import { useEffect, useState } from "react";

/**
 * Root application component — scaffold placeholder.
 *
 * This will be replaced by the real auth + queue UI in later phases.
 */
export function App() {
  const [deviceId, setDeviceId] = useState<string>("...");
  const [deviceIdPersisted, setDeviceIdPersisted] = useState<boolean>(true);
  const [appVersion, setAppVersion] = useState<string>("...");

  useEffect(() => {
    const runtime = window.tellerRuntime;
    if (!runtime) return;

    runtime
      .getDeviceIdStatus()
      .then(({ id, persisted }) => {
        setDeviceId(id);
        setDeviceIdPersisted(persisted);
        if (!persisted) {
          console.warn(
            "[device-id] ID is ephemeral — could not be written to disk. " +
              "Device→station binding will break on next launch.",
          );
        }
      })
      .catch((err: unknown) => {
        console.error("Failed to load device ID from runtime:", err);
        setDeviceId("Unavailable");
      });
    runtime
      .getAppVersion()
      .then(setAppVersion)
      .catch((err: unknown) => {
        console.error("Failed to load app version from runtime:", err);
        setAppVersion("Unavailable");
      });
  }, []);

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-background text-foreground">
      {/* Persistent device ID warning — shown when the ID could not be written  */}
      {/* to disk and will change on next launch, breaking device→station binding */}
      {!deviceIdPersisted && (
        <div
          role="alert"
          className="flex w-full max-w-lg items-start gap-3 rounded-lg border border-destructive/60 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <span className="mt-0.5 shrink-0 font-bold">⚠</span>
          <div>
            <p className="font-semibold">Device ID not persisted</p>
            <p className="mt-0.5 text-destructive/80">
              The device ID could not be saved to disk. A new ID will be
              generated on next launch, breaking the device → station binding.
              Contact IT support to resolve the file-system issue.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-primary">
          Smart Queue — Teller
        </h1>
        <p className="text-muted-foreground">
          Electron shell is running. UI phases coming next.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="font-medium text-muted-foreground">Device ID</dt>
          <dd className="font-mono text-xs">{deviceId}</dd>
          <dt className="font-medium text-muted-foreground">Version</dt>
          <dd>{appVersion}</dd>
          <dt className="font-medium text-muted-foreground">API Base</dt>
          <dd className="font-mono text-xs">
            {window.tellerRuntime?.config.apiBaseUrl ?? "N/A"}
          </dd>
          <dt className="font-medium text-muted-foreground">Mock API</dt>
          <dd>
            {window.tellerRuntime?.config.useMockApi ? "Enabled" : "Disabled"}
          </dd>
        </dl>
      </div>

      <p className="text-xs text-muted-foreground">
        Press <kbd className="rounded border px-1">Ctrl+Shift+I</kbd> for
        DevTools &middot;{" "}
        <kbd className="rounded border px-1">Ctrl+Shift+Q</kbd> to quit
      </p>
    </div>
  );
}
