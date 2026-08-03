const defaultSettings = {

  // =========================
  // FONT
  // =========================

  fontSize: 14,
  fontFamily: "Cascadia Code, Fira Code, JetBrains Mono, Consolas, monospace",
  fontWeight: "normal",
  lineHeight: 0,
  letterSpacing: 0.1,
  fontLigatures: false,

  files: {
    autoSave: "off",
    autoSaveDelay: 1000,
  },
  terminal: {
    profile: 'powershell',
    fontFamily: '',
    fontSize: 12,
    lineHeight: 1.15,
    letterSpacing: 0,
    scrollback: 8000,
    cursorStyle: 'block',
    cursorBlinking: true,
    gpuAcceleration: 'on',
    copyOnSelection: true,
    bellStyle: 'none',
    smoothScrollDuration: 0,
    wordSeparator: ' ()[]{}\',"`',
    rightClickBehavior: 'default',
    cursorWidth: 1,
    localEchoEnabled: 'auto',
    fastScrollModifier: 'alt',
    maxTabs: 5
  },


  // =========================
  // LINE NUMBERS
  // =========================

  lineNumbers: "on",
  lineNumbersMinChars: 5,
  glyphMargin: true,


  // =========================
  // CURSOR
  // =========================

  cursorStyle: "line",
  cursorWidth: 2,
  cursorBlinking: "blink",
  cursorSmoothCaretAnimation: true,
  cursorSurroundingLines: 0,
  cursorSurroundingLinesStyle: "default",


  // =========================
  // WORD WRAP
  // =========================

  wordWrap: "off",
  wordWrapColumn: 80,
  wordWrapOverride1: "inherit",
  wordWrapOverride2: "inherit",


  // =========================
  // MINIMAP
  // =========================

  minimap: {

    enabled: true,

    side: "right",

    size: "proportional",

    showSlider: "mouseover",

    renderCharacters: true,

    maxColumn: 120

  },


  // =========================
  // SCROLL
  // =========================

  scrollBeyondLastLine: true,

  scrollBeyondLastColumn: 5,

  smoothScrolling: true,

  mouseWheelScrollSensitivity: 1,

  fastScrollSensitivity: 5,
  scrollbar: {
    vertical: "auto",
    horizontal: "auto",
    verticalScrollbarSize: 12,
    horizontalScrollbarSize: 12,
    useShadows: true,
    alwaysConsumeMouseWheel: true
  },


  // =========================
  // SELECTION
  // =========================

  selectOnLineNumbers: true,

  roundedSelection: true,
  columnSelection: false,
  emptySelectionClipboard: true,
  selectionHighlight: true,
  occurrencesHighlight: true,


  // =========================
  // INDENT
  // =========================

  tabSize: 4,

  insertSpaces: true,

  detectIndentation: true,

  trimAutoWhitespace: true,


  // =========================
  // RENDERING
  // =========================

  renderWhitespace: "none",

  renderControlCharacters: false,

  renderLineHighlight: "all",
  renderLineHighlightOnlyWhenFocus: false,

  renderIndentGuides: true,

  renderFinalNewline: true,
  renderValidationDecorations: "editable",


  // =========================
  // MATCHING
  // =========================

  matchBrackets: "always",

  bracketPairColorization: {

    enabled: true

  },


  // =========================
  // AUTO CLOSE
  // =========================

  autoClosingBrackets: "always",

  autoClosingQuotes: "always",

  autoClosingDelete: "auto",

  autoClosingOvertype: "auto",


  // =========================
  // AUTO INDENT
  // =========================

  autoIndent: "advanced",


  // =========================
  // SUGGESTIONS
  // =========================

  quickSuggestions: true,

  quickSuggestionsDelay: 10,

  suggestOnTriggerCharacters: true,

  acceptSuggestionOnEnter: "on",

  suggestSelection: "recentlyUsed",
  snippetSuggestions: "inline",
  tabCompletion: "off",
  suggestFontSize: 0,
  suggestLineHeight: 0,
  inlineSuggest: {
    enabled: true
  },


  // =========================
  // HOVER
  // =========================

  hover: {

    enabled: true,

    delay: 300

  },


  // =========================
  // LINKS
  // =========================

  links: true,
  definitionLinkOpensInPeek: false,


  // =========================
  // FIND
  // =========================

  find: {

    cursorMoveOnType: true,

    autoFindInSelection: "never",

    seedSearchStringFromSelection: true

  },


  // =========================
  // FOLDING
  // =========================

  folding: true,

  foldingStrategy: "auto",

  foldingHighlight: true,


  // =========================
  // DRAG AND DROP
  // =========================

  dragAndDrop: true,


  // =========================
  // COPY PASTE
  // =========================

  copyWithSyntaxHighlighting: true,


  // =========================
  // CONTEXT MENU
  // =========================

  contextmenu: true,


  // =========================
  // READ ONLY
  // =========================

  readOnly: false,


  // =========================
  // LAYOUT
  // =========================

  automaticLayout: true,
  breadcrumbs: {
    enabled: true
  },
  stickyScroll: {
    enabled: false
  },


  // =========================
  // MOUSE
  // =========================

  mouseWheelZoom: false,


  // =========================
  // CURSOR MULTI
  // =========================

  multiCursorModifier: "alt",

  multiCursorMergeOverlapping: true,


  // =========================
  // ACCESSIBILITY
  // =========================

  accessibilitySupport: "auto",


  // =========================
  // CODE LENS
  // =========================

  codeLens: true,


  // =========================
  // COLOR DECORATOR
  // =========================

  colorDecorators: true,


  // =========================
  // LIGHTBULB
  // =========================

  lightbulb: {

    enabled: true

  },


  // =========================
  // PARAMETER HINTS
  // =========================

  parameterHints: {

    enabled: true

  },


  // =========================
  // FORMAT ON SAVE
  // =========================

  formatOnSave: false,

  // =========================
  // FORMAT ON TYPE
  // =========================

  formatOnType: false,


  // =========================
  // FORMAT ON PASTE
  // =========================

  formatOnPaste: false,


  // =========================
  // CODE ACTIONS
  // =========================

  codeActionsOnSave: {},


  // =========================
  // RULERS
  // =========================

  rulers: [],
  overviewRulerBorder: true,
  overviewRulerLanes: 2,
  hideCursorInOverviewRuler: false,


  // =========================


  // =========================
  // GUIDES
  // =========================

  guides: {

    indentation: true,
    bracketPairs: true
  },

  // =========================
  // ADVANCED TERMINAL
  // =========================
  terminalAdvanced: {
    gpuAcceleration: "on",
    copyOnSelection: true,
    rightClickBehavior: "paste",
    bellStyle: "visual",
    cursorBlinking: true,
    cursorStyle: "block",
    drawBoldTextInBrightColors: true,
    minimumContrastRatio: 4.5,
    fastScrollSensitivity: 5,
    scrollbackLimit: 50000,
    alternateScreen: true,
    localEcho: "auto",
    wordSeparators: " ()[]{}',\"`|",
    ligatures: true,
    unicodeVersion: "11"
  },

  // =========================
  // THEME
  // =========================
  theme: {
    active: "ultra-dark",
    glassmorphism: true,
    blurStrength: 10,
    activeTabGlow: true,
    borderGlow: true,
    animationSpeed: "normal"
  },

  // =========================
  // PERFORMANCE
  // =========================
  performance: {
    lowLatencyMode: true,
    maxRamUsage: 2048,
    garbageCollectionInterval: 30000,
    workerThreads: 4,
    ioThrottling: false,
    networkCaching: true,
    statusMonitor: true,
    compactMemoryOnIdle: true
  },

  // =========================
  // DEBUGGER (REAL)
  // =========================
  debugger: {
    autoOpenOnBreak: true,
    internalConsoleOptions: "openOnFirstSessionStart",
    saveBeforeStart: true,
    confirmOnExit: true,
    smartStep: true,
    inlineValues: true,
    hoverEval: true,
    callStackLimit: 20
  },
  explorer: {
    compactFolders: true,
    autoReveal: true,
    confirmDelete: true,
    confirmDragAndDrop: true,
    exclude: ["**/node_modules", "**/.git", "**/dist", "**/target"]
  },
  search: {
    exclude: ["**/node_modules", "**/.git", "**/dist", "**/target"],
    useIgnoreFiles: true,
    followSymlinks: true,
    smartCase: true
  },
  breadcrumbs: {
    enabled: true,
    filePath: "on",
    symbolPath: "on",
    icons: true
  },
  git: {
    enabled: true,
    autoRefresh: true,
    confirmSync: true,
    autofetch: true,
    decorations: {
      enabled: true,
      colors: true
    }
  },
  window: {
    titleBarStyle: "custom",
    menuBarVisibility: "classic",
    zoomLevel: 0,
    newWindowDimensions: "default"
  },
  workbench: {
    colorCustomizations: {},
    fontAliasing: "auto",
    tree: {
      indent: 8,
      renderIndentGuides: "onHover"
    },
    list: {
      smoothScrolling: true,
      horizontalScrolling: false
    }
  },
  accessibility: {
    screenReaderOptimized: false,
    links: true,
    verbosity: "medium"
  },
  diffEditor: {
    ignoreTrimWhitespace: true,
    renderSideBySide: true,
    maxComputationTime: 5000
  },
  keyboard: {
    dispatch: "code",
    multiCursorModifier: "alt"
  },
  extensions: {
    autoCheckUpdates: true,
    autoUpdate: "on",
    closeExtensionAfterInstall: false
  },
  telemetry: {
    enabled: true,
    crashReporter: true
  },
  update: {
    mode: "manual",
    showReleaseNotes: true,
    gitHubRepository: "dhrubajyoti-baruah/Tilder",
    autoCheckInterval: "startup"
  },
  security: {
    workspace: {
      trust: {
        enabled: true
      }
    }
  },
  zenMode: {
    fullScreen: true,
    centerLayout: true,
    hideTabs: true,
    hideStatusBar: false,
    hideActivityBar: true
  }
};

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

export function mergeWithDefaultSettings(value) {
  const source = isPlainObject(value) ? value : {};

  function merge(defaultValue, incomingValue) {
    if (Array.isArray(defaultValue)) {
      return Array.isArray(incomingValue) ? [...incomingValue] : [...defaultValue];
    }

    if (isPlainObject(defaultValue)) {
      const next = { ...defaultValue };
      const incomingObject = isPlainObject(incomingValue) ? incomingValue : {};

      Object.keys(incomingObject).forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(defaultValue, key)) {
          next[key] = merge(defaultValue[key], incomingObject[key]);
        } else {
          next[key] = incomingObject[key];
        }
      });

      return next;
    }

    return incomingValue === undefined ? defaultValue : incomingValue;
  }

  return merge(defaultSettings, source);
}

export default defaultSettings;
