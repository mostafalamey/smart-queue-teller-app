/**
 * ForcePasswordChange — mandatory password change screen.
 *
 * Shown when `user.mustChangePassword === true` after login.
 * Prevents access to the queue dashboard until the password is changed.
 */

import React, { useState } from "react";
import { Eye, EyeOff, KeyRound, ShieldAlert } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Spinner } from "./ui/spinner";
import { cn } from "../lib/utils";
import type { ApiError } from "../data/types";

/* -------------------------------------------------------------------------- */
/*  Validation helpers                                                        */
/* -------------------------------------------------------------------------- */

const MIN_PASSWORD_LENGTH = 8;

function validateNewPassword(value: string): string | null {
  if (value.length < MIN_PASSWORD_LENGTH)
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function ForcePasswordChange() {
  const { changePassword, logout, isLoading, user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    // Client-side validation
    const pwErr = validateNewPassword(newPassword);
    if (pwErr) {
      setValidationError(pwErr);
      return;
    }
    if (newPassword !== confirmPassword) {
      setValidationError("Passwords do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setValidationError("New password must differ from the current password.");
      return;
    }
    setValidationError(null);

    try {
      await changePassword({
        currentPassword,
        newPassword,
        ...(displayName.trim() && { name: displayName.trim() }),
      });
      // On success, AuthContext sets mustChangePassword = false
      // The parent App router will automatically redirect to the dashboard.
    } catch (err) {
      const apiErr = err as ApiError;
      setSubmitError(apiErr.message ?? "Failed to change password.");
    }
  };

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= MIN_PASSWORD_LENGTH &&
    confirmPassword.length > 0 &&
    !isLoading;

  const displayError = submitError ?? validationError;

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-background">
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% -10%, oklch(0.5676 0.2021 283.0838 / 0.12), transparent)",
        }}
      />

      <div className="relative z-10 w-full max-w-sm px-4">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-3 flex items-center justify-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-500/15 ring-1 ring-yellow-500/30">
              <KeyRound size={18} className="text-yellow-600 dark:text-yellow-400" />
            </div>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Password Change Required
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome,{" "}
            <span className="font-medium text-foreground">{user?.email}</span>.
            <br />
            Please set a new password to continue.
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-border bg-card shadow-lg shadow-black/10">
          <div className="p-6">
            <form onSubmit={(e) => void handleSubmit(e)} noValidate>
              {/* Display name (optional) */}
              <div className="mb-4 space-y-1.5">
                <Label htmlFor="display-name">Display Name</Label>
                <Input
                  id="display-name"
                  type="text"
                  autoComplete="name"
                  autoFocus
                  placeholder="e.g. Dr. Ahmad Ali"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={isLoading}
                />
                <p className="text-[11px] text-muted-foreground">
                  Optional — shown in the header instead of your email.
                </p>
              </div>

              {/* Current password */}
              <div className="mb-4 space-y-1.5">
                <Label htmlFor="current-password">Current Password</Label>
                <div className="relative">
                  <Input
                    id="current-password"
                    type={showCurrent ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    disabled={isLoading}
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none"
                    aria-label={showCurrent ? "Hide" : "Show"}
                  >
                    {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* New password */}
              <div className="mb-4 space-y-1.5">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNew ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Minimum 8 characters"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setValidationError(null);
                    }}
                    disabled={isLoading}
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none"
                    aria-label={showNew ? "Hide" : "Show"}
                    aria-pressed={showNew}
                  >
                    {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {/* Password strength bar */}
                {newPassword.length > 0 && (
                  <PasswordStrengthBar password={newPassword} />
                )}
              </div>

              {/* Confirm password */}
              <div className="mb-5 space-y-1.5">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setValidationError(null);
                  }}
                  disabled={isLoading}
                  className={cn(
                    confirmPassword.length > 0 &&
                      confirmPassword !== newPassword &&
                      "border-destructive/60",
                  )}
                />
              </div>

              {/* Error */}
              {displayError && (
                <div
                  role="alert"
                  className="mb-5 flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2.5 text-xs text-destructive"
                >
                  <ShieldAlert size={13} className="mt-0.5 shrink-0" />
                  <span>{displayError}</span>
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={!canSubmit}
              >
                {isLoading ? (
                  <>
                    <Spinner size={15} />
                    Updating password…
                  </>
                ) : (
                  "Set New Password"
                )}
              </Button>
            </form>
          </div>

          <div className="flex items-center justify-center rounded-b-xl border-t border-border px-4 py-2.5">
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              onClick={() => void logout()}
              disabled={isLoading}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Password strength bar                                                     */
/* -------------------------------------------------------------------------- */

function PasswordStrengthBar({ password }: { password: string }) {
  const score = getPasswordScore(password);
  const segments = 4;
  const filled = Math.ceil(score * segments);

  const color =
    score < 0.35
      ? "bg-destructive"
      : score < 0.6
        ? "bg-yellow-500"
        : score < 0.85
          ? "bg-blue-500"
          : "bg-green-500";

  const label =
    score < 0.35
      ? "Weak"
      : score < 0.6
        ? "Fair"
        : score < 0.85
          ? "Good"
          : "Strong";

  return (
    <div className="mt-1.5">
      <div className="flex gap-1">
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i < filled ? color : "bg-muted",
            )}
          />
        ))}
      </div>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function getPasswordScore(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score += 0.25;
  if (pw.length >= 12) score += 0.2;
  if (/[A-Z]/.test(pw)) score += 0.2;
  if (/[0-9]/.test(pw)) score += 0.2;
  if (/[^A-Za-z0-9]/.test(pw)) score += 0.15;
  return Math.min(score, 1);
}
