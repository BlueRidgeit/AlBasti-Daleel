export type AppLocale = "ar" | "en";

export const defaultLocale: AppLocale = "ar";

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
    title: "مساعد قانوني واعٍ بمستندات SharePoint",
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
      "يمكنك تصغير هذه اللوحة أو توسيعها للوصول إلى التوجيهات السريعة ومطالبات البداية.",
    librariesTitle: "مكتبات البحث",
    librariesClear: "الكل",
    librariesEmpty: "لا توجد مكتبات مفهرسة بعد.",
    librariesAllHint: "يشمل البحث جميع المكتبات.",
    librariesScopedHint: "يقتصر البحث على المكتبات المحددة.",
  },
  en: {
    badge: "Al-Basti Legal AI",
    title: "SharePoint-aware legal assistant",
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
      "Collapse or expand this panel for quick guidance and starter prompts.",
    librariesTitle: "Search libraries",
    librariesClear: "All",
    librariesEmpty: "No indexed libraries yet.",
    librariesAllHint: "Searching across all libraries.",
    librariesScopedHint: "Search limited to the selected libraries.",
  },
} as const;
