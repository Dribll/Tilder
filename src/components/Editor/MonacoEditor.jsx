import React, { useEffect } from 'react';
import { Editor } from '@monaco-editor/react';
import { emmetCSS, emmetHTML, emmetJSX } from 'emmet-monaco-es';
import { getExtensionCompletions } from '../../core/extensionsRuntime.js';
import '../../App.css';
import { disposeEditorResources } from '../../core/editorUtils.js';

const VOID_HTML_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

let linkedHtmlTagProviderRegistered = false;
let emmetRegistered = false;
let embeddedCssProviderRegistered = false;
let embeddedJavaScriptProviderRegistered = false;
let embeddedCssPropertiesCache = null;
const lspCompletionRegistrations = new Map();
const lspFeatureRegistrations = new Map();
const extensionCompletionRegistrations = new Map();
const lspContextResolvers = new Map();
const LSP_COMPLETION_TRIGGER_CHARACTERS = [
  '.',
  ':',
  '>',
  '"',
  "'",
  '/',
  '#',
  '(',
  '<',
  ' ',
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'.split(''),
];

function toMonacoCompletionKind(monaco, lspKind) {
  const completionKind = monaco.languages.CompletionItemKind;
  const kindMap = {
    1: completionKind.Text,
    2: completionKind.Method,
    3: completionKind.Function,
    4: completionKind.Constructor,
    5: completionKind.Field,
    6: completionKind.Variable,
    7: completionKind.Class,
    8: completionKind.Interface,
    9: completionKind.Module,
    10: completionKind.Property,
    11: completionKind.Unit,
    12: completionKind.Value,
    13: completionKind.Enum,
    14: completionKind.Keyword,
    15: completionKind.Snippet,
    16: completionKind.Color,
    17: completionKind.File,
    18: completionKind.Reference,
    19: completionKind.Folder,
    20: completionKind.EnumMember,
    21: completionKind.Constant,
    22: completionKind.Struct,
    23: completionKind.Event,
    24: completionKind.Operator,
    25: completionKind.TypeParameter,
  };

  return kindMap[lspKind] || completionKind.Text;
}

function toMonacoCompletionItems(monaco, response, range) {
  const rawItems = Array.isArray(response) ? response : Array.isArray(response?.items) ? response.items : [];

  return rawItems
    .map((item, index) => {
      const label =
        typeof item.label === 'string' ? item.label : item.label?.label || item.insertText || '';
      
      let textEditRange = null;
      if (item.textEdit) {
        const editRange = item.textEdit.range || item.textEdit.insert || item.textEdit.replace;
        if (editRange) {
          textEditRange = {
            startLineNumber: Number(editRange.start?.line || 0) + 1,
            startColumn: Number(editRange.start?.character || 0) + 1,
            endLineNumber: Number(editRange.end?.line || 0) + 1,
            endColumn: Number(editRange.end?.character || 0) + 1,
          };
        }
      }

      const finalRange = textEditRange || range;
      const monacoRange = new monaco.Range(
        finalRange.startLineNumber,
        finalRange.startColumn,
        finalRange.endLineNumber,
        finalRange.endColumn
      );

      return {
        label,
        kind: toMonacoCompletionKind(monaco, item.kind),
        insertText: item.textEdit?.newText || item.insertText || label,
        insertTextRules:
          item.insertTextFormat === 2
            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : monaco.languages.CompletionItemInsertTextRule.None,
        detail: item.detail || '',
        documentation:
          typeof item.documentation === 'string'
            ? item.documentation
            : item.documentation?.value || item.documentation?.kind || '',
        sortText: item.sortText || `z-${String(index).padStart(4, '0')}`,
        filterText: item.filterText || label,
        range: monacoRange,
        preselect: Boolean(item.preselect),
        commitCharacters: Array.isArray(item.commitCharacters) ? item.commitCharacters : undefined,
      };
    })
    .filter((item) => item.label);
}

function toFallbackCompletionKind(monaco, kind) {
  switch (kind) {
    case 'function':
      return monaco.languages.CompletionItemKind.Function;
    case 'keyword':
      return monaco.languages.CompletionItemKind.Keyword;
    case 'snippet':
    default:
      return monaco.languages.CompletionItemKind.Snippet;
  }
}

function buildExtensionCompletionItems(monaco, languageId, range) {
  const monacoRange = new monaco.Range(
    range.startLineNumber,
    range.startColumn,
    range.endLineNumber,
    range.endColumn
  );
  return getReactAwareExtensionCompletions(languageId).map((item, index) => ({
    label: item.label,
    kind: toFallbackCompletionKind(monaco, item.kind),
    insertText: item.insertText,
    insertTextRules:
      item.kind === 'snippet'
        ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
        : monaco.languages.CompletionItemInsertTextRule.None,
    detail: item.detail || '',
    documentation: item.documentation || '',
    filterText: item.filterText || item.label,
    sortText: item.sortText || `zy-ext-${String(index).padStart(4, '0')}`,
    range: monacoRange,
  }));
}

function mergeSuggestions(...groups) {
  const seen = new Set();
  const merged = [];

  for (const group of groups) {
    for (const item of group || []) {
      const label = String(item?.label?.label || item?.label || '').trim();
      if (!label) {
        continue;
      }
      const key = `${label.toLowerCase()}::${String(item.insertText || label)}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(item);
    }
  }

  return merged;
}

function buildEditorOptions(settings, tab, wordBasedSuggestions) {
  const minimapSettings = settings?.minimap || {};
  const scrollbarSettings = settings?.scrollbar || {};
  const hoverSettings = settings?.hover || {};
  const findSettings = settings?.find || {};
  const lightbulbSettings = settings?.lightbulb || {};
  const parameterHintsSettings = settings?.parameterHints || {};
  const stickyScrollSettings = settings?.stickyScroll || {};
  const bracketPairColorizationSettings = settings?.bracketPairColorization || {};
  const inlineSuggestSettings = settings?.inlineSuggest || {};
  const guidesSettings = settings?.guides || {};

  return {
    ...settings,
    dragAndDrop: true,
    tabSize: tab?.tabSize ?? settings?.tabSize,
    insertSpaces: tab?.insertSpaces ?? settings?.insertSpaces,
    fontFamily: settings?.fontFamily,
    fontSize: settings?.fontSize ?? 14,
    fontWeight: settings?.fontWeight ?? 'normal',
    lineHeight: settings?.lineHeight > 0 ? settings.lineHeight : undefined,
    letterSpacing: settings?.letterSpacing ?? 0,
    fontLigatures: settings?.fontLigatures ? true : false,
    automaticLayout: settings?.automaticLayout !== false,
    glyphMargin: settings?.glyphMargin !== false,
    autoIndent: settings?.autoIndent ?? 'advanced',
    suggestOnTriggerCharacters: settings?.suggestOnTriggerCharacters !== false,
    quickSuggestionsDelay: settings?.quickSuggestionsDelay ?? 10,
    quickSuggestions:
      typeof settings?.quickSuggestions === 'boolean'
        ? settings.quickSuggestions
          ? { other: true, comments: false, strings: true }
          : false
        : settings?.quickSuggestions ?? { other: true, comments: false, strings: true },
    suggest: {
      selectionMode: 'always',
      snippetsPreventQuickSuggestions: false,
      showWords: true,
      showSnippets: settings?.snippetSuggestions !== 'none',
      localityBonus: true,
      showIcons: true,
      showStatusBar: true,
    },
    suggestSelection: settings?.suggestSelection ?? 'recentlyUsed',
    snippetSuggestions: settings?.snippetSuggestions ?? 'inline',
    acceptSuggestionOnEnter: settings?.acceptSuggestionOnEnter ?? 'on',
    acceptSuggestionOnCommitCharacter: true,
    tabCompletion: settings?.tabCompletion ?? 'off',
    parameterHints: {
      enabled: parameterHintsSettings.enabled !== false,
    },
    lightbulb: {
      enabled: lightbulbSettings.enabled !== false,
    },
    stickyScroll: {
      enabled: Boolean(stickyScrollSettings.enabled),
    },
    hover: {
      enabled: hoverSettings.enabled !== false,
      delay: hoverSettings.delay ?? 300,
    },
    find: {
      cursorMoveOnType: findSettings.cursorMoveOnType !== false,
      autoFindInSelection: findSettings.autoFindInSelection ?? 'never',
      seedSearchStringFromSelection: findSettings.seedSearchStringFromSelection !== false,
    },
    linkedEditing: settings?.links !== false,
    autoClosingBrackets: settings?.autoClosingBrackets ?? 'always',
    autoClosingQuotes: settings?.autoClosingQuotes ?? 'always',
    autoClosingDelete: settings?.autoClosingDelete ?? 'auto',
    autoClosingComments: 'always',
    autoSurround: 'languageDefined',
    wordBasedSuggestions,
    minimap: {
      enabled: minimapSettings.enabled !== false,
      side: minimapSettings.side ?? 'right',
      size: minimapSettings.size ?? 'proportional',
      showSlider: minimapSettings.showSlider ?? 'mouseover',
      renderCharacters: minimapSettings.renderCharacters !== false,
      maxColumn: minimapSettings.maxColumn ?? 120,
    },
    scrollbar: {
      vertical: scrollbarSettings.vertical ?? 'auto',
      horizontal: scrollbarSettings.horizontal ?? 'auto',
      verticalScrollbarSize: scrollbarSettings.verticalScrollbarSize ?? 12,
      horizontalScrollbarSize: scrollbarSettings.horizontalScrollbarSize ?? 12,
      useShadows: scrollbarSettings.useShadows !== false,
      alwaysConsumeMouseWheel: scrollbarSettings.alwaysConsumeMouseWheel !== false,
    },
    bracketPairColorization: {
      enabled: bracketPairColorizationSettings.enabled !== false,
    },
    inlineSuggest: {
      enabled: inlineSuggestSettings.enabled !== false,
    },
    guides: {
      indentation: guidesSettings.indentation !== false,
      bracketPairs: guidesSettings.bracketPairs !== false,
    },
  };
}

function getReactAwareExtensionCompletions(languageId) {
  const normalizedLanguageId = String(languageId || '').trim().toLowerCase();
  const languageIds = [normalizedLanguageId];

  if (normalizedLanguageId === 'javascript' && !languageIds.includes('javascriptreact')) {
    languageIds.push('javascriptreact');
  }

  if (normalizedLanguageId === 'typescript' && !languageIds.includes('typescriptreact')) {
    languageIds.push('typescriptreact');
  }

  const seen = new Set();
  return languageIds.flatMap((id) =>
    getExtensionCompletions(id).filter((item) => {
      const key = `${String(item.label || '').toLowerCase()}::${String(item.insertText || '')}`;
      if (!item?.label || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
  );
}

function findExactExtensionSnippet(languageId, prefix) {
  const normalizedPrefix = String(prefix || '').trim().toLowerCase();
  if (!normalizedPrefix) {
    return null;
  }

  return (
    getReactAwareExtensionCompletions(languageId).find((item) => {
      if (String(item.kind || '').toLowerCase() !== 'snippet') {
        return false;
      }

      const label = String(item.label || '').trim().toLowerCase();
      const filterText = String(item.filterText || '').trim().toLowerCase();
      return label === normalizedPrefix || filterText === normalizedPrefix;
    }) || null
  );
}

function expandExactExtensionSnippet(editor, monaco, languageId) {
  const model = editor.getModel?.();
  const position = editor.getPosition?.();
  if (!model || !position) {
    return false;
  }

  const word = model.getWordUntilPosition(position);
  const prefix = model.getValueInRange({
    startLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  });

  const snippet = findExactExtensionSnippet(languageId, prefix);
  if (!snippet) {
    return false;
  }

  const snippetController = editor.getContribution?.('snippetController2');
  if (snippetController?.insert) {
    snippetController.insert(snippet.insertText, {
      overwriteBefore: prefix.length,
      overwriteAfter: 0,
      undoStopBefore: true,
      undoStopAfter: true,
    });
    return true;
  }

  const range = {
    startLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  };

  try {
    editor.trigger('keyboard', 'editor.action.insertSnippet', {
      snippet: snippet.insertText,
      range,
    });
    return true;
  } catch {
    return false;
  }
}

function getTriggerCharacter(model, position) {
  const offset = model.getOffsetAt(position);
  const text = model.getValue();
  const previousCharacter = text[Math.max(0, offset - 1)] || '';
  if (previousCharacter && previousCharacter.length === 1 && !/\s/.test(previousCharacter)) {
    // Only return as a trigger character if it is NOT a word character (a-z, A-Z, 0-9, _)
    if (!/^[a-zA-Z0-9_]$/.test(previousCharacter)) {
      return previousCharacter;
    }
  }
  return undefined;
}

function shouldUseManualSuggestTrigger(providerType) {
  return providerType === 'lsp' || providerType === 'basic' || providerType === 'extension-disabled';
}

function setLspContextResolver(languageId, token, resolver) {
  if (!languageId) {
    return;
  }

  const normalizedLanguageId = String(languageId).trim();
  if (!normalizedLanguageId) {
    return;
  }

  if (typeof resolver === 'function') {
    const resolvers = lspContextResolvers.get(normalizedLanguageId) || new Map();
    resolvers.set(token, resolver);
    lspContextResolvers.set(normalizedLanguageId, resolvers);
    return;
  }

  const resolvers = lspContextResolvers.get(normalizedLanguageId);
  if (!resolvers) {
    return;
  }

  resolvers.delete(token);
  if (!resolvers.size) {
    lspContextResolvers.delete(normalizedLanguageId);
  }
}

function getLspContextResolver(languageId) {
  const normalizedLanguageId = String(languageId || '').trim();
  const resolvers = lspContextResolvers.get(normalizedLanguageId);
  if (!resolvers?.size) {
    return null;
  }

  return () => {
    const resolverList = Array.from(resolvers.values()).reverse();
    for (const resolver of resolverList) {
      try {
        const context = resolver?.();
        if (context?.bridge) {
          return context;
        }
      } catch {
        // A stale editor resolver should not block active LSP completions.
      }
    }
    return null;
  };
}

function isUserTypingSuggestTrigger(text) {
  if (typeof text !== 'string' || text.length !== 1) {
    return false;
  }

  return /[A-Za-z0-9_:#./"'(-]/.test(text);
}

function offsetToRange(model, startOffset, endOffset) {
  const start = model.getPositionAt(startOffset);
  const end = model.getPositionAt(endOffset);
  return {
    startLineNumber: start.lineNumber,
    startColumn: start.column,
    endLineNumber: end.lineNumber,
    endColumn: end.column,
  };
}

function buildHtmlTagPairs(text) {
  const tagPattern = /<\/?([A-Za-z][\w:-]*)?[^>]*?>/g;
  const stack = [];
  const pairs = [];
  let match;

  while ((match = tagPattern.exec(text))) {
    const [tagText, rawName = ''] = match;
    const name = rawName.toLowerCase();
    const isClosing = tagText.startsWith('</');
    const isSelfClosing = /\/\s*>$/.test(tagText);
    const nameStartOffset = match.index + (isClosing ? 2 : 1);
    const nameEndOffset = nameStartOffset + rawName.length;

    if (!isClosing && !isSelfClosing && !VOID_HTML_TAGS.has(name)) {
      stack.push({
        name,
        range: { startOffset: nameStartOffset, endOffset: nameEndOffset },
      });
      continue;
    }

    if (isClosing) {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        const canLink =
          stack[index].name === name ||
          stack[index].name.length === 0 ||
          name.length === 0;

        if (!canLink) {
          continue;
        }

        const [openTag] = stack.splice(index, 1);
        pairs.push({
          openRange: openTag.range,
          closeRange: { startOffset: nameStartOffset, endOffset: nameEndOffset },
        });
        break;
      }
    }
  }

  return pairs;
}

function registerHtmlLinkedTagProvider(monaco) {
  if (linkedHtmlTagProviderRegistered) {
    return;
  }

  monaco.languages.registerLinkedEditingRangeProvider('html', {
    provideLinkedEditingRanges(model, position) {
      const text = model.getValue();
      const offset = model.getOffsetAt(position);
      const pairs = buildHtmlTagPairs(text);

      for (const pair of pairs) {
        const isInsideOpen =
          offset >= pair.openRange.startOffset && offset <= pair.openRange.endOffset;
        const isInsideClose =
          offset >= pair.closeRange.startOffset && offset <= pair.closeRange.endOffset;

        if (!isInsideOpen && !isInsideClose) {
          continue;
        }

        return {
          ranges: [
            offsetToRange(model, pair.openRange.startOffset, pair.openRange.endOffset),
            offsetToRange(model, pair.closeRange.startOffset, pair.closeRange.endOffset),
          ],
          wordPattern: /[\w:-]*/,
        };
      }

      return null;
    },
  });

  linkedHtmlTagProviderRegistered = true;
}

function getIndentUnit(tab, settings) {
  const insertSpaces = tab?.insertSpaces ?? settings?.insertSpaces;
  const tabSize = Number(tab?.tabSize ?? settings?.tabSize) || 2;
  return insertSpaces ? ' '.repeat(tabSize) : '\t';
}

function getHtmlTextBeforePosition(model, position) {
  return model.getValueInRange({
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  });
}

function isInsideHtmlTagBlock(model, position, tagName) {
  const textBeforeCursor = getHtmlTextBeforePosition(model, position).toLowerCase();
  const openTagPattern = `<${tagName}`;
  const closeTagPattern = `</${tagName}`;
  const lastOpen = textBeforeCursor.lastIndexOf(openTagPattern);
  const lastClose = textBeforeCursor.lastIndexOf(closeTagPattern);
  return lastOpen !== -1 && lastOpen > lastClose;
}

function isInsideHtmlStyleBlock(model, position) {
  return isInsideHtmlTagBlock(model, position, 'style');
}

function isInsideHtmlScriptBlock(model, position) {
  return isInsideHtmlTagBlock(model, position, 'script');
}

function isInsideHtmlEmbeddedText(model, position, tagName) {
  if (!isInsideHtmlTagBlock(model, position, tagName)) {
    return false;
  }

  const textBeforeCursor = model.getValueInRange({
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  });
  const lastOpenBracket = textBeforeCursor.lastIndexOf('>');
  const lastTagStart = textBeforeCursor.lastIndexOf(`<${tagName}`);
  return lastTagStart !== -1 && lastOpenBracket > lastTagStart;
}

function handleHtmlStyleBlockEnter(editor, monaco, tab, settings) {
  if (tab?.language !== 'html') {
    return false;
  }

  const model = editor.getModel?.();
  const position = editor.getPosition?.();
  if (!model || !position || !isInsideHtmlStyleBlock(model, position)) {
    return false;
  }

  const lineContent = model.getLineContent(position.lineNumber);
  const beforeCursor = lineContent.slice(0, Math.max(0, position.column - 1));
  const afterCursor = lineContent.slice(Math.max(0, position.column - 1));
  const trimmedBefore = beforeCursor.trimEnd();
  const trimmedAfter = afterCursor.trimStart();

  if (!trimmedBefore.endsWith('{') || !trimmedAfter.startsWith('}')) {
    return false;
  }

  const baseIndent = beforeCursor.match(/^\s*/)?.[0] || '';
  const indentUnit = getIndentUnit(tab, settings);
  const insertText = `\n${baseIndent}${indentUnit}\n${baseIndent}`;

  editor.executeEdits('tilder-html-style-enter', [
    {
      range: new monaco.Range(
        position.lineNumber,
        position.column,
        position.lineNumber,
        position.column
      ),
      text: insertText,
      forceMoveMarkers: true,
    },
  ]);

  editor.setPosition({
    lineNumber: position.lineNumber + 1,
    column: baseIndent.length + indentUnit.length + 1,
  });
  editor.revealPositionInCenterIfOutsideViewport({
    lineNumber: position.lineNumber + 1,
    column: baseIndent.length + indentUnit.length + 1,
  });
  return true;
}

function toKebabCase(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/^ms-/, '-ms-')
    .toLowerCase();
}

function getEmbeddedCssProperties() {
  if (embeddedCssPropertiesCache) {
    return embeddedCssPropertiesCache;
  }

  const seededProperties = new Set([
    'align-items',
    'background',
    'background-color',
    'border',
    'border-radius',
    'bottom',
    'box-shadow',
    'color',
    'display',
    'flex',
    'flex-direction',
    'font-family',
    'font-size',
    'font-weight',
    'gap',
    'grid-template-columns',
    'height',
    'justify-content',
    'left',
    'letter-spacing',
    'line-height',
    'list-style',
    'margin',
    'margin-top',
    'opacity',
    'padding',
    'position',
    'right',
    'text-align',
    'top',
    'transform',
    'transition',
    'width',
    'z-index',
  ]);

  if (typeof window !== 'undefined' && window.CSSStyleDeclaration) {
    const prototypeNames = Object.getOwnPropertyNames(window.CSSStyleDeclaration.prototype);
    prototypeNames
      .filter((name) => /^[A-Za-z]/.test(name) && !name.startsWith('webkit') && !name.startsWith('constructor'))
      .map(toKebabCase)
      .filter((name) => name && !name.includes('('))
      .forEach((name) => seededProperties.add(name));
  }

  embeddedCssPropertiesCache = [...seededProperties].sort((left, right) => left.localeCompare(right));
  return embeddedCssPropertiesCache;
}

function isInsideHtmlCssDeclarationBlock(model, position) {
  if (!isInsideHtmlStyleBlock(model, position)) {
    return false;
  }

  const textBeforeCursor = model.getValueInRange({
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  });

  const lastOpenBrace = textBeforeCursor.lastIndexOf('{');
  const lastCloseBrace = textBeforeCursor.lastIndexOf('}');
  return lastOpenBrace !== -1 && lastOpenBrace > lastCloseBrace;
}

function registerEmbeddedCssProvider(monaco) {
  if (embeddedCssProviderRegistered) {
    return;
  }

  monaco.languages.registerCompletionItemProvider('html', {
    triggerCharacters: ['-', ':'],
    provideCompletionItems(model, position) {
      if (!isInsideHtmlCssDeclarationBlock(model, position)) {
        return { suggestions: [] };
      }

      const linePrefix = model.getLineContent(position.lineNumber).slice(0, Math.max(0, position.column - 1));
      const trimmedLinePrefix = linePrefix.trim();
      if (!trimmedLinePrefix || trimmedLinePrefix.endsWith('{')) {
        return { suggestions: [] };
      }

      const lastColonIndex = linePrefix.lastIndexOf(':');
      const lastSemicolonIndex = linePrefix.lastIndexOf(';');
      if (lastColonIndex > lastSemicolonIndex) {
        return { suggestions: [] };
      }

      const word = model.getWordUntilPosition(position);
      const monacoRange = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn
      );

      const suggestions = getEmbeddedCssProperties().map((propertyName) => ({
        label: propertyName,
        kind: monaco.languages.CompletionItemKind.Property,
        insertText: `${propertyName}: \${1};`,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        documentation: `CSS property: ${propertyName}`,
        filterText: propertyName,
        sortText: `a-${propertyName}`,
        range: monacoRange,
      }));

      return { suggestions };
    },
  });

  embeddedCssProviderRegistered = true;
}

function registerEmbeddedJavaScriptProvider(monaco) {
  if (embeddedJavaScriptProviderRegistered) {
    return;
  }

  monaco.languages.registerCompletionItemProvider('html', {
    triggerCharacters: ['.', '(', '"', "'", '['],
    provideCompletionItems(model, position) {
      if (!isInsideHtmlEmbeddedText(model, position, 'script')) {
        return { suggestions: [] };
      }

      return { suggestions: [] };
    },
  });

  embeddedJavaScriptProviderRegistered = true;
}

function registerEmmetProviders(monaco) {
  if (emmetRegistered) {
    return;
  }

  emmetHTML(monaco, ['html'], { tokenizer: 'standard' });
  emmetCSS(monaco, ['css', 'scss'], { tokenizer: 'standard' });
  emmetJSX(monaco, ['javascript', 'typescript'], { tokenizer: 'standard' });
  emmetRegistered = true;
}

function registerLspCompletionProvider(monaco, languageId, getLspContext) {
  if (!languageId) {
    return;
  }

  setLspContextResolver(languageId, `bootstrap:${languageId}`, getLspContext);

  const existingRegistration = lspCompletionRegistrations.get(languageId);
  if (existingRegistration?.monaco === monaco) {
    return;
  }
  existingRegistration?.disposable?.dispose?.();

  const disposable = monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: LSP_COMPLETION_TRIGGER_CHARACTERS,
    async provideCompletionItems(model, position) {
      const context = getLspContextResolver(languageId)?.() || getLspContext?.() || null;
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: word.endColumn,
      };

      console.log(`[Tilder LSP] provideCompletionItems called for lang=${languageId}`, {
        hasContext: !!context,
        contextLanguageId: context?.languageId,
        hasBridge: !!context?.bridge,
        relativePath: context?.relativePath,
      });

      if (!context || context.languageId !== languageId || !context.bridge) {
        console.warn(`[Tilder LSP] Skipping completion: context=${!!context}, lang match=${context?.languageId === languageId}, bridge=${!!context?.bridge}`);
        return { suggestions: [] };
      }

      try {
        const completionRequest = {
          relativePath: context.relativePath,
          fileName: context.fileName,
          text: model.getValue(),
          position,
          triggerCharacter: getTriggerCharacter(model, position),
        };

        console.log(`[Tilder LSP] Sending completion request`, { relativePath: completionRequest.relativePath, line: position.lineNumber, col: position.column, triggerCharacter: completionRequest.triggerCharacter });

        let response = await context.bridge.requestCompletion(completionRequest);
        console.log(`[Tilder LSP] Got completion response`, { isArray: Array.isArray(response), hasItems: !!response?.items, itemCount: Array.isArray(response) ? response.length : response?.items?.length });
        let suggestions = toMonacoCompletionItems(monaco, response, range);
        console.log(`[Tilder LSP] Converted to ${suggestions.length} Monaco suggestions`);

        if (!suggestions.length) {
          await new Promise((resolve) => window.setTimeout(resolve, 150));
          response = await context.bridge.requestCompletion(completionRequest);
          suggestions = toMonacoCompletionItems(monaco, response, range);
          console.log(`[Tilder LSP] Retry: ${suggestions.length} suggestions`);
        }

        return {
          suggestions: mergeSuggestions(suggestions),
        };
      } catch (err) {
        console.error(`[Tilder LSP] Completion error:`, err);
        return {
          suggestions: [],
        };
      }
    },
  });

  lspCompletionRegistrations.set(languageId, { monaco, disposable });
}

function registerLspFeatureProviders(monaco, languageId, getLspContext) {
  if (!languageId) {
    return;
  }

  setLspContextResolver(languageId, `bootstrap:${languageId}`, getLspContext);

  const existingRegistration = lspFeatureRegistrations.get(languageId);
  if (existingRegistration?.monaco === monaco) {
    return;
  }
  existingRegistration?.disposables?.forEach((disposable) => disposable?.dispose?.());

  const disposables = [
    monaco.languages.registerHoverProvider(languageId, {
      async provideHover(model, position) {
        const context = getLspContextResolver(languageId)?.() || getLspContext?.() || null;
        if (!context || context.languageId !== languageId || !context.bridge?.requestHover) {
          return { contents: [] };
        }

        try {
          return await context.bridge.requestHover({
            relativePath: context.relativePath,
            fileName: context.fileName,
            text: model.getValue(),
            position,
          });
        } catch {
          return { contents: [] };
        }
      },
    }),
    monaco.languages.registerDefinitionProvider(languageId, {
      async provideDefinition(model, position) {
        const context = getLspContextResolver(languageId)?.() || getLspContext?.() || null;
        if (!context || context.languageId !== languageId || !context.bridge?.requestDefinition) {
          return [];
        }

        try {
          return await context.bridge.requestDefinition({
            relativePath: context.relativePath,
            fileName: context.fileName,
            text: model.getValue(),
            position,
          });
        } catch {
          return [];
        }
      },
    }),
    monaco.languages.registerReferenceProvider(languageId, {
      async provideReferences(model, position) {
        const context = getLspContextResolver(languageId)?.() || getLspContext?.() || null;
        if (!context || context.languageId !== languageId || !context.bridge?.requestReferences) {
          return [];
        }

        try {
          return await context.bridge.requestReferences({
            relativePath: context.relativePath,
            fileName: context.fileName,
            text: model.getValue(),
            position,
            includeDeclaration: true,
          });
        } catch {
          return [];
        }
      },
    }),
    monaco.languages.registerRenameProvider(languageId, {
      async provideRenameEdits(model, position, newName) {
        const context = getLspContextResolver(languageId)?.() || getLspContext?.() || null;
        if (!context || context.languageId !== languageId || !context.bridge?.requestRename) {
          return null;
        }

        try {
          return await context.bridge.requestRename({
            relativePath: context.relativePath,
            fileName: context.fileName,
            text: model.getValue(),
            position,
            newName,
          });
        } catch {
          return null;
        }
      },
    }),
    monaco.languages.registerDocumentSymbolProvider(languageId, {
      async provideDocumentSymbols(model) {
        const context = getLspContextResolver(languageId)?.() || getLspContext?.() || null;
        if (!context || context.languageId !== languageId || !context.bridge?.requestSymbols) {
          return [];
        }

        try {
          return await context.bridge.requestSymbols({
            relativePath: context.relativePath,
            fileName: context.fileName,
            text: model.getValue(),
          });
        } catch {
          return [];
        }
      },
    }),
    monaco.languages.registerSignatureHelpProvider(languageId, {
      signatureHelpTriggerCharacters: ['(', ','],
      signatureHelpRetriggerCharacters: [','],
      async provideSignatureHelp(model, position) {
        const context = getLspContextResolver(languageId)?.() || getLspContext?.() || null;
        if (!context || context.languageId !== languageId || !context.bridge?.requestSignatureHelp) {
          return { value: { signatures: [], activeSignature: 0, activeParameter: 0 } };
        }

        try {
          const response = await context.bridge.requestSignatureHelp({
            relativePath: context.relativePath,
            fileName: context.fileName,
            text: model.getValue(),
            position,
          });
          return { value: response || { signatures: [], activeSignature: 0, activeParameter: 0 } };
        } catch {
          return { value: { signatures: [], activeSignature: 0, activeParameter: 0 } };
        }
      },
    }),
  ];

  lspFeatureRegistrations.set(languageId, { monaco, disposables });
}

function registerExtensionCompletionProvider(monaco, languageId) {
  if (!languageId) {
    return;
  }

  const existingRegistration = extensionCompletionRegistrations.get(languageId);
  if (existingRegistration?.monaco === monaco) {
    return;
  }
  existingRegistration?.disposable?.dispose?.();

  const disposable = monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: ['.', ':', '>', '"', "'", '/', '#', '(', '<', ' '],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: word.endColumn,
      };

      return {
        suggestions: mergeSuggestions(buildExtensionCompletionItems(monaco, languageId, range)),
      };
    },
  });

  extensionCompletionRegistrations.set(languageId, { monaco, disposable });
}

function disposeExtensionCompletionProvider(languageId) {
  const registration = extensionCompletionRegistrations.get(languageId);
  if (registration) {
    registration.disposable?.dispose?.();
    extensionCompletionRegistrations.delete(languageId);
  }
}

function classifyBinaryTab(tab) {
  if (!tab?.isBinary) {
    return 'text';
  }
  const mimeType = String(tab.mimeType || '').toLowerCase();
  if (mimeType.startsWith('image/')) {
    return 'image';
  }
  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }
  if (mimeType.startsWith('video/')) {
    return 'video';
  }
  if (mimeType === 'application/pdf') {
    return 'pdf';
  }
  return 'binary';
}

export default function MonacoEditor({
  settings,
  tab,
  onChange,
  onMount,
  onFocusEditor,
  MonacoEditorDisplay,
  monacoEditorStyle,
  onOpenCommandPalette,
  onToggleZenMode,
  onEscapeCurrentMode,
  onGoToLine,
  onGoToDefinition,
  onGoToReferences,
  onPeekDefinition,
  onPeekReferences,
  onRenameSymbol,
  intelliSense,
  lspBridge,
  breakpoints = [],
  onToggleBreakpoint,
}) {
  const editorRef = React.useRef(null);
  const monacoRef = React.useRef(null);
  const activeLspContextRef = React.useRef(null);
  const activeIntelliSenseRef = React.useRef(intelliSense);
  const lspResolverTokenRef = React.useRef(Symbol(`lsp-context:${tab?.id || 'unknown'}`));
  const breakpointDecorationsRef = React.useRef([]);
  const [binaryViewMode, setBinaryViewMode] = React.useState('preview');

  if (!settings || !tab) {
    return null;
  }

  const binaryKind = classifyBinaryTab(tab);
  const isBinaryTab = binaryKind !== 'text';
  const canPreviewBinary = binaryKind === 'image' || binaryKind === 'pdf' || binaryKind === 'audio' || binaryKind === 'video';
  const binaryPreviewUrl = React.useMemo(() => {
    if (!isBinaryTab || !canPreviewBinary || !tab.content) {
      return '';
    }
    return `data:${tab.mimeType || 'application/octet-stream'};base64,${tab.content}`;
  }, [canPreviewBinary, isBinaryTab, tab.content, tab.mimeType]);

  const isExe = tab.name && tab.name.toLowerCase().endsWith('.exe');

  const handleRunExecutable = async () => {
    try {
      const { desktopExecuteCommand } = await import('../../core/desktopFileApi.js');
      await desktopExecuteCommand(tab.path);
    } catch (err) {
      console.error('Failed to run executable:', err);
      alert('Error running executable: ' + (err.message || err));
    }
  };

  React.useEffect(() => {
    setBinaryViewMode(canPreviewBinary ? 'preview' : 'raw');
  }, [tab.id, canPreviewBinary]);

  function handleMount(editor, monaco) {
    editorRef.current = editor;
    monacoRef.current = monaco;

    if (monaco.languages.typescript) {
      monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false,
      });
      monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false,
      });
    }

    registerEmmetProviders(monaco);
    registerHtmlLinkedTagProvider(monaco);
    registerEmbeddedCssProvider(monaco);
    registerEmbeddedJavaScriptProvider(monaco);
    registerLspCompletionProvider(monaco, tab.language, () => activeLspContextRef.current);
    registerLspFeatureProviders(monaco, tab.language, () => activeLspContextRef.current);
    activeLspContextRef.current =
      intelliSense?.providerType === 'lsp' && lspBridge
        ? {
            bridge: lspBridge,
            languageId: tab.language,
            relativePath: tab.path === 'root' ? tab.name : tab.path,
            fileName: tab.name,
          }
        : null;
    if (intelliSense?.providerType !== 'lsp') {
      registerExtensionCompletionProvider(monaco, tab.language);
    } else {
      disposeExtensionCompletionProvider(tab.language);
    }

    monaco.editor.defineTheme('tilder-night', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6f7c99' },
        { token: 'keyword', foreground: 'c7a3ff' },
        { token: 'string', foreground: '8fe388' },
        { token: 'number', foreground: 'ffd27a' },
        { token: 'type.identifier', foreground: '7dcfff' },
        { token: 'identifier', foreground: 'e8edff' },
      ],
      colors: {
        'editor.background': '#0a0d16',
        'editor.foreground': '#edf1ff',
        'editorCursor.foreground': '#a79dff',
        'editor.lineHighlightBackground': '#151a2a',
        'editorLineNumber.foreground': '#5b6685',
        'editorLineNumber.activeForeground': '#cdd7ff',
        'editor.selectionBackground': '#2d3560',
        'editor.inactiveSelectionBackground': '#232941',
        'editorIndentGuide.background1': '#1c2236',
        'editorIndentGuide.activeBackground1': '#414b73',
        'editorWidget.background': '#121726',
        'editorWidget.border': '#2f3760',
        'editorSuggestWidget.background': '#121726',
        'editorSuggestWidget.border': '#2f3760',
        'editorSuggestWidget.selectedBackground': '#242d4a',
        'editorHoverWidget.background': '#121726',
        'editorHoverWidget.border': '#2f3760',
        'scrollbarSlider.background': '#3a4470aa',
        'scrollbarSlider.hoverBackground': '#4b578faa',
        'scrollbarSlider.activeBackground': '#6270b8aa',
        'editorError.foreground': '#ff5370',
        'editorWarning.foreground': '#ffcb6b',
        'editorInfo.foreground': '#82aaff',
      },
    });

    monaco.editor.setTheme('tilder-night');

      if (onOpenCommandPalette) {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP, () => onOpenCommandPalette());
        editor.addCommand(monaco.KeyCode.F1, () => onOpenCommandPalette());
      }

      if (onToggleZenMode) {
        editor.addCommand(
          monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, monaco.KeyCode.KeyZ),
          () => onToggleZenMode()
        );
      }

      if (onEscapeCurrentMode) {
        editor.addCommand(monaco.KeyMod.chord(monaco.KeyCode.Escape, monaco.KeyCode.Escape), () => onEscapeCurrentMode());
      }

      if (onGoToLine) {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG, () => onGoToLine());
      }

    if (onGoToDefinition) {
      editor.addCommand(monaco.KeyCode.F12, () => onGoToDefinition());
    }

    if (onGoToReferences) {
      editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.F12, () => onGoToReferences());
    }

    if (onPeekDefinition) {
      editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.F12, () => onPeekDefinition());
    }

    if (onPeekReferences) {
      editor.addCommand(monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.F12, () => onPeekReferences());
    }

    if (onRenameSymbol) {
      editor.addCommand(monaco.KeyCode.F2, () => onRenameSymbol());
    }

      editor.addCommand(
        monaco.KeyCode.Enter,
        () => editor.trigger('keyboard', 'acceptSelectedSuggestion', {}),
        'suggestWidgetVisible'
      );

      editor.addCommand(
        monaco.KeyCode.Enter,
        () => {
          if (handleHtmlStyleBlockEnter(editor, monaco, tab, settings)) {
            return;
        }

        editor.trigger('keyboard', 'type', { text: '\n' });
      },
        '!suggestWidgetVisible'
      );

      editor.onKeyDown((event) => {
        if (
          event.keyCode !== monaco.KeyCode.Tab ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey
        ) {
          return;
        }

        if (expandExactExtensionSnippet(editor, monaco, tab.language)) {
          event.preventDefault();
          event.stopPropagation();
        }
      });

      editor.onDidChangeModelContent((event) => {
      if (activeLspContextRef.current) {
        const { bridge, relativePath, fileName } = activeLspContextRef.current;
        const text = editor.getModel()?.getValue() || '';
        if (editor.lspSyncTimeout) {
          window.clearTimeout(editor.lspSyncTimeout);
        }
        editor.lspSyncTimeout = window.setTimeout(() => {
          bridge.syncDocument({ relativePath, fileName, text }).catch(() => {});
        }, 300);
      }

      const nextIntelliSense = activeIntelliSenseRef.current;
      if (!nextIntelliSense?.providerType) {
        return;
      }

      if (!shouldUseManualSuggestTrigger(nextIntelliSense.providerType)) {
        return;
      }

      const shouldTriggerSuggest = event.changes.some((change) => {
        return isUserTypingSuggestTrigger(change.text);
      });

      if (!shouldTriggerSuggest) {
        return;
      }

      window.setTimeout(() => {
        editor.trigger('keyboard', 'editor.action.triggerSuggest', {});
      }, 0);
    });

    editor.onDidFocusEditorText(() => {
      onFocusEditor?.(editor, monaco, tab);
    });

    editor.onMouseDown((e) => {
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        const lineNumber = e.target.position.lineNumber;
        // Allow a tiny timeout so the user isn't clicking while it renders rapidly
        setTimeout(() => {
          onToggleBreakpoint?.(lineNumber);
        }, 10);
      }
    });

    onMount?.(editor, monaco);
  }

  React.useEffect(() => {
    activeIntelliSenseRef.current = intelliSense;
  }, [intelliSense]);

  React.useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const editor = editorRef.current;
    
    const newDecorations = breakpoints.map(bp => ({
      range: new monacoRef.current.Range(bp, 1, bp, 1),
      options: {
        isWholeLine: false,
        glyphMarginClassName: 'debug-breakpoint-glyph',
        stickiness: monacoRef.current.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      }
    }));
    
    breakpointDecorationsRef.current = editor.deltaDecorations(
      breakpointDecorationsRef.current,
      newDecorations
    );
  }, [breakpoints]);

  React.useEffect(() => {
    if (monacoRef.current && tab.language) {
      const monaco = monacoRef.current;
      registerLspCompletionProvider(monaco, tab.language, () => activeLspContextRef.current);
      registerLspFeatureProviders(monaco, tab.language, () => activeLspContextRef.current);
      if (intelliSense?.providerType !== 'lsp') {
        registerExtensionCompletionProvider(monaco, tab.language);
      } else {
        disposeExtensionCompletionProvider(tab.language);
      }
    }
  }, [intelliSense?.providerType, tab.language]);

  React.useEffect(() => {
    activeLspContextRef.current =
      intelliSense?.providerType === 'lsp' && lspBridge
        ? {
            bridge: lspBridge,
            languageId: tab.language,
            relativePath: tab.path === 'root' ? tab.name : tab.path,
            fileName: tab.name,
          }
        : null;
  }, [intelliSense?.providerType, lspBridge, tab.language, tab.name, tab.path]);

  React.useEffect(() => {
    const token = lspResolverTokenRef.current;
    const hasLiveLspContext = intelliSense?.providerType === 'lsp' && lspBridge && tab.language;

    if (hasLiveLspContext) {
      setLspContextResolver(tab.language, token, () => activeLspContextRef.current);
    } else if (tab.language) {
      setLspContextResolver(tab.language, token, null);
    }

    return () => {
      if (tab.language) {
        setLspContextResolver(tab.language, token, null);
      }
    };
  }, [intelliSense?.providerType, lspBridge, tab.language]);

  React.useEffect(() => {
    if (intelliSense?.providerType === 'lsp' && lspBridge && editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        lspBridge.syncDocument({
          relativePath: tab.path === 'root' ? tab.name : tab.path,
          fileName: tab.name,
          text: model.getValue(),
        }).catch(() => {});
      }
    }
  }, [intelliSense?.providerType, lspBridge, tab.id, tab.name, tab.path]);

  React.useEffect(() => {
    if (!lspBridge || !editorRef.current || !monacoRef.current || intelliSense?.providerType !== 'lsp') {
      return undefined;
    }

    const monaco = monacoRef.current;
    const editor = editorRef.current;

    if (typeof lspBridge.onDiagnostics === 'function') {
      const unsubscribe = lspBridge.onDiagnostics((params) => {
        const model = editor.getModel();
        if (!model) return;

        const currentUri = model.uri.toString();
        const lspUri = params.uri;
        if (currentUri !== lspUri && decodeURIComponent(currentUri) !== decodeURIComponent(lspUri)) {
          return;
        }

        const markers = (params.diagnostics || []).map((diag) => {
          const startLine = Number(diag.range?.start?.line || 0) + 1;
          const startChar = Number(diag.range?.start?.character || 0) + 1;
          const endLine = Number(diag.range?.end?.line || 0) + 1;
          const endChar = Number(diag.range?.end?.character || 0) + 1;

          let severity = monaco.MarkerSeverity.Info;
          if (diag.severity === 1) severity = monaco.MarkerSeverity.Error;
          else if (diag.severity === 2) severity = monaco.MarkerSeverity.Warning;
          else if (diag.severity === 3) severity = monaco.MarkerSeverity.Info;
          else if (diag.severity === 4) severity = monaco.MarkerSeverity.Hint;

          return {
            severity,
            startLineNumber: startLine,
            startColumn: startChar,
            endLineNumber: endLine,
            endColumn: endChar,
            message: diag.message || 'Error',
            source: diag.source || 'LSP',
          };
        });

        monaco.editor.setModelMarkers(model, 'lsp', markers);
      });

      return () => {
        unsubscribe();
        const model = editor.getModel();
        if (model) {
          monaco.editor.setModelMarkers(model, 'lsp', []);
        }
      };
    }
  }, [lspBridge, intelliSense?.providerType, tab.id]);

  const wordBasedSuggestions =
    intelliSense?.providerType === 'native'
      ? 'matchingDocuments'
      : intelliSense?.providerType === 'basic'
        ? 'currentDocument'
      : intelliSense?.providerType === 'lsp' && intelliSense?.available
        ? false
        : false;
  const editorOptions = React.useMemo(
    () => buildEditorOptions(settings, tab, wordBasedSuggestions),
    [settings, tab, wordBasedSuggestions]
  );

  // Cleanup editor resources on component unmount or tab change
  React.useEffect(() => {
    return () => {
      if (editorRef.current) {
        disposeEditorResources(editorRef.current);
      }
    };
  }, []);


  return (
    <div className={`editor-wrapper d-${MonacoEditorDisplay}`} style={monacoEditorStyle}>
      {isBinaryTab ? (
        <div className="binary-editor-surface">
          <div className="binary-editor-toolbar">
            <span className="binary-editor-label">
              {isExe ? 'Executable file' : 'Binary file'}
            </span>
            {isExe && (
              <button
                type="button"
                className="binary-editor-tab active"
                style={{ background: 'var(--accent-color)', color: '#fff', border: 'none', marginLeft: 'auto' }}
                onClick={handleRunExecutable}
              >
                <i className="fa-solid fa-play" style={{ marginRight: '6px' }}></i>
                Run Executable
              </button>
            )}
            <button
              type="button"
              className={`binary-editor-tab ${binaryViewMode === 'preview' ? 'active' : ''}`}
              disabled={!canPreviewBinary}
              onClick={() => setBinaryViewMode('preview')}
            >
              Preview
            </button>
            <button
              type="button"
              className={`binary-editor-tab ${binaryViewMode === 'raw' ? 'active' : ''}`}
              onClick={() => setBinaryViewMode('raw')}
            >
              Raw binary (base64)
            </button>
          </div>
          {binaryViewMode === 'preview' && canPreviewBinary ? (
            <div className="binary-preview-container">
              {binaryKind === 'image' ? (
                <img src={binaryPreviewUrl} alt={tab.name || 'image preview'} className="binary-preview-image" />
              ) : binaryKind === 'audio' ? (
                <audio controls src={binaryPreviewUrl} className="binary-preview-audio" />
              ) : binaryKind === 'video' ? (
                <video controls src={binaryPreviewUrl} className="binary-preview-video" />
              ) : (
                <iframe title={tab.name || 'PDF preview'} src={binaryPreviewUrl} className="binary-preview-pdf" />
              )}
            </div>
          ) : (
            <Editor
              height="100%"
              theme={settings?.theme?.active && settings.theme.active !== 'tilder-night' ? 'vs-dark' : 'tilder-night'}
                language="plaintext"
                value={tab.content}
                onChange={onChange}
                onMount={handleMount}
                options={{
                  ...editorOptions,
                  glyphMargin: false,
                  wordWrap: 'on',
                  minimap: { enabled: false },
                }}
            />
          )}
        </div>
      ) : (
        <Editor
          height="100%"
          theme={settings?.theme?.active && settings.theme.active !== 'tilder-night' ? 'vs-dark' : 'tilder-night'}
          language={tab.language}
            value={tab.content}
            onChange={onChange}
            onMount={handleMount}
            options={editorOptions}
          />
        )}
      </div>
  );
}

