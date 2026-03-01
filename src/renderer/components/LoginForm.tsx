/**
 * LoginForm — staff sign-in screen for the Teller App.
 *
 * Design: refined dark-panel aesthetic with layered depth.
 * - Bilingual (English / Arabic) toggle.
 * - Station ID display (read-only device binding info for IT).
 * - Account lockout messaging with countdown.
 * - Contextual error states (credentials, network, locked).
 */

import React, { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Globe, MonitorDot, ShieldAlert, Wifi, WifiOff } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useStation } from "../hooks/useStation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Spinner } from "./ui/spinner";
import { cn } from "../lib/utils";
import type { ApiError } from "../data/types";

/* -------------------------------------------------------------------------- */
/*  i18n strings                                                              */
/* -------------------------------------------------------------------------- */

const strings = {
  en: {
    appName: "Smart Queue",
    appSubtitle: "Teller Workstation",
    emailLabel: "Email address",
    emailPlaceholder: "staff@hospital.org",
    passwordLabel: "Password",
    passwordPlaceholder: "••••••••",
    signIn: "Sign In",
    signingIn: "Signing in…",
    stationLabel: "Station ID",
    stationUnknown: "Resolving…",
    versionLabel: "v",
    errorTitle: "Sign-in failed",
    networkError: "Cannot reach the server. Check your connection.",
    timeoutError: "Request timed out. The server may be unavailable.",
    invalidCredentials: "Invalid email or password.",
    forbidden: "Your account does not have teller access.",
    sessionExpired: "Your session has expired. Please sign in again.",
    lockedPrefix: "Account locked.",
    lockedSuffix: " Try again in",
    lockedMinutes: (s: number) => {
      const m = Math.ceil(s / 60);
      return ` ${m} minute${m !== 1 ? "s" : ""}`;
    },
    unknown: "An unexpected error occurred.",
    deviceIdWarning: "Device ID not persisted — contact IT support.",
    langToggle: "عربي",
  },
  ar: {
    appName: "الطابور الذكي",
    appSubtitle: "محطة الموظف",
    emailLabel: "البريد الإلكتروني",
    emailPlaceholder: "staff@hospital.org",
    passwordLabel: "كلمة المرور",
    passwordPlaceholder: "••••••••",
    signIn: "تسجيل الدخول",
    signingIn: "جارٍ تسجيل الدخول…",
    stationLabel: "معرّف المحطة",
    stationUnknown: "جارٍ التحميل…",
    versionLabel: "v",
    errorTitle: "فشل تسجيل الدخول",
    networkError: "تعذّر الوصول إلى الخادم. تحقق من الاتصال.",
    timeoutError: "انتهت مهلة الطلب. قد يكون الخادم غير متاح.",
    invalidCredentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    forbidden: "لا يملك حسابك صلاحية الوصول إلى هذا التطبيق.",
    sessionExpired: "انتهت صلاحية جلستك. يرجى تسجيل الدخول مجدداً.",
    lockedPrefix: "الحساب مقفل.",
    lockedSuffix: " يمكنك إعادة المحاولة بعد",
    lockedMinutes: (s: number) => {
      const m = Math.ceil(s / 60);
      return ` ${m} ${m === 1 ? "دقيقة" : "دقائق"}`;
    },
    unknown: "حدث خطأ غير متوقع.",
    deviceIdWarning: "لم يتم حفظ معرّف الجهاز — تواصل مع الدعم التقني.",
    langToggle: "English",
  },
} as const;

type Lang = "en" | "ar";

/* -------------------------------------------------------------------------- */
/*  Error message resolver                                                    */
/* -------------------------------------------------------------------------- */

function resolveErrorMessage(
  err: ApiError,
  t: (typeof strings)[Lang],
): string {
  switch (err.code) {
    case "NETWORK_ERROR":
      return t.networkError;
    case "TIMEOUT":
      return t.timeoutError;
    case "INVALID_CREDENTIALS":
      return t.invalidCredentials;
    case "FORBIDDEN":
      return t.forbidden;
    case "SESSION_EXPIRED":
      return t.sessionExpired;
    case "ACCOUNT_LOCKED": {
      const secs = err.lockedUntilSeconds ?? 0;
      return `${t.lockedPrefix}${t.lockedSuffix}${t.lockedMinutes(secs)}.`;
    }
    default:
      return err.message || t.unknown;
  }
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function LoginForm() {
  const { login, isLoading, error, clearError } = useAuth();
  const { binding, deviceIdPersisted } = useStation();
  const [lang, setLang] = useState<Lang>("en");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);

  const t = strings[lang];
  const isRtl = lang === "ar";

  /* ---- Load runtime values -------------------------------------------- */
  useEffect(() => {
    const runtime = window.tellerRuntime;
    if (!runtime) return;
    runtime.getAppVersion().then(setAppVersion).catch(() => setAppVersion(""));
  }, []);

  /* ---- Focus email on mount ------------------------------------------- */
  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  /* ---- Clear error on input change ------------------------------------ */
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (error) clearError();
    setEmail(e.target.value);
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (error) clearError();
    setPassword(e.target.value);
  };

  /* ---- Submit --------------------------------------------------------- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    await login({
      email: email.trim().toLowerCase(),
      password,
      requestedRole: "STAFF",
      stationId: binding?.stationId,
    }).catch(() => {
      /* error is captured in context state */
    });
  };

  const errorMessage = error ? resolveErrorMessage(error, t) : null;
  const isLocked = error?.code === "ACCOUNT_LOCKED";
  const isNetworkIssue =
    error?.code === "NETWORK_ERROR" || error?.code === "TIMEOUT";

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-background"
    >
      {/* ---- Ambient background glow ----------------------------------- */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% -10%, oklch(0.5676 0.2021 283.0838 / 0.12), transparent)",
        }}
      />

      {/* ---- Language toggle (top-right) -------------------------------- */}
      <button
        type="button"
        onClick={() => setLang((l) => (l === "en" ? "ar" : "en"))}
        className="absolute right-4 top-4 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Toggle language"
      >
        <Globe size={13} />
        {t.langToggle}
      </button>

      {/* ---- Login card ------------------------------------------------- */}
      <div className="relative z-10 w-full max-w-sm px-4">
        {/* Header */}
        <div className={cn("mb-8 text-center", isRtl && "text-right")}>
          <div className="mb-3 flex items-center justify-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
              <MonitorDot size={18} className="text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t.appName}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t.appSubtitle}
          </p>
        </div>

        {/* Card body */}
        <div className="rounded-xl border border-border bg-card shadow-lg shadow-black/10">
          <div className="p-6">
            {/* Device ID not persisted warning */}
            {!deviceIdPersisted && (
              <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-yellow-500/30 bg-yellow-500/8 px-3 py-2.5 text-xs text-yellow-600 dark:text-yellow-400">
                <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                <span>{t.deviceIdWarning}</span>
              </div>
            )}

            <form onSubmit={(e) => void handleSubmit(e)} noValidate>
              {/* Email */}
              <div className="mb-4 space-y-1.5">
                <Label htmlFor="email">{t.emailLabel}</Label>
                <Input
                  id="email"
                  ref={emailRef}
                  type="email"
                  autoComplete="email"
                  placeholder={t.emailPlaceholder}
                  value={email}
                  onChange={handleEmailChange}
                  disabled={isLoading}
                  aria-invalid={!!error}
                  aria-describedby={error ? "login-error" : undefined}
                  className={cn(
                    isRtl && "text-right",
                    error &&
                      "border-destructive/60 focus-visible:ring-destructive/50",
                  )}
                />
              </div>

              {/* Password */}
              <div className="mb-5 space-y-1.5">
                <Label htmlFor="password">{t.passwordLabel}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder={t.passwordPlaceholder}
                    value={password}
                    onChange={handlePasswordChange}
                    disabled={isLoading}
                    aria-invalid={!!error}
                    className={cn(
                      isRtl ? "pl-9 text-right" : "pr-9",
                      error &&
                        "border-destructive/60 focus-visible:ring-destructive/50",
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className={cn(
                      "absolute top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none",
                      isRtl ? "left-2.5" : "right-2.5",
                    )}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Error banner */}
              {errorMessage && (
                <div
                  id="login-error"
                  role="alert"
                  className={cn(
                    "mb-5 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs",
                    isLocked
                      ? "border-yellow-500/30 bg-yellow-500/8 text-yellow-700 dark:text-yellow-400"
                      : isNetworkIssue
                        ? "border-blue-500/30 bg-blue-500/8 text-blue-700 dark:text-blue-400"
                        : "border-destructive/30 bg-destructive/8 text-destructive",
                  )}
                >
                  {isNetworkIssue ? (
                    <WifiOff size={13} className="mt-0.5 shrink-0" />
                  ) : (
                    <ShieldAlert size={13} className="mt-0.5 shrink-0" />
                  )}
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Submit */}
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isLoading || !email.trim() || !password}
              >
                {isLoading ? (
                  <>
                    <Spinner size={15} />
                    {t.signingIn}
                  </>
                ) : (
                  t.signIn
                )}
              </Button>
            </form>
          </div>

          {/* Footer stripe */}
          <div className="flex items-center justify-between rounded-b-xl border-t border-border bg-muted/30 px-4 py-2.5">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <MonitorDot size={11} />
              <span className="font-mono">
                {binding?.counterCode ?? t.stationUnknown}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {navigator.onLine ? (
                <Wifi size={11} className="text-green-500" />
              ) : (
                <WifiOff size={11} className="text-destructive" />
              )}
              {appVersion && (
                <span>
                  {t.versionLabel}
                  {appVersion}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
