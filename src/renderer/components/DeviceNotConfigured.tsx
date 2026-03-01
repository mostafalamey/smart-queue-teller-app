/**
 * DeviceNotConfigured — full-screen setup screen shown when this PC's Device ID
 * is not yet registered or not assigned to a counter station in the Admin app.
 *
 * Shows the Device ID prominently so the operator can relay it to IT.
 * Provides a Retry button that re-runs the station binding resolution after IT
 * completes the setup.
 *
 * Design mirrors the LoginForm dark-card aesthetic.
 */

import { useState } from "react";
import {
  Check,
  Copy,
  Globe,
  MonitorOff,
  RefreshCw,
  ServerCrash,
  ShieldAlert,
} from "lucide-react";
import { useStation } from "../hooks/useStation";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import { cn } from "../lib/utils";

/* -------------------------------------------------------------------------- */
/*  i18n strings                                                              */
/* -------------------------------------------------------------------------- */

const strings = {
  en: {
    titleUnregistered: "Device Not Configured",
    titleError: "Cannot Reach Server",
    descriptionUnregistered:
      "This PC has not been assigned to a counter station. " +
      "Please ask your IT administrator to register this device in the Admin app.",
    descriptionError:
      "Could not connect to the server to verify this device. " +
      "Check the network connection and try again.",
    deviceIdLabel: "Device ID",
    deviceIdHint: "Share this ID with IT to register this device.",
    copyLabel: "Copy",
    copiedLabel: "Copied!",
    retryLabel: "Retry",
    checkingLabel: "Checking…",
    instructions: "IT Setup: Admin app → User Experience → Mapping → Add Device, then assign it to a counter station.",
    langToggle: "عربي",
  },
  ar: {
    titleUnregistered: "الجهاز غير مُهيَّأ",
    titleError: "تعذّر الوصول إلى الخادم",
    descriptionUnregistered:
      "لم يتم تعيين هذا الجهاز لمحطة عداد. " +
      "يُرجى مطالبة مسؤول تقنية المعلومات بتسجيل هذا الجهاز في تطبيق الإدارة.",
    descriptionError:
      "تعذّر الاتصال بالخادم للتحقق من هذا الجهاز. " +
      "تحقق من اتصال الشبكة وأعد المحاولة.",
    deviceIdLabel: "معرّف الجهاز",
    deviceIdHint: "أرسل هذا المعرّف لفريق تقنية المعلومات لتسجيل الجهاز.",
    copyLabel: "نسخ",
    copiedLabel: "تم النسخ!",
    retryLabel: "إعادة المحاولة",
    checkingLabel: "جارٍ الفحص…",
    instructions: "إعداد تقنية المعلومات: تطبيق الإدارة ← تجربة المستخدم ← الربط ← إضافة جهاز، ثم تعيينه لمحطة عداد.",
    langToggle: "English",
  },
} as const;

type Lang = "en" | "ar";

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function DeviceNotConfigured() {
  const { status, deviceId, error, retry } = useStation();
  const [lang, setLang] = useState<Lang>("en");
  const [copied, setCopied] = useState(false);

  const t = strings[lang];
  const isRtl = lang === "ar";
  const isError = status === "error";
  const isResolving = status === "resolving";

  const handleCopy = () => {
    if (!deviceId) return;
    void navigator.clipboard.writeText(deviceId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const title = isError ? t.titleError : t.titleUnregistered;
  const description = isError ? t.descriptionError : t.descriptionUnregistered;
  const Icon = isError ? ServerCrash : MonitorOff;
  const iconColour = isError
    ? "bg-destructive/15 ring-destructive/30 text-destructive"
    : "bg-yellow-500/15 ring-yellow-500/30 text-yellow-500";

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className="relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden bg-background"
    >
      {/* ── Ambient glow ─────────────────────────────────────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% -5%, oklch(0.7 0.15 85 / 0.10), transparent)",
        }}
      />

      {/* ── Language toggle ──────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setLang((l) => (l === "en" ? "ar" : "en"))}
        className="absolute right-4 top-4 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Toggle language"
      >
        <Globe size={13} />
        {t.langToggle}
      </button>

      {/* ── Card ─────────────────────────────────────────────────────────── */}
      <div className="relative z-10 w-full max-w-sm px-4">
        {/* Icon + heading */}
        <div className={cn("mb-6 flex flex-col items-center gap-3", isRtl && "items-center")}>
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-xl ring-1",
              iconColour,
            )}
          >
            <Icon size={22} />
          </div>
          <h1 className="text-xl font-bold text-foreground">{title}</h1>
          <p className={cn("text-sm text-muted-foreground", isRtl ? "text-right" : "text-center")}>
            {description}
          </p>
        </div>

        {/* Device ID card */}
        <div className="mb-4 rounded-xl border border-border bg-card p-5 shadow-lg shadow-black/10">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            {t.deviceIdLabel}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-hidden text-ellipsis rounded-md bg-muted/50 px-3 py-2 font-mono text-xs leading-5 text-foreground select-all">
              {deviceId ?? "—"}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!deviceId}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border transition-colors",
                copied
                  ? "border-green-500/40 bg-green-500/10 text-green-500"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              aria-label={copied ? t.copiedLabel : t.copyLabel}
              title={copied ? t.copiedLabel : t.copyLabel}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">{t.deviceIdHint}</p>
        </div>

        {/* IT instructions banner */}
        <div
          className={cn(
            "mb-5 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3",
            isRtl ? "text-right" : "text-left",
          )}
        >
          <div className="flex items-start gap-2">
            <ShieldAlert
              size={13}
              className={cn("mt-0.5 shrink-0 text-blue-500", isRtl && "order-last")}
            />
            <p className="text-[11px] leading-relaxed text-blue-600 dark:text-blue-400">
              {t.instructions}
            </p>
          </div>
        </div>

        {/* Network error detail */}
        {isError && error && (
          <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5">
            <p className="font-mono text-[10px] text-muted-foreground">
              {error.code}: {error.message}
            </p>
          </div>
        )}

        {/* Retry button */}
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={retry}
          disabled={isResolving}
        >
          {isResolving ? (
            <>
              <Spinner size={14} />
              {t.checkingLabel}
            </>
          ) : (
            <>
              <RefreshCw size={14} />
              {t.retryLabel}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
