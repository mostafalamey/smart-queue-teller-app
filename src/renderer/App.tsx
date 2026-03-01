/**
 * Root application component.
 *
 * Auth routing:
 *   isBootstrapping  → full-screen loading indicator
 *   !isAuthenticated → LoginForm
 *   mustChangePassword === true → ForcePasswordChange
 *   otherwise → Queue dashboard (placeholder until Phase 6.3)
 */

import { AuthProvider } from "./providers/AuthContext";
import { useAuth } from "./hooks/useAuth";
import { LoginForm } from "./components/LoginForm";
import { ForcePasswordChange } from "./components/ForcePasswordChange";
import { Spinner } from "./components/ui/spinner";
import { MonitorDot } from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  Inner app — must be a child of AuthProvider                              */
/* -------------------------------------------------------------------------- */

function TellerApp() {
  const { isBootstrapping, isAuthenticated, user } = useAuth();

  /* ---- Full-screen bootstrap loader ------------------------------------ */
  if (isBootstrapping) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background text-foreground">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
          <MonitorDot size={20} className="text-primary" />
        </div>
        <Spinner size={20} className="text-primary" />
        <p className="text-xs text-muted-foreground">Initialising session…</p>
      </div>
    );
  }

  /* ---- Not signed in --------------------------------------------------- */
  if (!isAuthenticated) {
    return <LoginForm />;
  }

  /* ---- Must change password -------------------------------------------- */
  if (user?.mustChangePassword) {
    return <ForcePasswordChange />;
  }

  /* ---- Authenticated — queue dashboard (Phase 6.3 placeholder) --------- */
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
        <MonitorDot size={20} className="text-primary" />
      </div>
      <div className="text-center">
        <h1 className="text-xl font-bold text-foreground">
          Welcome, {user?.email}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Queue dashboard — coming in Phase 6.3
        </p>
      </div>
      <p className="text-xs text-muted-foreground">Role: {user?.role}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Exported root — wraps with providers                                     */
/* -------------------------------------------------------------------------- */

export function App() {
  return (
    <AuthProvider>
      <TellerApp />
    </AuthProvider>
  );
}
