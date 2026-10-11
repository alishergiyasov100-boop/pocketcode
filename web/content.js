/* PocketCode — all app copy in one place */
window.PC_CONTENT = {

  app: {
    name: "POCKETCREW",
    tagline: "Your crew codes. You watch from your phone.",
    tips: [
      "Just say what's broken. <b>“fix the duplicates”</b> beats a two-page spec.",
      "Close the app whenever. The agent keeps working without you.",
      "Tap the mascot to see what it can do.",
      "Stopping loses nothing. The session stays where it was.",
      "Output makes no sense? Just ask <b>“what is this?”</b>"
    ]
  },

  /* plain-language status: what is happening right now */
  status: {
    who: "Claude",
    crew: "claude",
    project: "noteclip",
    what: "Fixing a bug",
    plain: "The same Telegram message was getting saved to your notes twice. It's working out why.",
    steps: [
      { t: "Worked out what's wrong", s: "done" },
      { t: "Patched the code", s: "done" },
      { t: "Checking it broke nothing else", s: "now" },
      { t: "Will show you the result", s: "next" }
    ],
    calm: "Running 7 minutes. You can close your phone — it won't stop.",
    spent: "Spent 31 cents",
    cta: "See what it's doing",
    stop: "Stop"
  },

  others: [
    { crew: "kimi", name: "rvc-cut",  what: "Reading code",  plain: "Working out why the preview renders twice", ind: "pc-dots",     tone: "acc" },
    { crew: "grok", name: "dotfiles", what: "Waiting on you", plain: "Asking whether to delete an old file",      ind: "pc-dot-fade", tone: "warn" }
  ],

  home: {
    greetings: [
      { hi: "Morning.", sub: "Somebody committed all night." },
      { hi: "Afternoon.", sub: "Branch isn't broken yet. Good start." },
      { hi: "Late.", sub: "The crew is still holding on." }
    ],
    ask: "What are we building?"
  },

  session: {
    placeholder: "What's next? Plain words are fine",
    chips: [
      "Ship it and open a PR",
      "What about an album of 20 photos?",
      "Show me everything it changed"
    ],

    freshPlaceholder: "What should it do? Plain words are fine",
    freshChips: [
      "My notes get saved twice, figure it out",
      "Why does the preview render twice?",
      "Add a dark mode toggle"
    ],

    modes: { simple: "Simple", full: "Detailed" },

    /* default view — written for someone who doesn't read diffs */
    simple: [
      { type: "user", text: "the same telegram message gets saved to my notes twice. not always but often. figure it out" },
      { type: "agent", text: "On it. Let me see how the bot tells a new message apart from one it already saved." },
      { type: "step", text: "Read three files", ind: "pc-done", tone: "ok" },
      { type: "agent", text: "Found it. The bot remembered each message by its ID, but Telegram hands out a fresh ID every time — so one forward looked like two different messages." },
      { type: "step", text: "Changed one line", ind: "pc-done", tone: "ok" },
      { type: "step", text: "Ran the checks — two failed", ind: "pc-fail", tone: "bad" },
      { type: "agent", text: "They didn't fail because of my change. They're older checks that were written before it. Fixed those too." },
      { type: "step", text: "All 14 checks green", ind: "pc-done", tone: "ok" },
      { type: "agent", stream: true, text: "Done. One message, one note — even if you forward an album of five photos. I saved it on my side but published nothing. Say the word." },
      { type: "note", text: "Waiting on you", ind: "pc-dots" }
    ],

    /* the same run with every tool call, for when you want it */
    entries: [
      { type: "user", text: "the same telegram message gets saved to my notes twice. not always but often. figure it out" },

      { type: "think", text: "Either the bot receives one update twice, or the dedup key isn't stable. Start by looking at how the message key is built." },

      { type: "tool", label: "Read forward.py", out: "bot/handlers/forward.py · 128 lines\n61:  if msg.message_id in seen: return", ind: "pc-done", tone: "ok" },
      { type: "tool", label: "Searched bot/ for the dedup", out: "grep -r \"seen|dedup|already_saved\" bot/\n3 hits: forward.py:61, store.py:14, store.py:29", ind: "pc-done", tone: "ok" },
      { type: "tool", label: "Read store.py", out: "bot/store.py · 41 lines\n14:  def dedup_key(msg):", ind: "pc-done", tone: "ok" },

      { type: "think", text: "There it is. The dedup key is the forward's message_id. But Telegram issues a new message_id on every update, even for the same forwarded message. The stable key is forward_from_chat.id plus forward_from_message_id. And a media group arrives as a separate update per file." },

      { type: "tool", label: "Rewrote the dedup key", out: "bot/store.py · dedup_key() · 1 edit", ind: "pc-done", tone: "ok" },

      { type: "diff", file: "bot/store.py", stat: "+4 −2", lines: [
        "-def dedup_key(msg):",
        "-    return f\"{msg.chat.id}:{msg.message_id}\"",
        "+def dedup_key(msg):",
        "+    origin = msg.forward_from_chat or msg.chat",
        "+    origin_id = msg.forward_from_message_id or msg.message_id",
        "+    group = msg.media_group_id or origin_id",
        "+    return f\"{origin.id}:{origin_id}:{group}\""
      ]},

      { type: "tool", label: "Ran the tests — they failed", out: "pytest tests/test_forward.py -q\n2 failed, 12 passed\nKeyError: 'forward_from_chat'", ind: "pc-fail", tone: "bad" },

      { type: "note", tone: "bad", text: "2 of 14 tests failed. Claude is sorting it out.", ind: "pc-fail" },

      { type: "think", text: "The fixtures build a message as a plain dict, and I'm reading attributes. That's not a bug in the code — those fixtures are stale. Fix the fixtures, not the fix." },

      { type: "tool", label: "Updated the fixtures", out: "tests/fixtures/messages.py · 2 edits", ind: "pc-done", tone: "ok" },
      { type: "tool", label: "Ran the tests again", out: "pytest tests/test_forward.py -q\n14 passed in 1.8s", ind: "pc-done", tone: "ok" },
      { type: "tool", label: "Committed", out: "git commit -am \"fix: stable dedup key for forwards\"\n1 file changed · branch fix/duplicate-saves", ind: "pc-done", tone: "ok" },

      { type: "note", tone: "ok", text: "Done. 14 tests green, committed.", ind: "pc-spark" },

      { type: "agent", stream: true, text: "Found it. Dedup hung on <b>message_id</b>, and Telegram issues a new one per update — which is why the duplicate only showed up sometimes, when updates arrived back to back. The key now combines the origin chat, the origin message_id and the media_group_id, so an album of five photos is one note instead of five. Two stale fixtures broke on that; fixed them. 14 tests green, committed. <b>Nothing pushed.</b>" },

      { type: "note", text: "Waiting on you", ind: "pc-dots" }
    ],

    followups: {
      "Ship it and open a PR": {
        think: "The branch is 3 commits ahead of main, there shouldn't be conflicts. Pushing and opening a PR with a body built from the commits.",
        tools: [
          { label: "Pushed the branch", out: "git push -u origin fix/duplicate-saves\n3 commits pushed" },
          { label: "Opened a PR", out: "gh pr create --fill\nPR #12 opened" }
        ],
        reply: "PR <b>#12</b> is open: “fix: stable dedup key for forwards”. I wrote the body from the commits and assigned no reviewers — tell me who.",
        splain: "Publishing the fix and opening a request to merge it.",
        sstep: "Published it and opened a request",
        sreply: "Done, request <b>#12</b> is open. I wrote the description myself. Who should look at it?"
      },
      "What about an album of 20 photos?": {
        think: "Telegram sends an album as 20 separate updates with a shared media_group_id. Need to confirm the key collapses them into one record without losing 19 files.",
        tools: [
          { label: "Tested it on an album", out: "pytest tests/test_forward.py -k album -q\n1 passed — 20 updates → 1 record, 20 attachments" }
        ],
        reply: "It collapses into one record but keeps all twenty attachments — there's a test for that. The real ceiling is elsewhere: Notion caps a page at 100 blocks, so a hundred photos won't fit. Want me to add a limit?",
        splain: "Let me try it on an album of twenty photos.",
        sstep: "Tried it on an album of 20 photos",
        sreply: "It saves them as one note and loses none of the photos. But past about a hundred in one album, your notes app won't take them. Want me to add a limit?"
      },
      "Show me everything it changed": {
        think: "Two files were touched this session. Show both in full, not just the hunk with the key.",
        tools: [
          { label: "Collected the full diff", out: "git diff HEAD~1 --stat\n2 files · +11 −4" }
        ],
        reply: "Two files: <b>bot/store.py</b> (+4 −2, the key itself) and <b>tests/fixtures/messages.py</b> (+7 −2, fixtures moved to attributes instead of dicts). Nothing else was touched.",
        splain: "Pulling together everything I changed.",
        sstep: "Pulled together every change",
        sreply: "Two files: one with the actual logic, one with the checks for it. Nothing else."
      }
    }
  },

  ask: {
    who: "Grok hit a fork",
    q: "There's an old <code>.zshrc</code> in <b>dotfiles</b>, 400 lines of it. It clashes with the new one. Delete it, or keep a copy?",
    options: [
      { t: "Keep a copy", d: "renames it to .zshrc.bak", primary: true },
      { t: "Delete it", d: "no way back" },
      { t: "Show me what's in it", d: "I'll look first" }
    ],
    note: "Asked 11 minutes ago. The session is alive, nothing is lost."
  },

  /* mascots live here now — next to the three models that have one */
  crew: [
    {
      id: "claude",
      name: "Claude",
      personality: "Careful. Reads the whole file before touching one line.",
      when: "Take it when you need to know why something broke, not just stop the bleeding.",
      hello: "Hey. I'm mid-file, give me a second.",
      praised: "Nice. I still don't agree with that naming, though.",
      busy: "Reading your store.py. Third time. It earns it.",
      scared: "What. What broke. I checked everything.",
      sleepy: "Fine. Bookmark's on line 61.",
      catchphrase: "Let me finish reading. I almost know who wrote this.",
      idle: [
        "Four hundred lines and not one comment.",
        "I'd rewrite this. You didn't ask.",
        "Two more functions and I'll get the idea."
      ]
    },
    {
      id: "kimi",
      name: "Kimi",
      personality: "Quick and agreeable. Thinks out loud, but gets it done.",
      when: "Take it when the job is simple and thinking hard would be a waste of money.",
      hello: "Oh, hi! I read everything while you were gone.",
      praised: "Yeah? Thanks! I can go faster, too.",
      busy: "Six thousand four hundred lines. I'm at three thousand.",
      scared: "Uh. Uh-oh. I didn't touch anything!",
      sleepy: "Wake me whenever, I boot instantly.",
      catchphrase: "I already read it. The whole file. Yes, that one too.",
      idle: [
        "I could translate the README. Or not.",
        "Six thousand line file? Sure.",
        "I'm fast, but you're not watching anyway."
      ]
    },
    {
      id: "grok",
      name: "Grok",
      personality: "Blunt. Will tell you your architecture is a mess, and be right.",
      when: "Take it when you're stuck and need someone with no respect for your code.",
      hello: "Yeah. Saw your commit. We'll talk.",
      praised: "I know. You can stop.",
      busy: "Looking into why there's a try around your entire file.",
      scared: "Relax. It's not breaking on my end.",
      sleepy: "Wake me when something breaks. So, soon.",
      catchphrase: "It's not a bug. You wrote it that way.",
      idle: [
        "There's a try around the whole file. Bold.",
        "This helper is called from exactly one place. Why?",
        "Found it. You won't like it."
      ]
    }
  ],

  sessions: [
    { crew: "claude", project: "noteclip",  branch: "fix/duplicate-saves", model: "Claude Opus 5",
      sum: "Fixing notes that got saved twice", state: "running", meta: "Running 7 min", ind: "pc-circle" },
    { crew: "grok",   project: "dotfiles",  branch: "main", model: "Grok 4",
      sum: "Asked whether to delete an old .zshrc", state: "needs", meta: "Waiting 11 min", ind: "pc-dot-fade" },
    { crew: "kimi",   project: "rvc-cut",   branch: "preview-fix", model: "Kimi K3",
      sum: "Working out why the preview renders twice", state: "running", meta: "Running 14 min", ind: "pc-dots" },
    { crew: "claude", project: "pocketvpn", branch: "dpi-bypass", model: "Claude Opus 5",
      sum: "Got around the DPI block · 3 commits", state: "done", meta: "Yesterday · 12 min", ind: "pc-done" },
    { crew: "kimi",   project: "noteclip",  branch: "readme", model: "Kimi K2.8",
      sum: "Rewrote the README in English", state: "done", meta: "2 days ago · 4 min", ind: "pc-done" },
    { crew: "grok",   project: "katana",    branch: "bench", model: "Grok 4",
      sum: "Stopped — you interrupted it", state: "stopped", meta: "3 days ago", ind: "pc-fail" }
  ],

  states: {
    running: { t: "Running", tone: "acc" },
    needs:   { t: "Needs you", tone: "warn" },
    done:    { t: "Done", tone: "ok" },
    stopped: { t: "Stopped", tone: "mute" }
  },

  /* plan mode: it shows you the plan before touching anything */
  plan: {
    k: "Claude wants to do this",
    title: "Fix the duplicate saves",
    intro: "Nothing has been changed yet. Say go and it starts.",
    items: [
      { t: "Change how the bot recognises a message", d: "One line. It'll use the original message instead of the copy's ID." },
      { t: "Update two old checks", d: "They were written before this change and would fail on it." },
      { t: "Run all 14 checks", d: "To be sure nothing else broke." },
      { t: "Save it, publish nothing", d: "Nothing goes public without your word." }
    ],
    touch: "Touches 2 files · publishes nothing",
    go: "Go ahead",
    edit: "Change something",
    no: "No, try another way"
  },

  perms: {
    k: "How much should it ask you?",
    items: [
      { v: "ask",   t: "Ask before every change", d: "Safest. You approve each edit." },
      { v: "edits", t: "Edit freely, ask before publishing", d: "Good default.", on: true },
      { v: "auto",  t: "Don't ask at all", d: "Only in a project you can throw away." }
    ]
  },

  rewind: {
    k: "Go back to",
    note: "This undoes the code too. Nothing is lost — you can come forward again.",
    items: [
      { t: "Before it touched anything", d: "7 minutes ago" },
      { t: "Before it fixed the old checks", d: "3 minutes ago" },
      { t: "Before it ran the checks", d: "1 minute ago" }
    ]
  },

  attach: [
    { ic: "image",  t: "Photo" },
    { ic: "camera", t: "Screenshot" },
    { ic: "doc",    t: "A file from the project" }
  ],

  queue: { label: "Queued", hint: "It'll read this when it finishes what it's doing." },

  models: [
    { brand: "anthropic", co: "Anthropic", crew: "claude", items: [
      { n: "Claude Opus 5",    d: "Thinks for a while, but finishes the job", tag: "default" },
      { n: "Claude Sonnet 5",  d: "The everyday workhorse" },
      { n: "Claude Haiku 4.5", d: "Instant little edits" }
    ]},
    { brand: "openai", co: "OpenAI", items: [
      { n: "GPT-5.5",      d: "Strong all-rounder" },
      { n: "GPT-5.5 mini", d: "Cheap and quick" }
    ]},
    { brand: "xai", co: "xAI", crew: "grok", items: [
      { n: "Grok 4", d: "Blunt, knows new libraries, debugs head-on" }
    ]},
    { brand: "moonshot", co: "Moonshot", crew: "kimi", items: [
      { n: "Kimi K3",   d: "Flagship for chat and agent work" },
      { n: "Kimi K2.8", d: "Balance of speed and quality", tag: "preview" }
    ]},
    { brand: "google", co: "Google", items: [
      { n: "Gemini 3 Pro", d: "Long context, reads images" }
    ]},
    { brand: "deepseek", co: "DeepSeek", items: [
      { n: "DeepSeek V4", d: "Open weights, cheap on code" }
    ]},
    { brand: "mistral", co: "Mistral", items: [
      { n: "Mistral Large 3", d: "European, fast" }
    ]},
    { brand: "meta", co: "Meta", items: [
      { n: "Llama 5 405B", d: "You can host it yourself" }
    ]}
  ],

  steps: [
    { k: "01", t: "Pick who works", d: "Every model in one list. No idea who to take? Take the default." },
    { k: "02", t: "Say it in plain words", d: "“fix the duplicates” beats a two-page spec." },
    { k: "03", t: "Close your phone", d: "It won't stop. It only wakes you at a real fork in the road." },
    { k: "04", t: "Come back to it done", d: "Fixed and checked. Whether to ship it is your call." }
  ],

  ui: {
    back: "Back",
    menu: "Menu",
    sound: "Sound",
    add: "Add",
    voice: "Voice",
    send: "Send",
    close: "Close",
    allModels: "All models",
    whoWrites: "Who's writing the code",
    alsoRunning: "Also running",
    search: "Search sessions",
    sessions: "Sessions",
    resume: "Resume",
    rewind: "Undo",
    plan: "The plan",
    allSessions: "All sessions",
    history: "Recent sessions",
    me: { n: "Alisher Giyasov", p: "Three in the crew · own key" },
    menuItems: [
      { ic: "plus", t: "New task", go: "home" },
      { ic: "remote", t: "What's happening", go: "runs" },
      { ic: "brain", t: "Pick a model", go: "models" },
      { ic: "bell", t: "Needs you", go: "ask", dot: true },
      { ic: "clock", t: "Sessions", go: "sessions" },
      { ic: "doc", t: "The plan", go: "plan" },
      { ic: "bolt", t: "Upgrade plan", b: "PRO" }
    ],
    hist: [
      { crew: "claude", t: "noteclip", d: "duplicate saves" },
      { crew: "kimi",   t: "rvc-cut",  d: "preview renders twice" },
      { crew: "grok",   t: "dotfiles", d: "cleaning up zshrc" }
    ],
    toasts: {
      stopped: "Stopped. The session history is still there.",
      switched: "Now working: ",
      sent: "Passed along: ",
      missing: "That screen isn't in the concept yet"
    }
  }
};
