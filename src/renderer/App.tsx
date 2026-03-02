/**
 * Root application component.
 *
 * Boot sequence:
 *   1. StationProvider resolves Device ID → CounterStation (public API call,
 *      no auth required). Loading screen is shown until resolution completes.
 *   2. AuthBridge mounts AuthProvider only after the station status is known,
 *      ensuring the stationId is available for the silent-refresh bootstrap so
 *      the new JWT correctly embeds the station claim.
 *   3. TellerApp routes based on combined auth + station state:
 *        Station unregistered/error → DeviceNotConfigured screen
 *        Auth bootstrapping         → loading indicator
 *        Not authenticated          → LoginForm (stationId pre-wired)
 *        mustChangePassword         → ForcePasswordChange
 *        Authenticated              → Queue dashboard (Phase 6.3 placeholder)
 */

import { AuthProvider } from "./providers/AuthContext";
import { StationProvider, useStation } from "./providers/StationContext";
import { SocketProvider } from "./providers/SocketContext";
import { NetworkHealthProvider } from "./providers/NetworkHealthContext";
import { LanguageProvider, useLanguage } from "./providers/LanguageContext";
import { useAuth } from "./hooks/useAuth";
import { LoginForm } from "./components/LoginForm";
import { ForcePasswordChange } from "./components/ForcePasswordChange";
import { DeviceNotConfigured } from "./components/DeviceNotConfigured";
// Note: DeviceNotConfigured is rendered in AuthBridge (outside AuthProvider) so
// unregistered/error devices never trigger a silent-refresh bootstrap.
import { StationInfo } from "./components/StationInfo";
import { QueueDashboard } from "./components/QueueDashboard";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Spinner } from "./components/ui/spinner";
import { MonitorDot } from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  Shared full-screen loader                                                 */
/* -------------------------------------------------------------------------- */

function FullScreenLoader() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background text-foreground">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
        <MonitorDot size={20} className="text-primary" />
      </div>
      <Spinner size={20} className="text-primary" />
      <p className="text-xs text-muted-foreground">Initialising…</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  TellerApp — rendered only after station + auth states are both resolved  */
/* -------------------------------------------------------------------------- */

function TellerApp() {
  const { isBootstrapping, isAuthenticated, user } = useAuth();
  const { lang } = useLanguage();

  /* Auth bootstrap still in flight */
  if (isBootstrapping) return <FullScreenLoader />;

  /* Not signed in */
  if (!isAuthenticated) return <LoginForm />;

  /* Must change password before proceeding */
  if (user?.mustChangePassword) return <ForcePasswordChange />;

  /* ---- Authenticated — queue dashboard ---------------------------------- */
  return (
    <SocketProvider>
      <NetworkHealthProvider>
        <div className="flex h-screen flex-col bg-background text-foreground">
          <StationInfo tellerName={user?.email} />
          <QueueDashboard />
        </div>
      </NetworkHealthProvider>
    </SocketProvider>
  );
}

/* -------------------------------------------------------------------------- */
/*  AuthBridge — gates AuthProvider mount until station status is final      */
/* -------------------------------------------------------------------------- */

function AuthBridge() {
  const { status, binding } = useStation();

  /* Still resolving — wait before mounting AuthProvider to ensure stationId
     is available for the silent-refresh bootstrap JWT claim. */
  if (status === "idle" || status === "resolving") {
    return <FullScreenLoader />;
  }

  /* Device not configured — render outside AuthProvider; no auth needed and
     no point touching secure storage for an unregistered/error device. */
  if (status === "unregistered" || status === "error") {
    return <DeviceNotConfigured />;
  }

  /* status === "bound" and binding is non-null — safe to mount AuthProvider */
  return (
    <AuthProvider stationId={binding!.stationId}>
      <TellerApp />
    </AuthProvider>
  );
}

/* -------------------------------------------------------------------------- */
/*  Exported root                                                             */
/* -------------------------------------------------------------------------- */

export function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <StationProvider>
          <AuthBridge />
        </StationProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}
