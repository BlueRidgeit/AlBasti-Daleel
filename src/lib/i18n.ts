export type AppLocale = "ar" | "en";

const builtInDefaultLocale: AppLocale = "ar";

// Optional deployment-level default (DALEEL_DEFAULT_LOCALE=en|ar). Server reads the env var;
// the browser reads the copy the root layout injects into window.__ALBASTI_PUBLIC_ENV__.
// Unset keeps the original behaviour (Arabic, or the browser language when it is Arabic).
export const getConfiguredLocale = (): AppLocale | undefined => {
  const raw =
    typeof window === "undefined"
      ? process.env.DALEEL_DEFAULT_LOCALE
      : (window as unknown as { __ALBASTI_PUBLIC_ENV__?: { defaultLocale?: string } })
          .__ALBASTI_PUBLIC_ENV__?.defaultLocale;
  const value = raw?.trim().toLowerCase();
  return value === "en" || value === "ar" ? value : undefined;
};

export const getDefaultLocale = (): AppLocale =>
  getConfiguredLocale() ?? builtInDefaultLocale;

export const localeLabels: Record<AppLocale, string> = {
  ar: "العربية",
  en: "English",
};

export const starterPrompts: Record<AppLocale, string[]> = {
  ar: [
    "ما القضايا أو المستندات المتاحة لي اليوم؟",
    "ابحث عن ملف له علاقة بتنفيذ مدني واذكر الرابط الأصلي.",
    "اقرأ هذا المستند بالتفصيل واشرح أهم النقاط القانونية.",
  ],
  en: [
    "What cases or documents are available to me today?",
    "Find a file related to civil execution and include the original link.",
    "Read this document in detail and explain the key legal points.",
  ],
};

export const placeholderHistory = {
  ar: [
    {
      label: "اليوم",
      items: ["تنفيذ مدني: ملخص المستندات"],
    },
    {
      label: "أمس",
      items: ["مراجعة مذكرة قانونية"],
    },
    {
      label: "الأسبوع الماضي",
      items: ["بحث عن ملفات متعلقة بالجلسات"],
    },
    {
      label: "الشهر الماضي",
      items: [],
    },
    {
      label: "منذ فترة طويلة",
      items: [],
    },
  ],
  en: [
    {
      label: "Today",
      items: ["Civil execution document review"],
    },
    {
      label: "Yesterday",
      items: ["Legal memo discussion"],
    },
    {
      label: "Last week",
      items: ["Session file lookup"],
    },
    {
      label: "Last month",
      items: [],
    },
    {
      label: "Long time ago",
      items: [],
    },
  ],
} satisfies Record<AppLocale, Array<{ label: string; items: string[] }>>;

export const appCopy = {
  ar: {
    badge: "الذكاء القانوني من البستي",
    title: "دليل",
    tagline: "ذكاءك الاصطناعي للمعلومات القانونية.",
    description:
      "ابحث في المستودع المفهرس بسرعة، ثم انتقل إلى قراءة أعمق للمستند عندما يحتاج المحامي إلى تفاصيل من الملف الأصلي.",
    cards: [
      {
        title: "البحث في المستودع",
        description:
          "يعتمد على Azure AI Search للوصول السريع إلى المستندات القانونية المفهرسة.",
      },
      {
        title: "قراءة المستند",
        description:
          "يستخدم أداة قراءة مخصصة للتحليل الأعمق على مستوى الملف.",
      },
      {
        title: "نموذج الأمان",
        description:
          "مصمم ليتكامل مع Entra وتفويض SharePoint وفق صلاحيات كل محامٍ.",
      },
    ],
    starterPromptLabel: "مطالبات البداية",
    workspaceBadge: "Foundry + Search + SharePoint",
    workspaceTitle: "مساحة عمل أبحاث القضايا",
    workspaceDescription:
      "يفصل بين العربية والإنجليزية، ويعيد روابط المستندات الأصلية عند توفرها، ويستخدم هوية المحامي للوصول إلى ملفات SharePoint.",
    composerPlaceholder: "اسأل عن قضية أو جلسة أو مستند...",
    welcomeBadge: "مساعد قانوني موثّق",
    welcomeTitle: "ابدأ من ملف أو قضية أو سؤال قانوني.",
    welcomeDescription:
      "تبدأ هذه المساحة بالبحث في المستودع القانوني، ثم تنتقل إلى قراءة مستند محدد عند الحاجة إلى مراجعة أعمق.",
    scrollToBottom: "الانتقال إلى الأسفل",
    send: "إرسال الرسالة",
    stop: "إيقاف التوليد",
    addAttachment: "إضافة مرفق",
    authSetupPending: "إعداد تسجيل الدخول غير مكتمل",
    authSignedIn: "تم تسجيل الدخول",
    authSignedOut: "غير مسجل الدخول",
    signIn: "تسجيل الدخول",
    signOut: "تسجيل الخروج",
    liveAccessReady: "القراءة المباشرة من SharePoint مفعلة لهذا المستخدم.",
    liveAccessRequiresSignIn:
      "سجّل الدخول لتمكين القراءة المباشرة من SharePoint وفق صلاحياتك.",
    navLabel: "التنقل",
    navNewChat: "محادثة جديدة",
    navHistory: "سجل المحادثات",
    historyDelete: "حذف",
    historyDeleteConfirm: "حذف هذه المحادثة؟",
    historyPin: "تثبيت",
    historyUnpin: "إلغاء التثبيت",
    navProjects: "المشاريع",
    pinnedHeading: "المثبتة",
    recentHeading: "الأخيرة",
    viewAll: "عرض الكل",
    accountSettings: "الإعدادات",
    accountLanguage: "اللغة",
    menuRename: "إعادة تسمية",
    menuAddToProject: "إضافة إلى مشروع",
    menuChangeProject: "تغيير المشروع",
    menuRemoveFromProject: "إزالة من المشروع",
    menuMoveUp: "تحريك لأعلى",
    menuMoveDown: "تحريك لأسفل",
    projectsTitle: "المشاريع",
    projectsEmpty: "لا توجد مشاريع بعد.",
    projectsNew: "مشروع جديد",
    projectsCreate: "إنشاء",
    projectNamePlaceholder: "اسم المشروع",
    projectChatsEmpty: "لا توجد محادثات في هذا المشروع.",
    projectDelete: "حذف المشروع",
    projectDeleteConfirm: "حذف هذا المشروع؟ ستبقى محادثاته بدون مشروع.",
    projectDeleteBody: "سيتم حذف هذا المشروع.",
    projectDeleteChatsOption: "حذف المحادثات المرتبطة به أيضًا",
    cancel: "إلغاء",
    saveLabel: "حفظ",
    allProjects: "كل المشاريع",
    projectSearchPlaceholder: "ابحث في المشاريع...",
    projectModalCreateTitle: "إنشاء مشروع",
    projectModalEditTitle: "تعديل التفاصيل",
    projectWorkingOn: "ما الذي تعمل عليه؟",
    projectAchieve: "ما الذي تريد تحقيقه؟",
    projectDescPlaceholder: "صف مشروعك وأهدافه وموضوعه...",
    projectCreateBtn: "إنشاء المشروع",
    menuEditDetails: "تعديل التفاصيل",
    projectComposerPlaceholder: "كيف يمكنني مساعدتك اليوم؟",
    projectStartHint: "ابدأ محادثة لتنظيم محادثاتك وإعادة استخدام معرفة المشروع.",
    chatsTitle: "المحادثات",
    chatsSearchPlaceholder: "ابحث في المحادثات...",
    chatsEmpty: "لا توجد محادثات.",
    selectLabel: "تحديد",
    selectAll: "تحديد الكل",
    queryBuilderTitle: "بحث متقدم",
    qbAllWords: "مع كافة الكلمات",
    qbAnyWords: "مع أي كلمة من الكلمات",
    qbExactPhrase: "مع نفس العبارة بالضبط",
    qbWithoutWords: "بدون الكلمات",
    qbPartWords: "مع جزء من الكلمات",
    sortBy: "ترتيب حسب",
    sortLastUpdated: "آخر تحديث",
    sortName: "الاسم",
    sortCreated: "تاريخ الإنشاء",
    updatedPrefix: "آخر تحديث",
    qbFileType: "نوع الملف",
    ftWord: "Word",
    ftPdf: "PDF",
    ftText: "نص",
    ftExcel: "Excel",
    ftPowerpoint: "PowerPoint",
    ftImage: "صورة",
    qbFind: "بحث",
    qbClear: "مسح",
    resultsTitle: "نتائج البحث",
    resultsEmpty: "لا توجد مستندات مطابقة.",
    resultsSearching: "جارٍ البحث…",
    openInSharePoint: "فتح في SharePoint",
    openFolder: "فتح المجلد",
    sourcesHeading: "المصادر",
    backLabel: "رجوع",
    navSettings: "إعدادات الحساب",
    navCollapsePanel: "إخفاء اللوحة الجانبية",
    navExpandPanel: "إظهار اللوحة الجانبية",
    navComingSoon: "قريبًا",
    accountSection: "الحساب",
    lockedTitle: "يلزم تسجيل الدخول للوصول إلى الوكيل",
    lockedDescription:
      "يجب تسجيل الدخول أولًا حتى يتمكن النظام من استخدام صلاحياتك في SharePoint وقراءة المستندات بشكل آمن.",
    lockedButton: "المتابعة إلى تسجيل الدخول",
    supportPanelTitle: "لوحة المساعد",
    supportPanelDescription:
      "حدّد المكتبات التي تريد قصر البحث عليها.",
    librariesTitle: "مكتبات البحث",
    librariesClear: "الكل",
    librariesEmpty: "لا توجد مكتبات مفهرسة بعد.",
    librariesAllHint: "يشمل البحث جميع المكتبات.",
    librariesScopedHint: "يقتصر البحث على المكتبات المحددة.",
    adminLibrariesTitle: "إدارة المكتبات",
    adminLibrariesDesc:
      "أضف مكتبات SharePoint إلى البحث. متاح لمسؤول عام (Global Administrator) فقط.",
    adminLibrariesEmpty: "لا توجد مكتبات.",
    adminLibrariesError: "تعذّر تحميل المكتبات.",
    adminLibrariesIndexed: "مفهرسة",
    adminLibrariesAdd: "فهرسة",
    adminLibrariesAdding: "جارٍ الفهرسة…",
    adminLibrariesRemove: "إزالة",
    adminLibrariesRemoving: "جارٍ الإزالة…",
    adminLibrariesRemoveConfirm: "إزالة هذه المكتبة من البحث وحذف محتواها المفهرس؟",
  },
  en: {
    badge: "Al-Basti Legal AI",
    title: "Daleel",
    tagline: "Your AI Guide to Legal Intelligence.",
    description:
      "Search the indexed repository quickly, then escalate to deeper document reads when a lawyer needs details from the underlying file.",
    cards: [
      {
        title: "Repository search",
        description:
          "Uses Azure AI Search for fast retrieval across the indexed legal corpus.",
      },
      {
        title: "Document reading",
        description:
          "Calls a dedicated read tool for deeper file-level analysis.",
      },
      {
        title: "Security model",
        description:
          "Designed for Entra sign-in and SharePoint access that follows each lawyer's own permissions.",
      },
    ],
    starterPromptLabel: "Starter Prompts",
    workspaceBadge: "Foundry + Search + SharePoint",
    workspaceTitle: "Case research workspace",
    workspaceDescription:
      "The assistant keeps Arabic and English separate, returns original document links when available, and uses the lawyer's identity for SharePoint access.",
    composerPlaceholder: "Ask about a case, hearing, or document...",
    welcomeBadge: "Grounded Legal Assistant",
    welcomeTitle: "Start with a file, case, or legal question.",
    welcomeDescription:
      "This workspace searches the legal repository first, then drills into a specific document when deeper review is needed.",
    scrollToBottom: "Scroll to bottom",
    send: "Send message",
    stop: "Stop generating",
    addAttachment: "Add attachment",
    authSetupPending: "Auth setup pending",
    authSignedIn: "Signed in",
    authSignedOut: "Signed out",
    signIn: "Sign in",
    signOut: "Sign out",
    liveAccessReady: "Live SharePoint reading is enabled for this user.",
    liveAccessRequiresSignIn:
      "Sign in to enable live SharePoint reads with your own permissions.",
    navLabel: "Navigation",
    navNewChat: "New chat",
    navHistory: "Chat history",
    historyDelete: "Delete",
    historyDeleteConfirm: "Delete this conversation?",
    historyPin: "Pin",
    historyUnpin: "Unpin",
    navProjects: "Projects",
    pinnedHeading: "Pinned",
    recentHeading: "Recent",
    viewAll: "View all",
    accountSettings: "Settings",
    accountLanguage: "Language",
    menuRename: "Rename",
    menuAddToProject: "Add to project",
    menuChangeProject: "Change project",
    menuRemoveFromProject: "Remove from project",
    menuMoveUp: "Move up",
    menuMoveDown: "Move down",
    projectsTitle: "Projects",
    projectsEmpty: "No projects yet.",
    projectsNew: "New project",
    projectsCreate: "Create",
    projectNamePlaceholder: "Project name",
    projectChatsEmpty: "No chats in this project yet.",
    projectDelete: "Delete project",
    projectDeleteConfirm: "Delete this project? Its chats will be kept (unassigned).",
    projectDeleteBody: "This project will be deleted.",
    projectDeleteChatsOption: "Also delete its chats",
    cancel: "Cancel",
    saveLabel: "Save",
    allProjects: "All projects",
    projectSearchPlaceholder: "Search projects...",
    projectModalCreateTitle: "Create a project",
    projectModalEditTitle: "Edit details",
    projectWorkingOn: "What are you working on?",
    projectAchieve: "What are you trying to achieve?",
    projectDescPlaceholder: "Describe your project, goals, subject, etc...",
    projectCreateBtn: "Create project",
    menuEditDetails: "Edit details",
    projectComposerPlaceholder: "How can I help you today?",
    projectStartHint: "Start a chat to keep conversations organized and re-use project knowledge.",
    chatsTitle: "Chats",
    chatsSearchPlaceholder: "Search chats...",
    chatsEmpty: "No chats.",
    selectLabel: "Select",
    selectAll: "Select all",
    queryBuilderTitle: "Advanced search",
    qbAllWords: "With all of the words",
    qbAnyWords: "With any of the words",
    qbExactPhrase: "With the exact phrase",
    qbWithoutWords: "Without the words",
    qbPartWords: "With part of the words",
    sortBy: "Sort by",
    sortLastUpdated: "Last updated",
    sortName: "Name",
    sortCreated: "Date created",
    updatedPrefix: "Updated",
    qbFileType: "File type",
    ftWord: "Word",
    ftPdf: "PDF",
    ftText: "Text",
    ftExcel: "Excel",
    ftPowerpoint: "PowerPoint",
    ftImage: "Image",
    qbFind: "Find",
    qbClear: "Clear",
    resultsTitle: "Search results",
    resultsEmpty: "No matching documents.",
    resultsSearching: "Searching…",
    openInSharePoint: "Open in SharePoint",
    openFolder: "Open folder",
    sourcesHeading: "Sources",
    backLabel: "Back",
    navSettings: "Account settings",
    navCollapsePanel: "Collapse side panel",
    navExpandPanel: "Expand side panel",
    navComingSoon: "Coming soon",
    accountSection: "Account",
    lockedTitle: "Sign in is required to access the agent",
    lockedDescription:
      "The workspace must know which lawyer is signed in before it can read SharePoint files securely and apply your document permissions.",
    lockedButton: "Continue to sign in",
    supportPanelTitle: "Assistant panel",
    supportPanelDescription:
      "Choose which libraries to limit your search to.",
    librariesTitle: "Search libraries",
    librariesClear: "All",
    librariesEmpty: "No indexed libraries yet.",
    librariesAllHint: "Searching across all libraries.",
    librariesScopedHint: "Search limited to the selected libraries.",
    adminLibrariesTitle: "Manage libraries",
    adminLibrariesDesc:
      "Add SharePoint libraries to search. Global Administrators only.",
    adminLibrariesEmpty: "No libraries found.",
    adminLibrariesError: "Couldn't load libraries.",
    adminLibrariesIndexed: "Indexed",
    adminLibrariesAdd: "Index",
    adminLibrariesAdding: "Indexing…",
    adminLibrariesRemove: "Remove",
    adminLibrariesRemoving: "Removing…",
    adminLibrariesRemoveConfirm: "Remove this library from search and delete its indexed content?",
  },
} as const;

// Deployment-level prompt/copy profile (DALEEL_PROMPT_PROFILE). "file-finder" is the general
// business-documents profile: neutral wording and no legal framing. Unset keeps the original
// legal wording. Server reads the env var; the browser reads the copy the root layout injects.
export const getPromptProfile = (): string | undefined => {
  const raw =
    typeof window === "undefined"
      ? process.env.DALEEL_PROMPT_PROFILE
      : (window as unknown as { __ALBASTI_PUBLIC_ENV__?: { promptProfile?: string } })
          .__ALBASTI_PUBLIC_ENV__?.promptProfile;
  return raw?.trim().toLowerCase() || undefined;
};

export const isGeneralProfile = () => getPromptProfile() === "file-finder";

const generalCopyOverrides = {
  ar: {
    badge: "البحث الذكي في المستندات",
    tagline: "دليلك الذكي إلى مستندات المؤسسة.",
    description:
      "ابحث في مكتبات المستندات المفهرسة بسرعة، ثم انتقل إلى قراءة أعمق للملف عندما تحتاج إلى التفاصيل.",
    cards: [
      {
        title: "البحث في المكتبات",
        description:
          "يعتمد على Azure AI Search للوصول السريع إلى المستندات المفهرسة من مكتبات SharePoint.",
      },
      {
        title: "قراءة المستند",
        description:
          "يستخدم أداة قراءة مخصصة للتحليل الأعمق على مستوى الملف.",
      },
      {
        title: "نموذج الأمان",
        description:
          "مصمم ليتكامل مع Entra وتفويض SharePoint وفق صلاحيات كل مستخدم.",
      },
    ],
    workspaceTitle: "مساحة البحث في المستندات",
    workspaceDescription:
      "يفصل بين العربية والإنجليزية، ويعيد روابط المستندات الأصلية عند توفرها، ويستخدم هويتك للوصول إلى ملفات SharePoint.",
    composerPlaceholder: "اسأل عن مستند أو عرض أو مشروع...",
    welcomeBadge: "مساعد مستندات موثّق",
    welcomeTitle: "ابدأ من ملف أو مشروع أو سؤال.",
    welcomeDescription:
      "تبدأ هذه المساحة بالبحث في مكتبات المستندات، ثم تنتقل إلى قراءة ملف محدد عند الحاجة إلى مراجعة أعمق.",
  },
  en: {
    badge: "AI Document Search",
    tagline: "Your AI guide to company documents.",
    description:
      "Search the indexed document libraries quickly, then dive into a specific file when you need the details.",
    cards: [
      {
        title: "Library search",
        description:
          "Uses Azure AI Search for fast retrieval across the indexed SharePoint libraries.",
      },
      {
        title: "Document reading",
        description:
          "Calls a dedicated read tool for deeper file-level analysis.",
      },
      {
        title: "Security model",
        description:
          "Designed for Entra sign-in and SharePoint access that follows each user's own permissions.",
      },
    ],
    workspaceTitle: "Document search workspace",
    workspaceDescription:
      "The assistant keeps Arabic and English separate, returns original document links when available, and uses your identity for SharePoint access.",
    composerPlaceholder: "Ask about a document, proposal, or project...",
    welcomeBadge: "Grounded document assistant",
    welcomeTitle: "Start with a file, project, or question.",
    welcomeDescription:
      "This workspace searches the document libraries first, then drills into a specific file when deeper review is needed.",
    lockedDescription:
      "The workspace must know who is signed in before it can read SharePoint files securely and apply your document permissions.",
  },
} as const;

export const getAppCopy = (locale: AppLocale): (typeof appCopy)[AppLocale] =>
  (isGeneralProfile()
    ? { ...appCopy[locale], ...generalCopyOverrides[locale] }
    : appCopy[locale]) as unknown as (typeof appCopy)[AppLocale];
