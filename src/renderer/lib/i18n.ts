/**
 * Bilingual strings for the authenticated teller view (dashboard + action panel).
 *
 * Keys are grouped by component area to maintain clear ownership.
 */

const strings = {
  en: {
    /* ── StationInfo / header ─── */
    logout: "Sign out",
    logoutConfirm: "Sign out?",
    logoutYes: "Yes, sign out",
    logoutCancel: "Cancel",

    /* ── Metric cards ─── */
    waiting: "Waiting",
    serving: "Serving",
    doneToday: "Done today",
    noShows: "No-shows",

    /* ── Current ticket card ─── */
    counterReady: "Counter ready",
    noActiveTicket: "No active ticket",
    statusServing: "Serving",
    statusCalled: "Called",

    /* ── Priority ─── */
    emergency: "Emergency",
    vip: "VIP",
    normal: "Normal",
    priorityPhrase: (level: string) => `${level} priority`,

    /* ── Waiting list ─── */
    waitingHeader: "Waiting",
    queueEmpty: "Queue is empty",

    /* ── Action panel ─── */
    callNext: "Call Next",
    startServing: "Start Serving",
    recall: "Recall",
    noShow: "No-Show",
    confirmNoShow: "Confirm No-Show",
    confirmNoShowPrompt: (ticket: string) => `Mark ${ticket} as No-Show?`,
    cancel: "Cancel",
    complete: "Complete",
    transfer: "Transfer",

    /* ── Action errors ─── */
    errQueueEmpty: "No patients waiting in queue",
    errTicketNotFound: "Ticket no longer exists — queue state refreshed",
    errInvalidTransition: "Action not available for the current ticket status",
    errStationNotFound: "Station binding error — contact IT",
    errForbidden: "Service mismatch or insufficient permissions for this station",
    errActiveTicketExists: "You already have an active ticket at this station",
    errInvalidTransferReason: "Invalid transfer reason — please select a valid option",
    errActionFailed: "Action failed",
    errLoadFailed: "Failed to load queue data",
    retry: "Retry",

    /* ── Offline banner ─── */
    connectionLost: "Connection lost — actions disabled",
    degradedConnection: "Degraded connection — some features may be slow",
    lastUpdated: "Last updated",
    justNow: "just now",

    /* ── Transfer dialog steps ─── */
    department: "Department",
    service: "Service",
    reason: "Reason",
    transferTicket: "Transfer Ticket",
    selectDepartment: "Select Department",
    servicesIn: (dept: string) => `Services in ${dept}`,
    reasonForTransfer: "Reason for Transfer",
    transferringTo: "Transferring to",
    noDepartments: "No departments available",
    noServices: "No other services available in this department",
    noReasons: "No transfer reasons configured",
    fetchTransferError: "Failed to load transfer data. Please close and try again.",
    fetchServicesError: "Failed to load services for this department.",
    back: "Back",
    confirmTransfer: "Confirm Transfer",
    transferring: "Transferring…",
    transferFailed: "Transfer failed",

    /* ── Shortcut panel ─── */
    shortcutReference: "Keyboard Shortcuts",
    scCallNext: "Call Next",
    scStartServing: "Start Serving",
    scRecall: "Recall Patient",
    scSkipNoShow: "Skip / No-Show",
    scComplete: "Complete Service",
    scTransfer: "Transfer Patient",
    scShowPanel: "Show / Hide This Panel",
    scCloseDialog: "Close Dialog / Panel",
    scCondNoActive: "No active ticket",
    scCondCalled: "Ticket called",
    scCondServing: "Ticket serving",
    scCondAnyActive: "Any active ticket",
    scCondAlways: "Always",
    scCondWhenOpen: "When open",
    scFooter: "to close",

    /* ── Connection status ─── */
    connLive: "Live",
    connReconnecting: "Reconnecting…",
    connOffline: "Offline",
    connLastAt: "Last connected",

    /* ── Language toggle ─── */
    langToggle: "عربي",
  },
  ar: {
    /* ── StationInfo / header ─── */
    logout: "تسجيل الخروج",
    logoutConfirm: "تسجيل الخروج؟",
    logoutYes: "نعم، خروج",
    logoutCancel: "إلغاء",

    /* ── Metric cards ─── */
    waiting: "بالانتظار",
    serving: "يتم الخدمة",
    doneToday: "اكتمل اليوم",
    noShows: "لم يحضر",

    /* ── Current ticket card ─── */
    counterReady: "المحطة جاهزة",
    noActiveTicket: "لا يوجد تذكرة نشطة",
    statusServing: "يتم الخدمة",
    statusCalled: "تم الاستدعاء",

    /* ── Priority ─── */
    emergency: "طوارئ",
    vip: "VIP",
    normal: "عادي",
    priorityPhrase: (level: string) => `أولوية: ${level}`,

    /* ── Waiting list ─── */
    waitingHeader: "قائمة الانتظار",
    queueEmpty: "الطابور فارغ",

    /* ── Action panel ─── */
    callNext: "استدعاء التالي",
    startServing: "بدء الخدمة",
    recall: "إعادة الاستدعاء",
    noShow: "لم يحضر",
    confirmNoShow: "تأكيد عدم الحضور",
    confirmNoShowPrompt: (ticket: string) => `تسجيل ${ticket} كـ لم يحضر؟`,
    cancel: "إلغاء",
    complete: "إكمال",
    transfer: "تحويل",

    /* ── Action errors ─── */
    errQueueEmpty: "لا يوجد مرضى في الانتظار",
    errTicketNotFound: "التذكرة لم تعد موجودة — تم تحديث الطابور",
    errInvalidTransition: "الإجراء غير متاح لحالة التذكرة الحالية",
    errStationNotFound: "خطأ في ربط المحطة — تواصل مع تقنية المعلومات",
    errForbidden: "عدم تطابق الخدمة أو صلاحيات غير كافية",
    errActiveTicketExists: "لديك تذكرة نشطة بالفعل في هذه المحطة",
    errInvalidTransferReason: "سبب التحويل غير صالح — اختر خياراً مناسباً",
    errActionFailed: "فشل الإجراء",
    errLoadFailed: "فشل تحميل بيانات الطابور",
    retry: "إعادة المحاولة",

    /* ── Offline banner ─── */
    connectionLost: "انقطع الاتصال — الإجراءات معطّلة",
    degradedConnection: "اتصال ضعيف — قد تكون بعض الميزات بطيئة",
    lastUpdated: "آخر تحديث",
    justNow: "الآن",

    /* ── Transfer dialog steps ─── */
    department: "القسم",
    service: "الخدمة",
    reason: "السبب",
    transferTicket: "تحويل التذكرة",
    selectDepartment: "اختر القسم",
    servicesIn: (dept: string) => `خدمات ${dept}`,
    reasonForTransfer: "سبب التحويل",
    transferringTo: "التحويل إلى",
    noDepartments: "لا توجد أقسام متاحة",
    noServices: "لا توجد خدمات أخرى متاحة في هذا القسم",
    noReasons: "لم يتم تهيئة أسباب التحويل",
    fetchTransferError: "فشل تحميل بيانات التحويل. أغلق وحاول مرة أخرى.",
    fetchServicesError: "فشل تحميل خدمات هذا القسم.",
    back: "رجوع",
    confirmTransfer: "تأكيد التحويل",
    transferring: "جاري التحويل…",
    transferFailed: "فشل التحويل",

    /* ── Shortcut panel ─── */
    shortcutReference: "اختصارات لوحة المفاتيح",
    scCallNext: "استدعاء التالي",
    scStartServing: "بدء الخدمة",
    scRecall: "إعادة استدعاء المريض",
    scSkipNoShow: "تخطي / لم يحضر",
    scComplete: "إتمام الخدمة",
    scTransfer: "تحويل المريض",
    scShowPanel: "إظهار / إخفاء هذه القائمة",
    scCloseDialog: "إغلاق الحوار / اللوحة",
    scCondNoActive: "لا تذكرة نشطة",
    scCondCalled: "تم استدعاء التذكرة",
    scCondServing: "التذكرة قيد الخدمة",
    scCondAnyActive: "أي تذكرة نشطة",
    scCondAlways: "دائماً",
    scCondWhenOpen: "عند الفتح",
    scFooter: "للإغلاق",

    /* ── Connection status ─── */
    connLive: "متصل",
    connReconnecting: "جاري إعادة الاتصال…",
    connOffline: "غير متصل",
    connLastAt: "آخر اتصال",

    /* ── Language toggle ─── */
    langToggle: "English",
  },
} as const;

/** Structural type for any language variant (widened from literal strings). */
export type DashboardStrings = {
  [K in keyof (typeof strings)["en"]]: (typeof strings)["en"][K] extends (...args: infer A) => infer R
    ? (...args: A) => R
    : string;
};
export default strings;
