/* содержимое настроек и образец данных расхода */
window.PC_SET = {
 "languages": {
  "default": "en",
  "languages": [
   {
    "code": "en",
    "english": "English",
    "native": "English",
    "script": "Latin",
    "rtl": false
   },
   {
    "code": "ru",
    "english": "Russian",
    "native": "Русский",
    "script": "Cyrillic",
    "rtl": false
   },
   {
    "code": "uk",
    "english": "Ukrainian",
    "native": "Українська",
    "script": "Cyrillic",
    "rtl": false
   },
   {
    "code": "es",
    "english": "Spanish",
    "native": "Español",
    "script": "Latin",
    "rtl": false
   },
   {
    "code": "pt-BR",
    "english": "Portuguese (Brazil)",
    "native": "Português (Brasil)",
    "script": "Latin",
    "rtl": false
   },
   {
    "code": "de",
    "english": "German",
    "native": "Deutsch",
    "script": "Latin",
    "rtl": false
   },
   {
    "code": "fr",
    "english": "French",
    "native": "Français",
    "script": "Latin",
    "rtl": false
   },
   {
    "code": "it",
    "english": "Italian",
    "native": "Italiano",
    "script": "Latin",
    "rtl": false
   },
   {
    "code": "tr",
    "english": "Turkish",
    "native": "Türkçe",
    "script": "Latin",
    "rtl": false
   },
   {
    "code": "pl",
    "english": "Polish",
    "native": "Polski",
    "script": "Latin",
    "rtl": false
   },
   {
    "code": "zh-CN",
    "english": "Chinese (Simplified)",
    "native": "简体中文",
    "script": "Han",
    "rtl": false
   },
   {
    "code": "ja",
    "english": "Japanese",
    "native": "日本語",
    "script": "Japanese",
    "rtl": false
   },
   {
    "code": "ko",
    "english": "Korean",
    "native": "한국어",
    "script": "Hangul",
    "rtl": false
   },
   {
    "code": "hi",
    "english": "Hindi",
    "native": "हिन्दी",
    "script": "Devanagari",
    "rtl": false
   },
   {
    "code": "ar",
    "english": "Arabic",
    "native": "العربية",
    "script": "Arabic",
    "rtl": true
   },
   {
    "code": "id",
    "english": "Indonesian",
    "native": "Bahasa Indonesia",
    "script": "Latin",
    "rtl": false
   },
   {
    "code": "vi",
    "english": "Vietnamese",
    "native": "Tiếng Việt",
    "script": "Latin",
    "rtl": false
   },
   {
    "code": "fa",
    "english": "Persian",
    "native": "فارسی",
    "script": "Arabic",
    "rtl": true
   },
   {
    "code": "he",
    "english": "Hebrew",
    "native": "עברית",
    "script": "Hebrew",
    "rtl": true
   }
  ],
  "rtl_codes": [
   "ar",
   "fa",
   "he"
  ],
  "notes": {
   "row_format": "Native name first, English name in --ink3 below it.",
   "rtl_badge": "Show a small RTL chip on right-to-left rows.",
   "system_row": "Top row: Match system language — follows the phone setting."
  }
 },
 "effort": {
  "default": "balanced",
  "levels": [
   {
    "id": "instant",
    "label": "Instant",
    "effect": "Answers right away, no planning pass. Cheapest, least reliable on hard work.",
    "pick_when": "Short questions, small edits, anything you can check at a glance."
   },
   {
    "id": "quick",
    "label": "Quick",
    "effect": "Thinks a little before acting. Still fast, still cheap.",
    "pick_when": "Routine tasks in code you already know."
   },
   {
    "id": "balanced",
    "label": "Balanced",
    "effect": "Plans, then works, then checks itself once. The default for most work.",
    "pick_when": "You are not sure which level fits."
   },
   {
    "id": "deep",
    "label": "Deep",
    "effect": "Explores alternatives and reads more before writing. Noticeably slower, costs more.",
    "pick_when": "Unfamiliar code, tangled bugs, anything you cannot easily verify."
   },
   {
    "id": "maximum",
    "label": "Maximum",
    "effect": "Longest reasoning, widest search. Slowest and most expensive; on simple tasks it mostly adds waiting.",
    "pick_when": "A hard problem that already failed at a lower level."
   }
  ],
  "footnote": "Higher is not automatically better. Raise it when a task fails, not before."
 },
 "drawer": {
  "title": "Settings",
  "groups": [
   {
    "header": "Agent",
    "rows": [
     {
      "id": "model",
      "title": "Model",
      "desc": "Which model runs the session.",
      "control": "navigates",
      "value": "Opus 5"
     },
     {
      "id": "effort",
      "title": "Thinking effort",
      "desc": "Speed against depth and cost.",
      "control": "navigates",
      "value": "Balanced"
     },
     {
      "id": "permissions",
      "title": "Ask before acting",
      "desc": "How much it confirms before changing files or running commands.",
      "control": "sheet",
      "value": "Ask on writes"
     },
     {
      "id": "instructions",
      "title": "Custom instructions",
      "desc": "Standing notes the agent reads every session.",
      "control": "navigates"
     }
    ]
   },
   {
    "header": "Appearance",
    "rows": [
     {
      "id": "language",
      "title": "Language",
      "desc": null,
      "control": "navigates",
      "value": "English"
     },
     {
      "id": "theme",
      "title": "Theme",
      "desc": null,
      "control": "sheet",
      "value": "System"
     },
     {
      "id": "pet",
      "title": "Show pet",
      "desc": "The small companion on the main screen.",
      "control": "toggle",
      "value": true
     }
    ]
   },
   {
    "header": "Notifications",
    "rows": [
     {
      "id": "notify_done",
      "title": "When a task finishes",
      "desc": null,
      "control": "toggle",
      "value": true
     },
     {
      "id": "notify_input",
      "title": "When it needs you",
      "desc": "Approvals and questions that block the run.",
      "control": "toggle",
      "value": true
     },
     {
      "id": "notify_sound",
      "title": "Sound",
      "desc": null,
      "control": "toggle",
      "value": false
     }
    ]
   },
   {
    "header": "Session",
    "rows": [
     {
      "id": "background",
      "title": "Keep running in background",
      "desc": "Work continues after you leave the app. Uses more battery.",
      "control": "toggle",
      "value": true
     },
     {
      "id": "folder",
      "title": "Project folder",
      "desc": null,
      "control": "sheet",
      "value": "~/projects/pocketcrew"
     },
     {
      "id": "history",
      "title": "Session history",
      "desc": "Past runs and their transcripts.",
      "control": "navigates"
     }
    ]
   },
   {
    "header": "Account",
    "rows": [
     {
      "id": "usage",
      "title": "Usage and limits",
      "desc": "Spend this month and what is left in the current window.",
      "control": "navigates",
      "value": "62% used"
     },
     {
      "id": "keys",
      "title": "API keys",
      "desc": null,
      "control": "navigates"
     },
     {
      "id": "privacy",
      "title": "Data and privacy",
      "desc": null,
      "control": "navigates"
     }
    ]
   },
   {
    "header": "About",
    "rows": [
     {
      "id": "about",
      "title": "About",
      "desc": null,
      "control": "navigates",
      "value": "v0.9.16"
     },
     {
      "id": "logs",
      "title": "Diagnostics",
      "desc": "Logs to attach to a bug report.",
      "control": "navigates"
     },
     {
      "id": "signout",
      "title": "Sign out",
      "desc": null,
      "control": "sheet",
      "destructive": true
     }
    ]
   }
  ],
  "control_kinds": {
   "navigates": "Pushes a sub-list. Chevron on the right, current value in --ink3 beside it.",
   "toggle": "Switch on the row. Applies immediately, no save button.",
   "sheet": "Opens a bottom sheet with a few options or a picker.",
   "value": "Read-only. Value in --ink2, no chevron."
  }
 },
 "microcopy": {
  "language_switch_mid_session": "Interface is now Spanish. The running task keeps its original language.",
  "effort_raised": "Effort set to Deep. Slower replies, higher cost, applies to the next message.",
  "effort_lowered": "Effort set to Quick. Faster and cheaper; it may miss things on hard tasks.",
  "rate_limit_hit": "Limit reached. The session resumes at 14:20 — nothing is lost.",
  "rate_limit_near": "About 10% of your window left. Long tasks may stop partway.",
  "notifications_on": "Notifications on. You will hear about finished tasks and blocked runs.",
  "finished_while_closed": "Task finished 12 minutes ago. Tap to read what changed.",
  "folder_changed": "Project folder is now pocketcrew. The current session stays on the old one."
 },
 "usage_sample": {
  "plan": "Max 20×",
  "activeModel": "opus-4.6",
  "allowanceLabel": "of weekly allowance",
  "weeklyPct": 47,
  "resetsAt": "2026-10-12T09:00:00Z",
  "resetsInSec": null,
  "session": {
   "cost": 4.82,
   "tokens": 218400,
   "pct": 12
  },
  "today": {
   "cost": 18.4,
   "tokens": 912000,
   "pct": 31
  },
  "week": {
   "cost": 94.1,
   "tokens": 4120000,
   "pct": 47
  },
  "models": [
   {
    "name": "opus-4.6",
    "tokens": 1840000,
    "cost": 71.2
   },
   {
    "name": "sonnet-4.6",
    "tokens": 1960000,
    "cost": 19.4
   },
   {
    "name": "haiku-4.6",
    "tokens": 320000,
    "cost": 3.5
   }
  ],
  "limitNote": null,
  "primary": {
   "label": "Manage plan",
   "action": "manage-plan"
  },
  "secondary": {
   "label": "Not now",
   "action": "dismiss"
  }
 }
};
