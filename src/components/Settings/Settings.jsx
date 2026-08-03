import React, { useEffect, useMemo, useRef, useState } from 'react';
import defaultSettings, { mergeWithDefaultSettings } from './defaultSettings.js';

const SECTION_ICONS = {
    'text-editor': { icon: 'fa-solid fa-font', color: 'linear-gradient(135deg, #007AFF, #0051e5)' },
    'cursor-selection': { icon: 'fa-solid fa-i-cursor', color: 'linear-gradient(135deg, #5856D6, #413dcc)' },
    'layout-folding': { icon: 'fa-solid fa-layer-group', color: 'linear-gradient(135deg, #FF9500, #e57d00)' },
    'minimap-guides': { icon: 'fa-solid fa-map', color: 'linear-gradient(135deg, #34C759, #28a846)' },
    'editing': { icon: 'fa-solid fa-pen-to-square', color: 'linear-gradient(135deg, #007AFF, #0051e5)' },
    'formatting': { icon: 'fa-solid fa-align-left', color: 'linear-gradient(135deg, #AF52DE, #933cca)' },
    'files': { icon: 'fa-solid fa-file-code', color: 'linear-gradient(135deg, #FF2D55, #e01b3f)' },
    'suggestions-hover': { icon: 'fa-solid fa-lightbulb', color: 'linear-gradient(135deg, #FFCC00, #e5b300)' },
    'search-navigation': { icon: 'fa-solid fa-magnifying-glass', color: 'linear-gradient(135deg, #5AC8FA, #40b0e5)' },
    'explorer': { icon: 'fa-solid fa-folder-tree', color: 'linear-gradient(135deg, #007AFF, #0051e5)' },
    'breadcrumbs': { icon: 'fa-solid fa-bread-slice', color: 'linear-gradient(135deg, #8E8E93, #7a7a7a)' },
    'git': { icon: 'fa-brands fa-git-alt', color: 'linear-gradient(135deg, #FF3B30, #e52920)' },
    'scrolling': { icon: 'fa-solid fa-arrows-up-down', color: 'linear-gradient(135deg, #34C759, #28a846)' },
    'advanced-accessibility': { icon: 'fa-solid fa-universal-access', color: 'linear-gradient(135deg, #007AFF, #0051e5)' },
    'terminal-shell': { icon: 'fa-solid fa-terminal', color: 'linear-gradient(135deg, #1C1C1E, #000000)' },
    'theme': { icon: 'fa-solid fa-palette', color: 'linear-gradient(135deg, #AF52DE, #933cca)' },
    'performance-pro': { icon: 'fa-solid fa-bolt', color: 'linear-gradient(135deg, #FFCC00, #e5b300)' },
    'debugger-advanced': { icon: 'fa-solid fa-bug', color: 'linear-gradient(135deg, #FF3B30, #e52920)' },
    'zen-mode': { icon: 'fa-solid fa-leaf', color: 'linear-gradient(135deg, #34C759, #28a846)' },
    'accessibility': { icon: 'fa-solid fa-eye', color: 'linear-gradient(135deg, #007AFF, #0051e5)' },
};

const SECTION_DEFINITIONS = [
    {
        id: 'text-editor',
        title: 'Text Editor',
        description: 'Core editor typography, line numbers, and general editor behavior.',
        items: [
            {
                id: 'fontSize',
                path: 'fontSize',
                label: 'Font Size',
                type: 'number',
                min: 8,
                step: 1,
                description: 'Controls the size of text in the editor in pixels.',
                keywords: ['editor font size', 'text size']
            },
            {
                id: 'fontFamily',
                path: 'fontFamily',
                label: 'Font Family',
                type: 'text',
                description: 'Sets the font family used to render code in the editor.',
                keywords: ['font stack', 'editor font']
            },
            {
                id: 'fontWeight',
                path: 'fontWeight',
                label: 'Font Weight',
                type: 'select',
                description: 'Controls how bold or light the editor font appears.',
                options: [
                    { value: 'normal', label: 'Normal' },
                    { value: 'bold', label: 'Bold' },
                    { value: '300', label: '300' },
                    { value: '400', label: '400' },
                    { value: '600', label: '600' }
                ]
            },
            {
                id: 'lineHeight',
                path: 'lineHeight',
                label: 'Line Height',
                type: 'number',
                min: 0,
                step: 1,
                description: 'Controls the vertical spacing between lines of code.'
            },
            {
                id: 'letterSpacing',
                path: 'letterSpacing',
                label: 'Letter Spacing',
                type: 'number',
                step: 0.1,
                description: 'Adjusts the spacing between individual characters.'
            },
            {
                id: 'fontLigatures',
                path: 'fontLigatures',
                label: 'Font Ligatures',
                type: 'boolean',
                description: 'Enables ligatures when the selected font supports them.',
                keywords: ['ligature']
            },
            {
                id: 'lineNumbers',
                path: 'lineNumbers',
                label: 'Line Numbers',
                type: 'select',
                description: 'Controls how line numbers are displayed in the gutter.',
                options: [
                    { value: 'on', label: 'On' },
                    { value: 'off', label: 'Off' },
                    { value: 'relative', label: 'Relative' },
                    { value: 'interval', label: 'Interval' }
                ]
            },
            {
                id: 'lineNumbersMinChars',
                path: 'lineNumbersMinChars',
                label: 'Line Numbers Minimum Characters',
                type: 'number',
                min: 1,
                step: 1,
                description: 'Reserves space in the gutter for line numbers.'
            },
            {
                id: 'glyphMargin',
                path: 'glyphMargin',
                label: 'Glyph Margin',
                type: 'boolean',
                description: 'Shows the glyph margin used by breakpoints and markers in the editor gutter.'
            },
            {
                id: 'readOnly',
                path: 'readOnly',
                label: 'Read Only',
                type: 'boolean',
                description: 'Prevents edits in the current editor surface.',
                keywords: ['locked']
            },
            {
                id: 'automaticLayout',
                path: 'automaticLayout',
                label: 'Automatic Layout',
                type: 'boolean',
                description: 'Automatically remeasures and relayouts the editor when its container changes size.',
                keywords: ['resize', 'responsive editor']
            },
            {
                id: 'breadcrumbsEnabled',
                path: 'breadcrumbs.enabled',
                label: 'Breadcrumbs Enabled',
                type: 'boolean',
                description: 'Shows the breadcrumb path bar above the editor.'
            },
            {
                id: 'smoothScrolling',
                path: 'smoothScrolling',
                label: 'Smooth Scrolling',
                type: 'boolean',
                description: 'Enable that the editor animates scrolling to a position.'
            },
            {
                id: 'fastScrollSensitivity',
                path: 'fastScrollSensitivity',
                label: 'Fast Scroll Sensitivity',
                type: 'number',
                min: 1,
                max: 20,
                description: 'Scrolling speed multiplier when pressing Alt.'
            },
            {
                id: 'renderWhitespace',
                path: 'renderWhitespace',
                label: 'Render Whitespace',
                type: 'select',
                options: [
                    { value: 'none', label: 'None' },
                    { value: 'boundary', label: 'Boundary' },
                    { value: 'selection', label: 'Selection' },
                    { value: 'trailing', label: 'Trailing' },
                    { value: 'all', label: 'All' }
                ],
                description: 'Enable rendering of whitespace characters.'
            },
            {
                id: 'renderControlCharacters',
                path: 'renderControlCharacters',
                label: 'Render Control Characters',
                type: 'boolean',
                description: 'Enable rendering of control characters.'
            },
            {
                id: 'renderLineHighlight',
                path: 'renderLineHighlight',
                label: 'Render Line Highlight',
                type: 'select',
                options: [
                    { value: 'none', label: 'None' },
                    { value: 'gutter', label: 'Gutter' },
                    { value: 'line', label: 'Line' },
                    { value: 'all', label: 'All' }
                ],
                description: 'Enable rendering of current line highlight.'
            },
            {
                id: 'codeLens',
                path: 'codeLens',
                label: 'Code Lens',
                type: 'boolean',
                description: 'Enable code lens decorations.'
            },
            {
                id: 'inlayHints',
                path: 'inlayHints.enabled',
                label: 'Inlay Hints',
                type: 'select',
                options: [
                    { value: 'on', label: 'On' },
                    { value: 'off', label: 'Off' },
                    { value: 'onUnlessPressed', label: 'On Unless Pressed' }
                ],
                description: 'Enables the display of inlay hints in the editor.'
            },
            {
                id: 'hoverEnabled',
                path: 'hover.enabled',
                label: 'Hover Enabled',
                type: 'boolean',
                description: 'Controls whether the hover is shown.'
            },
            {
                id: 'hoverDelay',
                path: 'hover.delay',
                label: 'Hover Delay',
                type: 'number',
                min: 0,
                max: 5000,
                description: 'Controls the delay in milliseconds after which the hover is shown.'
            },
            {
                id: 'matchBrackets',
                path: 'matchBrackets',
                label: 'Match Brackets',
                type: 'select',
                options: [
                    { value: 'never', label: 'Never' },
                    { value: 'near', label: 'Near' },
                    { value: 'always', label: 'Always' }
                ],
                description: 'Highlight matching brackets.'
            }
        ]
    },
    {
        id: 'cursor-selection',
        title: 'Cursor & Selection',
        description: 'Cursor shape, motion, multi-cursor behavior, and selection presentation.',
        items: [
            {
                id: 'cursorStyle',
                path: 'cursorStyle',
                label: 'Cursor Style',
                type: 'select',
                description: 'Controls the shape of the text cursor.',
                options: [
                    { value: 'line', label: 'Line' },
                    { value: 'block', label: 'Block' },
                    { value: 'underline', label: 'Underline' },
                    { value: 'line-thin', label: 'Thin Line' },
                    { value: 'block-outline', label: 'Block Outline' },
                    { value: 'underline-thin', label: 'Thin Underline' }
                ]
            },
            {
                id: 'cursorWidth',
                path: 'cursorWidth',
                label: 'Cursor Width',
                type: 'number',
                min: 1,
                step: 1,
                description: 'Controls the thickness of the line cursor.'
            },
            {
                id: 'cursorBlinking',
                path: 'cursorBlinking',
                label: 'Cursor Blinking',
                type: 'select',
                description: 'Controls the animation style used by the cursor.',
                options: [
                    { value: 'blink', label: 'Blink' },
                    { value: 'smooth', label: 'Smooth' },
                    { value: 'phase', label: 'Phase' },
                    { value: 'expand', label: 'Expand' },
                    { value: 'solid', label: 'Solid' }
                ]
            },
            {
                id: 'cursorSmoothCaretAnimation',
                path: 'cursorSmoothCaretAnimation',
                label: 'Smooth Caret Animation',
                type: 'boolean',
                description: 'Animates the caret smoothly when it moves.',
                keywords: ['caret']
            },
            {
                id: 'cursorSurroundingLines',
                path: 'cursorSurroundingLines',
                label: 'Cursor Surrounding Lines',
                type: 'number',
                min: 0,
                step: 1,
                description: 'Keeps extra visible lines above and below the cursor while scrolling.'
            },
            {
                id: 'cursorSurroundingLinesStyle',
                path: 'cursorSurroundingLinesStyle',
                label: 'Cursor Surrounding Lines Style',
                type: 'select',
                description: 'Controls how the surrounding-line setting behaves near file edges.',
                options: [
                    { value: 'default', label: 'Default' },
                    { value: 'all', label: 'All' }
                ]
            },
            {
                id: 'multiCursorModifier',
                path: 'multiCursorModifier',
                label: 'Multi Cursor Modifier',
                type: 'select',
                description: 'Chooses the keyboard modifier used to add multiple cursors.',
                options: [
                    { value: 'alt', label: 'Alt' },
                    { value: 'ctrlCmd', label: 'Ctrl/Cmd' }
                ]
            },
            {
                id: 'multiCursorMergeOverlapping',
                path: 'multiCursorMergeOverlapping',
                label: 'Merge Overlapping Multi-Cursors',
                type: 'boolean',
                description: 'Merges cursors when they overlap instead of keeping duplicates.'
            },
            {
                id: 'selectOnLineNumbers',
                path: 'selectOnLineNumbers',
                label: 'Select On Line Numbers',
                type: 'boolean',
                description: 'Allows full-line selection by clicking the line number gutter.'
            },
            {
                id: 'roundedSelection',
                path: 'roundedSelection',
                label: 'Rounded Selection',
                type: 'boolean',
                description: 'Uses rounded corners for text selections.'
            },
            {
                id: 'columnSelection',
                path: 'columnSelection',
                label: 'Column Selection',
                type: 'boolean',
                description: 'Enables column selection mode inside the editor.'
            },
            {
                id: 'emptySelectionClipboard',
                path: 'emptySelectionClipboard',
                label: 'Empty Selection Clipboard',
                type: 'boolean',
                description: 'Copies the current line when there is no active selection.'
            },
            {
                id: 'selectionHighlight',
                path: 'selectionHighlight',
                label: 'Selection Highlight',
                type: 'boolean',
                description: 'Highlights additional matches of the current selection in the editor.'
            },
            {
                id: 'occurrencesHighlight',
                path: 'occurrencesHighlight',
                label: 'Occurrences Highlight',
                type: 'boolean',
                description: 'Highlights repeated symbol occurrences near the current cursor position.'
            },
            {
                id: 'multiCursorPaste',
                path: 'multiCursorPaste',
                label: 'Multi Cursor Paste',
                type: 'select',
                description: 'Controls pasting when the line count of the pasted text matches the cursor count.',
                options: [
                    { value: 'spread', label: 'Spread' },
                    { value: 'full', label: 'Full' }
                ]
            },
            {
                id: 'accessibilitySupport',
                path: 'accessibilitySupport',
                label: 'Accessibility Support',
                type: 'select',
                description: 'Controls whether the editor should run in a mode where it is optimized for screen readers.',
                options: [
                    { value: 'auto', label: 'Auto' },
                    { value: 'off', label: 'Off' },
                    { value: 'on', label: 'On' }
                ]
            },
            {
                id: 'copyWithSyntaxHighlighting',
                path: 'copyWithSyntaxHighlighting',
                label: 'Copy With Syntax Highlighting',
                type: 'boolean',
                description: 'Controls whether syntax highlighting is copied into the clipboard.'
            },
            {
                id: 'selectionClipboard',
                path: 'selectionClipboard',
                label: 'Selection Clipboard',
                type: 'boolean',
                description: 'Controls whether the Linux primary clipboard should be supported.'
            },
            {
                id: 'wordSeparators',
                path: 'wordSeparators',
                label: 'Word Separators',
                type: 'text',
                description: 'Characters that will be used as word separators when doing word related navigations or operations.'
            },
            {
                id: 'links',
                path: 'links',
                label: 'Clickable Links',
                type: 'boolean',
                description: 'Controls whether the editor should detect links and make them clickable.'
            },
            {
                id: 'colorDecorators',
                path: 'colorDecorators',
                label: 'Color Decorators',
                type: 'boolean',
                description: 'Controls whether the editor should render the inline color decorators and color picker.'
            },
            {
                id: 'dragAndDrop',
                path: 'dragAndDrop',
                label: 'Drag and Drop',
                type: 'boolean',
                description: 'Controls whether the editor should allow moving selections via drag and drop.'
            },
            {
                id: 'useTabStops',
                path: 'useTabStops',
                label: 'Use Tab Stops',
                type: 'boolean',
                description: 'Inserting and deleting whitespace follows tab stops.'
            }
        ]
    },
    {
        id: 'layout-folding',
        title: 'Layout & Folding',
        description: 'Wrapping, rulers, folding, and how content is laid out on screen.',
        items: [
            {
                id: 'wordWrap',
                path: 'wordWrap',
                label: 'Word Wrap',
                type: 'select',
                description: 'Controls how long lines wrap in the editor.',
                options: [
                    { value: 'off', label: 'Off' },
                    { value: 'on', label: 'On' },
                    { value: 'wordWrapColumn', label: 'Word Wrap Column' },
                    { value: 'bounded', label: 'Bounded' }
                ]
            },
            {
                id: 'wordWrapColumn',
                path: 'wordWrapColumn',
                label: 'Word Wrap Column',
                type: 'number',
                min: 1,
                step: 1,
                description: 'Defines the column used when wrapping at a specific width.'
            },
            {
                id: 'wordWrapOverride1',
                path: 'wordWrapOverride1',
                label: 'Word Wrap Override 1',
                type: 'select',
                description: 'Overrides editor word wrap for the first level of embedded editors.',
                options: [
                    { value: 'inherit', label: 'Inherit' },
                    { value: 'off', label: 'Off' },
                    { value: 'on', label: 'On' }
                ]
            },
            {
                id: 'wordWrapOverride2',
                path: 'wordWrapOverride2',
                label: 'Word Wrap Override 2',
                type: 'select',
                description: 'Overrides editor word wrap for deeper embedded editors.',
                options: [
                    { value: 'inherit', label: 'Inherit' },
                    { value: 'off', label: 'Off' },
                    { value: 'on', label: 'On' }
                ]
            },
            {
                id: 'folding',
                path: 'folding',
                label: 'Folding',
                type: 'boolean',
                description: 'Enables code folding controls in the gutter.'
            },
            {
                id: 'foldingStrategy',
                path: 'foldingStrategy',
                label: 'Folding Strategy',
                type: 'select',
                description: 'Controls how folding ranges are computed.',
                options: [
                    { value: 'auto', label: 'Auto' },
                    { value: 'indentation', label: 'Indentation' }
                ]
            },
            {
                id: 'foldingHighlight',
                path: 'foldingHighlight',
                label: 'Folding Highlight',
                type: 'boolean',
                description: 'Highlights the folded region’s line in the gutter.'
            },
            {
                id: 'rulers',
                path: 'rulers',
                label: 'Rulers',
                type: 'csv-number-list',
                description: 'Comma-separated columns where vertical ruler guides should appear.',
                placeholder: '80, 100, 120',
                keywords: ['column rulers', 'guides']
            }
        ]
    },
    {
        id: 'minimap-guides',
        title: 'Minimap & Guides',
        description: 'Visual guides, minimap behavior, and line rendering details.',
        items: [
            {
                id: 'minimapEnabled',
                path: 'minimap.enabled',
                label: 'Minimap Enabled',
                type: 'boolean',
                description: 'Shows the minimap preview of the current file.'
            },
            {
                id: 'minimapSide',
                path: 'minimap.side',
                label: 'Minimap Side',
                type: 'select',
                description: 'Chooses which side of the editor the minimap appears on.',
                options: [
                    { value: 'right', label: 'Right' },
                    { value: 'left', label: 'Left' }
                ]
            },
            {
                id: 'minimapSize',
                path: 'minimap.size',
                label: 'Minimap Size',
                type: 'select',
                description: 'Controls how the minimap scales its contents.',
                options: [
                    { value: 'proportional', label: 'Proportional' },
                    { value: 'fill', label: 'Fill' },
                    { value: 'fit', label: 'Fit' }
                ]
            },
            {
                id: 'minimapShowSlider',
                path: 'minimap.showSlider',
                label: 'Minimap Show Slider',
                type: 'select',
                description: 'Controls when the minimap slider is visible.',
                options: [
                    { value: 'mouseover', label: 'On Hover' },
                    { value: 'always', label: 'Always' }
                ]
            },
            {
                id: 'minimapRenderCharacters',
                path: 'minimap.renderCharacters',
                label: 'Minimap Render Characters',
                type: 'boolean',
                description: 'Renders actual characters in the minimap instead of simple blocks.'
            },
            {
                id: 'minimapMaxColumn',
                path: 'minimap.maxColumn',
                label: 'Minimap Maximum Column',
                type: 'number',
                min: 1,
                step: 1,
                description: 'Stops rendering the minimap past this column.'
            },
            {
                id: 'renderWhitespace',
                path: 'renderWhitespace',
                label: 'Render Whitespace',
                type: 'select',
                description: 'Controls when whitespace characters are shown.',
                options: [
                    { value: 'none', label: 'None' },
                    { value: 'boundary', label: 'Boundary' },
                    { value: 'selection', label: 'Selection' },
                    { value: 'trailing', label: 'Trailing' },
                    { value: 'all', label: 'All' }
                ]
            },
            {
                id: 'renderControlCharacters',
                path: 'renderControlCharacters',
                label: 'Render Control Characters',
                type: 'boolean',
                description: 'Shows control characters in the editor.'
            },
            {
                id: 'renderLineHighlight',
                path: 'renderLineHighlight',
                label: 'Render Line Highlight',
                type: 'select',
                description: 'Controls how the active line is highlighted.',
                options: [
                    { value: 'none', label: 'None' },
                    { value: 'gutter', label: 'Gutter' },
                    { value: 'line', label: 'Line' },
                    { value: 'all', label: 'All' }
                ]
            },
            {
                id: 'renderLineHighlightOnlyWhenFocus',
                path: 'renderLineHighlightOnlyWhenFocus',
                label: 'Render Line Highlight Only When Focus',
                type: 'boolean',
                description: 'Shows the active line highlight only when the editor has focus.'
            },
            {
                id: 'renderIndentGuides',
                path: 'renderIndentGuides',
                label: 'Render Indent Guides',
                type: 'boolean',
                description: 'Shows vertical indentation guides.'
            },
            {
                id: 'renderFinalNewline',
                path: 'renderFinalNewline',
                label: 'Render Final Newline',
                type: 'boolean',
                description: 'Displays the final newline glyph at the end of the file.'
            },
            {
                id: 'renderValidationDecorations',
                path: 'renderValidationDecorations',
                label: 'Render Validation Decorations',
                type: 'select',
                description: 'Controls when error and warning decorations are shown.',
                options: [
                    { value: 'editable', label: 'Editable' },
                    { value: 'on', label: 'On' },
                    { value: 'off', label: 'Off' }
                ]
            },
            {
                id: 'bracketPairColorizationEnabled',
                path: 'bracketPairColorization.enabled',
                label: 'Bracket Pair Colorization',
                type: 'boolean',
                description: 'Colors matching bracket pairs to improve readability.'
            },
            {
                id: 'guidesIndentation',
                path: 'guides.indentation',
                label: 'Indentation Guides',
                type: 'boolean',
                description: 'Enables indentation guides through the guides setting object.'
            },
            {
                id: 'guidesBracketPairs',
                path: 'guides.bracketPairs',
                label: 'Bracket Pair Guides',
                type: 'boolean',
                description: 'Highlights bracket pair guides in the editor.'
            },
            {
                id: 'colorDecorators',
                path: 'colorDecorators',
                label: 'Color Decorators',
                type: 'boolean',
                description: 'Shows inline color previews for color values in code.'
            },
            {
                id: 'codeLens',
                path: 'codeLens',
                label: 'Code Lens',
                type: 'boolean',
                description: 'Enables inline CodeLens annotations above code.'
            },
            {
                id: 'lightbulbEnabled',
                path: 'lightbulb.enabled',
                label: 'Lightbulb Enabled',
                type: 'boolean',
                description: 'Shows the lightbulb indicator when code actions are available.'
            },
            {
                id: 'parameterHintsEnabled',
                path: 'parameterHints.enabled',
                label: 'Parameter Hints Enabled',
                type: 'boolean',
                description: 'Shows inline parameter hints while typing function calls.'
            },
            {
                id: 'overviewRulerBorder',
                path: 'overviewRulerBorder',
                label: 'Overview Ruler Border',
                type: 'boolean',
                description: 'Shows a border around the overview ruler area.'
            },
            {
                id: 'overviewRulerLanes',
                path: 'overviewRulerLanes',
                label: 'Overview Ruler Lanes',
                type: 'number',
                min: 0,
                max: 3,
                step: 1,
                description: 'Controls how many lanes are used in the overview ruler.'
            },
            {
                id: 'hideCursorInOverviewRuler',
                path: 'hideCursorInOverviewRuler',
                label: 'Hide Cursor In Overview Ruler',
                type: 'boolean',
                description: 'Hides the cursor marker from the overview ruler.'
            }
        ]
    },
    {
        id: 'editing',
        title: 'Editing',
        description: 'Indentation, auto-close behavior, and direct editing ergonomics.',
        items: [
            {
                id: 'tabSize',
                path: 'tabSize',
                label: 'Tab Size',
                type: 'number',
                min: 1,
                step: 1,
                description: 'Number of spaces a tab is equal to.'
            },
            {
                id: 'insertSpaces',
                path: 'insertSpaces',
                label: 'Insert Spaces',
                type: 'boolean',
                description: 'Uses spaces instead of hard tab characters when indenting.'
            },
            {
                id: 'detectIndentation',
                path: 'detectIndentation',
                label: 'Detect Indentation',
                type: 'boolean',
                description: 'Automatically guesses indentation settings from the file contents.'
            },
            {
                id: 'trimAutoWhitespace',
                path: 'trimAutoWhitespace',
                label: 'Trim Auto Whitespace',
                type: 'boolean',
                description: 'Removes trailing whitespace inserted automatically by the editor.'
            },
            {
                id: 'autoClosingBrackets',
                path: 'autoClosingBrackets',
                label: 'Auto Closing Brackets',
                type: 'select',
                description: 'Controls when brackets should be automatically closed.',
                options: [
                    { value: 'always', label: 'Always' },
                    { value: 'languageDefined', label: 'Language Defined' },
                    { value: 'beforeWhitespace', label: 'Before Whitespace' },
                    { value: 'never', label: 'Never' }
                ]
            },
            {
                id: 'autoClosingQuotes',
                path: 'autoClosingQuotes',
                label: 'Auto Closing Quotes',
                type: 'select',
                description: 'Controls when quotes should be automatically closed.',
                options: [
                    { value: 'always', label: 'Always' },
                    { value: 'languageDefined', label: 'Language Defined' },
                    { value: 'beforeWhitespace', label: 'Before Whitespace' },
                    { value: 'never', label: 'Never' }
                ]
            },
            {
                id: 'autoClosingDelete',
                path: 'autoClosingDelete',
                label: 'Auto Closing Delete',
                type: 'select',
                description: 'Controls how paired characters are deleted.',
                options: [
                    { value: 'always', label: 'Always' },
                    { value: 'auto', label: 'Auto' },
                    { value: 'never', label: 'Never' }
                ]
            },
            {
                id: 'autoClosingOvertype',
                path: 'autoClosingOvertype',
                label: 'Auto Closing Overtype',
                type: 'select',
                description: 'Controls how paired characters are overtyped.',
                options: [
                    { value: 'always', label: 'Always' },
                    { value: 'auto', label: 'Auto' },
                    { value: 'never', label: 'Never' }
                ]
            },
            {
                id: 'autoIndent',
                path: 'autoIndent',
                label: 'Auto Indent',
                type: 'select',
                description: 'Controls the editor auto-indentation strategy.',
                options: [
                    { value: 'none', label: 'None' },
                    { value: 'keep', label: 'Keep' },
                    { value: 'brackets', label: 'Brackets' },
                    { value: 'advanced', label: 'Advanced' },
                    { value: 'full', label: 'Full' }
                ]
            },
            {
                id: 'dragAndDrop',
                path: 'dragAndDrop',
                label: 'Drag And Drop',
                type: 'boolean',
                description: 'Allows selected text to be moved by dragging it.'
            },
            {
                id: 'copyWithSyntaxHighlighting',
                path: 'copyWithSyntaxHighlighting',
                label: 'Copy With Syntax Highlighting',
                type: 'boolean',
                description: 'Preserves syntax highlighting metadata when copying code.'
            }
        ]
    },
    {
        id: 'formatting',
        title: 'Formatting',
        description: 'Automatic formatting behavior and save-time code actions.',
        items: [
            {
                id: 'formatOnSave',
                path: 'formatOnSave',
                label: 'Format On Save',
                type: 'boolean',
                description: 'Formats the file automatically whenever it is saved.'
            },
            {
                id: 'formatOnType',
                path: 'formatOnType',
                label: 'Format On Type',
                type: 'boolean',
                description: 'Formats code as you type based on the current language provider.'
            },
            {
                id: 'formatOnPaste',
                path: 'formatOnPaste',
                label: 'Format On Paste',
                type: 'boolean',
                description: 'Formats pasted content automatically.'
            },
            {
                id: 'codeActionsOnSave',
                path: 'codeActionsOnSave',
                label: 'Code Actions On Save',
                type: 'json',
                description: 'JSON object describing save-time code actions to run.',
                placeholder: '{\n  "source.fixAll": "explicit"\n}'
            }
        ]
    },
    {
        id: 'files',
        title: 'Files',
        description: 'Auto save behavior and file system preferences.',
        items: [
            {
                id: 'autoSave',
                path: 'files.autoSave',
                label: 'Auto Save',
                type: 'select',
                description: 'Controls auto save of dirty files.',
                options: [
                    { value: 'off', label: 'Off' },
                    { value: 'afterDelay', label: 'After Delay' },
                    { value: 'onFocusChange', label: 'On Focus Change' },
                    { value: 'onWindowChange', label: 'On Window Change' }
                ]
            },
            {
                id: 'autoSaveDelay',
                path: 'files.autoSaveDelay',
                label: 'Auto Save Delay',
                type: 'number',
                min: 0,
                step: 100,
                description: 'Controls the delay in ms after which a dirty file is saved automatically. Only applies when Auto Save is set to "After Delay".'
            },
            {
                id: 'confirmDelete',
                path: 'explorer.confirmDelete',
                label: 'Confirm File Deletion',
                type: 'boolean',
                description: 'Show a confirmation dialog before deleting files or folders.'
            },
            {
                id: 'compactFolders',
                path: 'explorer.compactFolders',
                label: 'Compact Folders',
                type: 'boolean',
                description: 'Render single child folders in a compact form.'
            },
            {
                id: 'autoReveal',
                path: 'explorer.autoReveal',
                label: 'Auto Reveal',
                type: 'boolean',
                description: 'Automatically reveal and select active file in the explorer.'
            }
        ]
    },
    {
        id: 'suggestions-hover',
        title: 'Suggestions & Hover',
        description: 'IntelliSense suggestions, hover cards, and inline assistive UI.',
        items: [
            {
                id: 'quickSuggestions',
                path: 'quickSuggestions',
                label: 'Quick Suggestions',
                type: 'boolean',
                description: 'Shows IntelliSense suggestions while typing.'
            },
            {
                id: 'quickSuggestionsDelay',
                path: 'quickSuggestionsDelay',
                label: 'Quick Suggestions Delay',
                type: 'number',
                min: 0,
                step: 1,
                description: 'Delay in milliseconds before suggestions appear.'
            },
            {
                id: 'suggestOnTriggerCharacters',
                path: 'suggestOnTriggerCharacters',
                label: 'Suggest On Trigger Characters',
                type: 'boolean',
                description: 'Shows suggestions when typing trigger characters like a period.'
            },
            {
                id: 'acceptSuggestionOnEnter',
                path: 'acceptSuggestionOnEnter',
                label: 'Accept Suggestion On Enter',
                type: 'select',
                description: 'Controls whether pressing Enter accepts the selected suggestion.',
                options: [
                    { value: 'on', label: 'On' },
                    { value: 'smart', label: 'Smart' },
                    { value: 'off', label: 'Off' }
                ]
            },
            {
                id: 'suggestSelection',
                path: 'suggestSelection',
                label: 'Suggest Selection',
                type: 'select',
                description: 'Determines which suggestion is preselected by default.',
                options: [
                    { value: 'recentlyUsed', label: 'Recently Used' },
                    { value: 'recentlyUsedByPrefix', label: 'Recently Used By Prefix' },
                    { value: 'first', label: 'First' }
                ]
            },
            {
                id: 'snippetSuggestions',
                path: 'snippetSuggestions',
                label: 'Snippet Suggestions',
                type: 'select',
                description: 'Controls where snippets appear in the suggestion list.',
                options: [
                    { value: 'top', label: 'Top' },
                    { value: 'bottom', label: 'Bottom' },
                    { value: 'inline', label: 'Inline' },
                    { value: 'none', label: 'None' }
                ]
            },
            {
                id: 'tabCompletion',
                path: 'tabCompletion',
                label: 'Tab Completion',
                type: 'select',
                description: 'Enables accepting suggestions or snippets with the Tab key.',
                options: [
                    { value: 'off', label: 'Off' },
                    { value: 'on', label: 'On' },
                    { value: 'onlySnippets', label: 'Only Snippets' }
                ]
            },
            {
                id: 'suggestFontSize',
                path: 'suggestFontSize',
                label: 'Suggest Font Size',
                type: 'number',
                min: 0,
                step: 1,
                description: 'Overrides the font size used in the suggestions widget.'
            },
            {
                id: 'suggestLineHeight',
                path: 'suggestLineHeight',
                label: 'Suggest Line Height',
                type: 'number',
                min: 0,
                step: 1,
                description: 'Overrides the line height used in the suggestions widget.'
            },
            {
                id: 'inlineSuggestEnabled',
                path: 'inlineSuggest.enabled',
                label: 'Inline Suggest Enabled',
                type: 'boolean',
                description: 'Shows inline ghost-text suggestions in the editor.'
            },
            {
                id: 'hoverEnabled',
                path: 'hover.enabled',
                label: 'Hover Enabled',
                type: 'boolean',
                description: 'Shows hover tooltips and symbol information.'
            },
            {
                id: 'hoverDelay',
                path: 'hover.delay',
                label: 'Hover Delay',
                type: 'number',
                min: 0,
                step: 50,
                description: 'Delay in milliseconds before hover information appears.'
            },
            {
                id: 'links',
                path: 'links',
                label: 'Links',
                type: 'boolean',
                description: 'Detects and activates clickable links inside the editor.'
            }
        ]
    },
    {
        id: 'search-navigation',
        title: 'Search & Navigation',
        description: 'Find behavior, matching, and editor interaction helpers.',
        items: [
            {
                id: 'findCursorMoveOnType',
                path: 'find.cursorMoveOnType',
                label: 'Find Cursor Move On Type',
                type: 'boolean',
                description: 'Moves to the next find match while typing in the find input.'
            },
            {
                id: 'findAutoFindInSelection',
                path: 'find.autoFindInSelection',
                label: 'Find Auto Find In Selection',
                type: 'select',
                description: 'Determines when find should search within the current selection.',
                options: [
                    { value: 'never', label: 'Never' },
                    { value: 'always', label: 'Always' },
                    { value: 'multiline', label: 'Multiline' }
                ]
            },
            {
                id: 'findSeedSearchStringFromSelection',
                path: 'find.seedSearchStringFromSelection',
                label: 'Find Seed Search String From Selection',
                type: 'boolean',
                description: 'Seeds the find input from the current selection.'
            },
            {
                id: 'matchBrackets',
                path: 'matchBrackets',
                label: 'Match Brackets',
                type: 'select',
                description: 'Controls how matching brackets are highlighted.',
                options: [
                    { value: 'always', label: 'Always' },
                    { value: 'near', label: 'Near Cursor' },
                    { value: 'never', label: 'Never' }
                ]
            },
            {
                id: 'contextmenu',
                path: 'contextmenu',
                label: 'Context Menu',
                type: 'boolean',
                description: 'Enables the editor context menu on right click.'
            },
            {
                id: 'definitionLinkOpensInPeek',
                path: 'definitionLinkOpensInPeek',
                label: 'Definition Link Opens In Peek',
                type: 'boolean',
                description: 'Opens definition links in peek view instead of navigating away directly.'
            }
        ]
    },
    {
        id: 'explorer',
        title: 'File Explorer',
        description: 'File tree behavior and exclude patterns.',
        items: [
            {
                id: 'explorerCompactFolders',
                path: 'explorer.compactFolders',
                label: 'Compact Folders',
                type: 'boolean',
                description: 'Groups empty intermediate directories into a single line.'
            },
            {
                id: 'explorerAutoReveal',
                path: 'explorer.autoReveal',
                label: 'Auto Reveal',
                type: 'boolean',
                description: 'Automatically reveals and selects the active file in the explorer.'
            }
        ]
    },
    {
        id: 'breadcrumbs',
        title: 'Breadcrumbs',
        description: 'File path and symbol hierarchy navigation.',
        items: [
            {
                id: 'breadcrumbsEnabled',
                path: 'breadcrumbs.enabled',
                label: 'Breadcrumbs: Enabled',
                type: 'boolean',
                description: 'Shows navigation breadcrumbs at the top of the editor.'
            }
        ]
    },
    {
        id: 'git',
        title: 'Git & Source Control',
        description: 'Integration with git repositories and decorations.',
        items: [
            {
                id: 'gitEnabled',
                path: 'git.enabled',
                label: 'Git Enabled',
                type: 'boolean',
                description: 'Enables built-in Git support.'
            },
            {
                id: 'gitAutofetch',
                path: 'git.autofetch',
                label: 'Git Auto Fetch',
                type: 'boolean',
                description: 'Automatically fetches changes from the remote server.'
            }
        ]
    },
    {
        id: 'scrolling',
        title: 'Scrolling',
        description: 'Mouse wheel, viewport sensitivity, and end-of-file scrolling behavior.',
        items: [
            {
                id: 'scrollBeyondLastLine',
                path: 'scrollBeyondLastLine',
                label: 'Scroll Beyond Last Line',
                type: 'boolean',
                description: 'Allows scrolling past the last line of the file.'
            },
            {
                id: 'scrollBeyondLastColumn',
                path: 'scrollBeyondLastColumn',
                label: 'Scroll Beyond Last Column',
                type: 'number',
                min: 0,
                step: 1,
                description: 'Allows horizontal scrolling beyond the end of the longest line.'
            },
            {
                id: 'smoothScrolling',
                path: 'smoothScrolling',
                label: 'Smooth Scrolling',
                type: 'boolean',
                description: 'Animates editor scrolling smoothly.'
            },
            {
                id: 'mouseWheelScrollSensitivity',
                path: 'mouseWheelScrollSensitivity',
                label: 'Mouse Wheel Scroll Sensitivity',
                type: 'number',
                min: 1,
                step: 1,
                description: 'Adjusts how much scrolling happens per wheel step.'
            },
            {
                id: 'fastScrollSensitivity',
                path: 'fastScrollSensitivity',
                label: 'Fast Scroll Sensitivity',
                type: 'number',
                min: 1,
                step: 1,
                description: 'Adjusts fast scrolling when the modifier key is held.'
            },
            {
                id: 'mouseWheelZoom',
                path: 'mouseWheelZoom',
                label: 'Mouse Wheel Zoom',
                type: 'boolean',
                description: 'Allows editor zoom with the mouse wheel and Ctrl.'
            },
            {
                id: 'scrollbarVertical',
                path: 'scrollbar.vertical',
                label: 'Scrollbar Vertical',
                type: 'select',
                description: 'Controls when the vertical scrollbar is shown.',
                options: [
                    { value: 'auto', label: 'Auto' },
                    { value: 'visible', label: 'Visible' },
                    { value: 'hidden', label: 'Hidden' }
                ]
            },
            {
                id: 'scrollbarHorizontal',
                path: 'scrollbar.horizontal',
                label: 'Scrollbar Horizontal',
                type: 'select',
                description: 'Controls when the horizontal scrollbar is shown.',
                options: [
                    { value: 'auto', label: 'Auto' },
                    { value: 'visible', label: 'Visible' },
                    { value: 'hidden', label: 'Hidden' }
                ]
            },
            {
                id: 'scrollbarVerticalScrollbarSize',
                path: 'scrollbar.verticalScrollbarSize',
                label: 'Vertical Scrollbar Size',
                type: 'number',
                min: 6,
                step: 1,
                description: 'Sets the thickness of the vertical scrollbar.'
            },
            {
                id: 'scrollbarHorizontalScrollbarSize',
                path: 'scrollbar.horizontalScrollbarSize',
                label: 'Horizontal Scrollbar Size',
                type: 'number',
                min: 6,
                step: 1,
                description: 'Sets the thickness of the horizontal scrollbar.'
            },
            {
                id: 'scrollbarUseShadows',
                path: 'scrollbar.useShadows',
                label: 'Scrollbar Use Shadows',
                type: 'boolean',
                description: 'Shows subtle shadows around the scrollable editor area.'
            },
            {
                id: 'scrollbarAlwaysConsumeMouseWheel',
                path: 'scrollbar.alwaysConsumeMouseWheel',
                label: 'Scrollbar Always Consume Mouse Wheel',
                type: 'boolean',
                description: 'Keeps the editor from letting wheel events bubble to parent containers.'
            }
        ]
    },
    {
        id: 'advanced-accessibility',
        title: 'Advanced & Accessibility',
        description: 'Accessibility support and lower-level editor behavior.',
        items: [
            {
                id: 'accessibilitySupport',
                path: 'accessibilitySupport',
                label: 'Accessibility Support',
                type: 'select',
                description: 'Controls how accessibility features and screen reader support are handled.',
                options: [
                    { value: 'auto', label: 'Auto' },
                    { value: 'on', label: 'On' },
                    { value: 'off', label: 'Off' }
                ]
            },
            {
                id: 'stickyScrollEnabled',
                path: 'stickyScroll.enabled',
                label: 'Sticky Scroll Enabled',
                type: 'boolean',
                description: 'Keeps scope headers pinned at the top of the editor while scrolling.'
            }
        ]
    },
    {
        id: 'terminal-shell',
        title: 'Terminal & Shell',
        description: 'Desktop terminal profile, typography, and scrollback tuning.',
        items: [
            {
                id: 'terminalProfile',
                path: 'terminal.profile',
                label: 'Terminal Profile',
                type: 'select',
                description: 'Chooses the default desktop shell profile for new integrated terminals.',
                options: [
                    { value: 'pwsh', label: 'PowerShell 7' },
                    { value: 'powershell', label: 'Windows PowerShell' },
                    { value: 'cmd', label: 'Command Prompt' },
                    { value: 'git-bash', label: 'Git Bash' }
                ]
            },
            {
                id: 'terminalFontFamily',
                path: 'terminal.fontFamily',
                label: 'Terminal Font Family',
                type: 'text',
                description: 'Overrides the terminal font family while keeping the editor font separate.',
                keywords: ['terminal font', 'shell font']
            },
            {
                id: 'terminalFontSize',
                path: 'terminal.fontSize',
                label: 'Terminal Font Size',
                type: 'number',
                min: 10,
                step: 1,
                description: 'Controls the size of text in the embedded terminal.'
            },
            {
                id: 'terminalLineHeight',
                path: 'terminal.lineHeight',
                label: 'Terminal Line Height',
                type: 'number',
                min: 1,
                step: 0.01,
                description: 'Controls vertical spacing between terminal lines.'
            },
            {
                id: 'terminalLetterSpacing',
                path: 'terminal.letterSpacing',
                label: 'Terminal Letter Spacing',
                type: 'number',
                step: 0.01,
                description: 'Adjusts the spacing between terminal characters.'
            },
            {
                id: 'terminalScrollback',
                path: 'terminal.scrollback',
                label: 'Terminal Scrollback',
                type: 'number',
                min: 100,
                step: 100,
                description: 'Maximum number of lines kept in terminal memory.'
            }
        ]
    },
    {
        id: 'theme',
        title: 'Themes',
        description: 'Choose from a variety of premium curated themes.',
        items: [
            {
                id: 'themeActive',
                path: 'theme.active',
                label: 'Active Theme',
                type: 'select',
                description: 'Select the primary visual theme for the editor.',
                options: [
                    { value: 'ultra-dark', label: 'Ultra Dark (Default)' },
                    { value: 'monokai-retro', label: 'Monokai Retro' },
                    { value: 'nordic-frost', label: 'Nordic Frost' },
                    { value: 'cyberpunk-neon', label: 'Cyberpunk Neon' },
                    { value: 'midnight-purple', label: 'Midnight Purple' },
                    { value: 'solarized-dark', label: 'Solarized Dark' }
                ]
            },
            {
                id: 'themeGlassmorphism',
                path: 'theme.glassmorphism',
                label: 'Glassmorphism (Frosted Glass)',
                type: 'boolean',
                description: 'Premium translucent UI with high-quality blur.'
            },
            {
                id: 'themeBlurStrength',
                path: 'theme.blurStrength',
                label: 'Glass Blur Strength',
                type: 'number',
                min: 0,
                max: 40,
                description: 'Intensity of the frost effect on UI panels.'
            },
            {
                id: 'themeActiveTabGlow',
                path: 'theme.activeTabGlow',
                label: 'Active Tab RGB Glow',
                type: 'boolean',
                description: 'Subtle neon glow for the active editor tab.'
            },
            {
                id: 'themeBorderGlow',
                path: 'theme.borderGlow',
                label: 'Global Panel Border Glow',
                type: 'boolean',
                description: 'Adds premium light borders around all UI panels.'
            }
        ]
    },
    {
        id: 'performance-pro',
        title: 'Performance & Systems',
        description: 'Low-latency mode, GPU acceleration, and resource management.',
        items: [
            {
                id: 'lowLatencyMode',
                path: 'performance.lowLatencyMode',
                label: 'Ultra Low-Latency Typing',
                type: 'boolean',
                description: 'Prioritize editor rendering over background tasks.'
            },
            {
                id: 'gpuAcceleration',
                path: 'terminalAdvanced.gpuAcceleration',
                label: 'Terminal GPU Acceleration',
                type: 'select',
                description: 'Use the system GPU for high-speed terminal rendering.',
                options: [
                    { value: 'on', label: 'On (High Speed)' },
                    { value: 'off', label: 'Off (Compatibility)' }
                ]
            },
            {
                id: 'statusMonitor',
                path: 'performance.statusMonitor',
                label: 'Live Performance Monitor',
                type: 'boolean',
                description: 'Show real-time CPU/RAM usage in the status bar.'
            }
        ]
    },
    {
        id: 'debugger-advanced',
        title: 'Advanced Debugging',
        description: 'Deep process inspection and real-time state tracking.',
        items: [
            {
                id: 'debuggerInlineValues',
                path: 'debugger.inlineValues',
                label: 'Inline Debug Values',
                type: 'boolean',
                description: 'Show variable values directly in the editor during debugging.'
            },
            {
                id: 'debuggerSmartStep',
                path: 'debugger.smartStep',
                label: 'Smart Stepping',
                type: 'boolean',
                description: 'Skip library code and focus on your logic during steps.'
            }
        ]
    },
    {
        id: 'zen-mode',
        title: 'Zen Mode',
        description: 'Distraction-free editing and focus modes.',
        items: [
            {
                id: 'zenModeHideTabs',
                path: 'zenMode.hideTabs',
                label: 'Hide Tabs',
                type: 'boolean',
                description: 'Hides the tab bar when entering Zen Mode.'
            },
            {
                id: 'zenModeFullScreen',
                path: 'zenMode.fullScreen',
                label: 'Full Screen',
                type: 'boolean',
                description: 'Enters full screen mode automatically when Zen Mode is activated.'
            }
        ]
    },
    {
        id: 'accessibility',
        title: 'Accessibility',
        description: 'Screen reader optimization and visual clarity options.',
        items: [
            {
                id: 'screenReaderOptimized',
                path: 'accessibility.screenReaderOptimized',
                label: 'Screen Reader Optimized',
                type: 'boolean',
                description: 'Optimizes the editor for screen reader software.'
            }
        ]
    },
    {
        id: 'security',
        title: 'Security',
        description: 'Workspace trust and data protection settings.',
        items: [
            {
                id: 'workspaceTrust',
                path: 'security.workspace.trust.enabled',
                label: 'Workspace Trust',
                type: 'boolean',
                description: 'Enables workspace trust to prevent automatic code execution in untrusted folders.'
            }
        ]
    }
];

function getValueByPath(source, path) {
    return path.split('.').reduce((current, key) => current?.[key], source);
}

function setValueByPath(source, path, value) {
    const keys = path.split('.');
    const next = { ...source };
    let cursor = next;
    let originalCursor = source;

    for (let index = 0; index < keys.length - 1; index += 1) {
        const key = keys[index];
        const originalValue = originalCursor?.[key];
        cursor[key] = Array.isArray(originalValue) ? [...originalValue] : { ...(originalValue || {}) };
        cursor = cursor[key];
        originalCursor = originalValue;
    }

    cursor[keys[keys.length - 1]] = value;
    return next;
}

function formatPath(path) {
    if (path && path.includes('.')) {
        return `editor.${path}`;
    }
    return `editor.${path || ''}`;
}

function normalizeString(value) {
    return String(value || '').trim().toLowerCase();
}

function pathToDomId(path) {
    return `setting-${path.replaceAll('.', '-')}`;
}

function getComparableValue(value) {
    return JSON.stringify(value);
}

function SearchableInput({ value, onCommit, placeholder, className, listId, suggestions = [] }) {
    const [draft, setDraft] = useState(value ?? '');

    useEffect(() => {
        setDraft(value ?? '');
    }, [value]);

    return (
        <>
            <input
                className={className}
                type="text"
                value={draft}
                placeholder={placeholder}
                list={listId}
                autoComplete="off"
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => onCommit(draft)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        onCommit(draft);
                        event.currentTarget.blur();
                    }
                    if (event.key === 'Escape') {
                        setDraft(value ?? '');
                        event.currentTarget.blur();
                    }
                }}
            />
            {listId ? (
                <datalist id={listId}>
                    {suggestions.map((suggestion) => (
                        <option key={suggestion} value={suggestion} />
                    ))}
                </datalist>
            ) : null}
        </>
    );
}

function JsonInput({ value, onCommit, placeholder, className }) {
    const [draft, setDraft] = useState(JSON.stringify(value ?? {}, null, 2));
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        setDraft(JSON.stringify(value ?? {}, null, 2));
        setHasError(false);
    }, [value]);

    function commitDraft(nextDraft) {
        try {
            const parsed = nextDraft.trim() ? JSON.parse(nextDraft) : {};
            onCommit(parsed);
            setHasError(false);
        } catch {
            setHasError(true);
        }
    }

    return (
        <div className="tilderSettingsJsonWrapper">
            <textarea
                className={`${className} ${hasError ? 'is-invalid' : ''}`}
                value={draft}
                placeholder={placeholder}
                rows={4}
                spellCheck={false}
                onChange={(event) => {
                    setDraft(event.target.value);
                    if (hasError) {
                        setHasError(false);
                    }
                }}
                onBlur={() => commitDraft(draft)}
            />
            {hasError ? <div className="tilderSettingsFieldHint error">Enter valid JSON before leaving this field.</div> : null}
        </div>
    );
}

function CsvNumberListInput({ value, onCommit, placeholder, className }) {
    const [draft, setDraft] = useState(Array.isArray(value) ? value.join(', ') : '');
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        setDraft(Array.isArray(value) ? value.join(', ') : '');
        setHasError(false);
    }, [value]);

    function commitDraft(nextDraft) {
        const trimmed = nextDraft.trim();
        if (!trimmed) {
            onCommit([]);
            setHasError(false);
            return;
        }

        const parts = trimmed.split(',').map((part) => part.trim()).filter(Boolean);
        const parsed = parts.map((part) => Number(part));

        if (parsed.some((entry) => Number.isNaN(entry))) {
            setHasError(true);
            return;
        }

        onCommit(parsed);
        setHasError(false);
    }

    return (
        <div className="tilderSettingsJsonWrapper">
            <input
                className={`${className} ${hasError ? 'is-invalid' : ''}`}
                type="text"
                value={draft}
                placeholder={placeholder}
                onChange={(event) => {
                    setDraft(event.target.value);
                    if (hasError) {
                        setHasError(false);
                    }
                }}
                onBlur={() => commitDraft(draft)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        commitDraft(draft);
                        event.currentTarget.blur();
                    }
                    if (event.key === 'Escape') {
                        setDraft(Array.isArray(value) ? value.join(', ') : '');
                        setHasError(false);
                        event.currentTarget.blur();
                    }
                }}
            />
            {hasError ? <div className="tilderSettingsFieldHint error">Use comma-separated numbers only.</div> : null}
        </div>
    );
}

function ResetButton({ disabled, onClick }) {
    return (
        <button
            type="button"
            className={`resetBtn ${disabled ? 'disabled' : ''}`}
            disabled={disabled}
            onClick={onClick}
        >
            Reset
        </button>
    );
}

function SettingControl({ item, value, onCommit, systemFonts = [] }) {
    if (item.type === 'boolean') {
        return (
            <label className="tilderSettingsToggle">
                <input
                    type="checkbox"
                    checked={Boolean(value)}
                    onChange={(event) => onCommit(event.target.checked)}
                />
                <span className="tilderSettingsToggleSlider" />
                <span className="tilderSettingsToggleLabel">{value ? 'On' : 'Off'}</span>
            </label>
        );
    }

    if (item.type === 'select') {
        return (
            <select
                className="settingsInput tilderSettingsControl"
                value={value}
                onChange={(event) => onCommit(event.target.value)}
            >
                {(item.options || []).map((option) => (
                    <option key={String(option.value)} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        );
    }

    if (item.type === 'number') {
        return (
            <input
                className="settingsInput tilderSettingsControl"
                type="number"
                value={Number.isFinite(value) ? value : 0}
                min={item.min}
                max={item.max}
                step={item.step ?? 1}
                onChange={(event) => onCommit(Number(event.target.value))}
            />
        );
    }

    if (item.type === 'json') {
        return (
            <JsonInput
                value={value}
                onCommit={onCommit}
                placeholder={item.placeholder}
                className="settingsInput tilderSettingsControl tilderSettingsTextarea"
            />
        );
    }

    if (item.type === 'csv-number-list') {
        return (
            <CsvNumberListInput
                value={value}
                onCommit={onCommit}
                placeholder={item.placeholder}
                className="settingsInput tilderSettingsControl"
            />
        );
    }

    return (
        <SearchableInput
            value={value}
            onCommit={onCommit}
            placeholder={item.placeholder}
            className="settingsInput tilderSettingsControl"
            listId={item.path === 'fontFamily' || item.path === 'terminal.fontFamily' ? 'tilder-system-fonts' : undefined}
            suggestions={item.path === 'fontFamily' || item.path === 'terminal.fontFamily' ? systemFonts : []}
        />
    );
}

export default function Settings({ modalType, settings, setSettings, systemFonts = [] }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeSection, setActiveSection] = useState(SECTION_DEFINITIONS[0].id);
    const [highlightedSettingId, setHighlightedSettingId] = useState(null);
    const [searchOpen, setSearchOpen] = useState(false);
    const [activeSearchIndex, setActiveSearchIndex] = useState(0);
    const [settingsView, setSettingsView] = useState('ui');
    const [jsonDraft, setJsonDraft] = useState(JSON.stringify(settings, null, 2));
    const [jsonError, setJsonError] = useState('');

    const sectionScrollRef = useRef(null);
    const searchWrapperRef = useRef(null);
    const sectionRefs = useRef({});
    const highlightTimeoutRef = useRef(null);
    const preservedScrollTopRef = useRef(0);

    const searchIndex = useMemo(() => {
        return SECTION_DEFINITIONS.flatMap((section) =>
            section.items.map((item) => ({
                ...item,
                sectionId: section.id,
                sectionTitle: section.title,
                searchableText: normalizeString([
                    section.title,
                    item.label,
                    item.description,
                    item.path,
                    formatPath(item.path),
                    ...(item.keywords || [])
                ].join(' '))
            }))
        );
    }, []);

    const filteredSections = useMemo(() => {
        const query = normalizeString(searchQuery);

        if (!query) {
            return SECTION_DEFINITIONS;
        }

        return SECTION_DEFINITIONS.map((section) => ({
            ...section,
            items: section.items.filter((item) => {
                const searchableEntry = searchIndex.find((entry) => entry.path === item.path);
                return searchableEntry?.searchableText.includes(query);
            })
        })).filter((section) => section.items.length > 0);
    }, [searchIndex, searchQuery]);

    const searchResults = useMemo(() => {
        const query = normalizeString(searchQuery);
        if (!query) {
            return [];
        }

        return searchIndex
            .filter((item) => item.searchableText.includes(query))
            .sort((left, right) => {
                const leftStarts = left.label.toLowerCase().startsWith(query);
                const rightStarts = right.label.toLowerCase().startsWith(query);
                if (leftStarts !== rightStarts) {
                    return leftStarts ? -1 : 1;
                }
                return left.label.localeCompare(right.label);
            })
            .slice(0, 8);
    }, [searchIndex, searchQuery]);

    useEffect(() => {
        setActiveSearchIndex(0);
    }, [searchQuery]);

    useEffect(() => {
        setJsonDraft(JSON.stringify(settings, null, 2));
        setJsonError('');
    }, [settings]);

    useEffect(() => {
        function handleOutsideClick(event) {
            if (!searchWrapperRef.current?.contains(event.target)) {
                setSearchOpen(false);
            }
        }

        document.addEventListener('mousedown', handleOutsideClick);
        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
        };
    }, []);

    useEffect(() => {
        const container = sectionScrollRef.current;
        if (!container) {
            return undefined;
        }

        function rememberScrollTop() {
            preservedScrollTopRef.current = container.scrollTop;
        }

        rememberScrollTop();
        container.addEventListener('scroll', rememberScrollTop);
        return () => {
            container.removeEventListener('scroll', rememberScrollTop);
        };
    }, []);

    const isProgrammaticScrollRef = useRef(false);
    const programmaticScrollTimeoutRef = useRef(null);

    useEffect(() => {
        const container = sectionScrollRef.current;
        if (!container) {
            return undefined;
        }

        function updateActiveSectionFromScroll() {
            if (isProgrammaticScrollRef.current) return;

            const visibleIds = filteredSections.map((section) => section.id);
            if (!visibleIds.length) {
                return;
            }

            const containerTop = container.getBoundingClientRect().top;
            let bestSectionId = visibleIds[0];
            let smallestDistance = Number.POSITIVE_INFINITY;

            visibleIds.forEach((sectionId) => {
                const sectionNode = sectionRefs.current[sectionId];
                if (!sectionNode) {
                    return;
                }

                const distance = Math.abs(sectionNode.getBoundingClientRect().top - containerTop - 78);
                if (distance < smallestDistance) {
                    smallestDistance = distance;
                    bestSectionId = sectionId;
                }
            });

            setActiveSection(bestSectionId);
        }

        updateActiveSectionFromScroll();
        container.addEventListener('scroll', updateActiveSectionFromScroll);
        return () => {
            container.removeEventListener('scroll', updateActiveSectionFromScroll);
        };
    }, [filteredSections]);

    useEffect(() => {
        if (!filteredSections.find((section) => section.id === activeSection)) {
            setActiveSection(filteredSections[0]?.id || SECTION_DEFINITIONS[0].id);
        }
    }, [activeSection, filteredSections]);

    useEffect(() => {
        if (settingsView !== 'ui') {
            return;
        }

        const container = sectionScrollRef.current;
        if (!container) {
            return;
        }

        const nextScrollTop = preservedScrollTopRef.current;
        const frame = window.requestAnimationFrame(() => {
            container.scrollTop = nextScrollTop;
        });

        return () => window.cancelAnimationFrame(frame);
    }, [settings, settingsView]);

    function updateSetting(path, value) {
        const container = sectionScrollRef.current;
        if (container) {
            preservedScrollTopRef.current = container.scrollTop;
        }
        setSettings((previous) => mergeWithDefaultSettings(setValueByPath(previous, path, value)));
    }

    function resetSetting(path) {
        const container = sectionScrollRef.current;
        if (container) {
            preservedScrollTopRef.current = container.scrollTop;
        }
        updateSetting(path, getValueByPath(defaultSettings, path));
    }

    function resetAllSettings() {
        const container = sectionScrollRef.current;
        if (container) {
            preservedScrollTopRef.current = container.scrollTop;
        }
        setSettings(mergeWithDefaultSettings(defaultSettings));
    }

    function applyJsonDraft() {
        try {
            const parsed = JSON.parse(jsonDraft);
            setSettings(mergeWithDefaultSettings(parsed));
            setJsonError('');
        } catch (error) {
            setJsonError(error instanceof Error ? error.message : 'Invalid JSON.');
        }
    }

    function resetJsonDraft() {
        setJsonDraft(JSON.stringify(settings, null, 2));
        setJsonError('');
    }

    function resetSection(sectionId) {
        const section = SECTION_DEFINITIONS.find((candidate) => candidate.id === sectionId);
        if (!section) {
            return;
        }

        setSettings((previous) => {
            let next = previous;
            section.items.forEach((item) => {
                next = setValueByPath(next, item.path, getValueByPath(defaultSettings, item.path));
            });
            return next;
        });
    }

    function triggerHighlight(settingId) {
        setHighlightedSettingId(settingId);
        if (highlightTimeoutRef.current) {
            clearTimeout(highlightTimeoutRef.current);
        }
        highlightTimeoutRef.current = setTimeout(() => {
            setHighlightedSettingId(null);
        }, 1700);
    }

    function scrollSettingsBodyToNode(node, extraOffset = 0) {
        const container = sectionScrollRef.current;
        if (!container || !node) {
            return;
        }

        const containerRect = container.getBoundingClientRect();
        const nodeRect = node.getBoundingClientRect();
        const scrollTop = container.scrollTop + (nodeRect.top - containerRect.top) - extraOffset;
        
        container.scrollTo({
            top: Math.max(scrollTop, 0),
            behavior: 'smooth'
        });
    }

    function jumpToSetting(path, sectionId) {
        setActiveSection(sectionId);
        setSearchOpen(false);
        const sectionNode = sectionRefs.current[sectionId];
        const targetNode = document.getElementById(pathToDomId(path));

        if (targetNode) {
            scrollSettingsBodyToNode(targetNode, 14);
        } else if (sectionNode) {
            scrollSettingsBodyToNode(sectionNode, 10);
        }

        window.setTimeout(() => {
            const nextTargetNode = document.getElementById(pathToDomId(path));
            if (nextTargetNode) {
                scrollSettingsBodyToNode(nextTargetNode, 14);
                triggerHighlight(path);
            }
        }, 120);
    }

    function scrollToSection(sectionId) {
        setActiveSection(sectionId);
        
        isProgrammaticScrollRef.current = true;
        if (programmaticScrollTimeoutRef.current) clearTimeout(programmaticScrollTimeoutRef.current);
        programmaticScrollTimeoutRef.current = setTimeout(() => {
            isProgrammaticScrollRef.current = false;
        }, 1000);

        scrollSettingsBodyToNode(sectionRefs.current[sectionId], 10);
    }

    const visibleSectionIds = new Set(filteredSections.map((section) => section.id));

    return (
        <div className={`settings tilderSettingsRoot d-${modalType === 'Settings' ? 'flex' : 'none'}`}>
            <aside className="tilderSettingsSidebar">
                <div className="tilderSettingsSidebarHeader">
                    <div className="tilderSettingsSidebarEyebrow">Preferences</div>
                    <h4>Settings</h4>
                    <div className="tilderSettingsViewSwitch">
                        <button
                            type="button"
                            className={`tilderSettingsViewButton ${settingsView === 'ui' ? 'active' : ''}`}
                            onClick={() => setSettingsView('ui')}
                        >
                            UI
                        </button>
                        <button
                            type="button"
                            className={`tilderSettingsViewButton ${settingsView === 'json' ? 'active' : ''}`}
                            onClick={() => setSettingsView('json')}
                        >
                            JSON
                        </button>
                    </div>
                </div>

                <div className="tilderSettingsSidebarList">
                    {SECTION_DEFINITIONS.map((section) => {
                        const visibleCount = filteredSections.find((entry) => entry.id === section.id)?.items.length || 0;
                        const isVisible = visibleSectionIds.has(section.id);

                        return (
                            <button
                                key={section.id}
                                type="button"
                                className={`tilderSettingsSidebarItem ${activeSection === section.id ? 'active' : ''} ${isVisible ? '' : 'muted'}`}
                                onClick={() => scrollToSection(section.id)}
                            >
                                {SECTION_ICONS[section.id] && (
                                    <div 
                                        className="tilderSettingsSidebarItemIcon"
                                        style={{ background: SECTION_ICONS[section.id].color }}
                                    >
                                        <i className={SECTION_ICONS[section.id].icon}></i>
                                    </div>
                                )}
                                <div className="tilderSettingsSidebarItemText">
                                    <span>{section.title}</span>
                                    <small>{section.description}</small>
                                </div>
                                <span className="tilderSettingsSidebarCount">{isVisible ? visibleCount : 0}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="tilderSettingsSidebarActions">
                    <button className="resetBulk" onClick={resetAllSettings}>Reset All</button>
                    <button className="resetBulk" onClick={() => resetSection(activeSection)}>Reset Section</button>
                </div>
            </aside>

            <div className="tilderSettingsContent">
                {settingsView === 'json' ? (
                    <>
                        <div className="tilderSettingsSearchSummary">
                            Edit the complete settings object directly, just like VS Code settings JSON.
                        </div>
                        <div className="tilderSettingsJsonEditor">
                            <textarea
                                className={`settingsInput tilderSettingsJsonEditorInput ${jsonError ? 'is-invalid' : ''}`}
                                value={jsonDraft}
                                spellCheck={false}
                                onChange={(event) => {
                                    setJsonDraft(event.target.value);
                                    if (jsonError) {
                                        setJsonError('');
                                    }
                                }}
                            />
                            <div className="tilderSettingsJsonActions">
                                <button type="button" className="tilderSettingsResetSection" onClick={applyJsonDraft}>
                                    Apply JSON
                                </button>
                                <button type="button" className="tilderSettingsResetSection" onClick={resetJsonDraft}>
                                    Reset Draft
                                </button>
                            </div>
                            {jsonError ? <div className="tilderSettingsFieldHint error">{jsonError}</div> : null}
                        </div>
                    </>
                ) : (
                    <>
                <div className="tilderSettingsSearchBar" ref={searchWrapperRef}>
                    <input
                        id="settingsSearchBar"
                        type="text"
                        value={searchQuery}
                        placeholder="Search settings"
                        autoComplete="off"
                        onFocus={() => setSearchOpen(true)}
                        onChange={(event) => {
                            setSearchQuery(event.target.value);
                            setSearchOpen(true);
                        }}
                        onKeyDown={(event) => {
                            if (!searchResults.length) {
                                return;
                            }

                            if (event.key === 'ArrowDown') {
                                event.preventDefault();
                                setSearchOpen(true);
                                setActiveSearchIndex((previous) => (previous + 1) % searchResults.length);
                            }

                            if (event.key === 'ArrowUp') {
                                event.preventDefault();
                                setSearchOpen(true);
                                setActiveSearchIndex((previous) => (previous - 1 + searchResults.length) % searchResults.length);
                            }

                            if (event.key === 'Enter') {
                                event.preventDefault();
                                const selected = searchResults[activeSearchIndex] || searchResults[0];
                                if (selected) {
                                    jumpToSetting(selected.path, selected.sectionId);
                                }
                            }

                            if (event.key === 'Escape') {
                                setSearchOpen(false);
                            }
                        }}
                    />

                    {searchOpen && searchQuery.trim() ? (
                        <div className="tilderSettingsSearchDropdown">
                            {searchResults.length ? (
                                searchResults.map((result, index) => (
                                    <button
                                        key={result.path}
                                        type="button"
                                        className={`tilderSettingsSearchResult ${index === activeSearchIndex ? 'active' : ''}`}
                                        onMouseEnter={() => setActiveSearchIndex(index)}
                                        onMouseDown={(event) => {
                                            event.preventDefault();
                                            jumpToSetting(result.path, result.sectionId);
                                        }}
                                    >
                                        <div className="tilderSettingsSearchResultTitle">{result.label}</div>
                                        <div className="tilderSettingsSearchResultMeta">
                                            <span>{result.sectionTitle}</span>
                                            <span>{formatPath(result.path)}</span>
                                        </div>
                                    </button>
                                ))
                            ) : (
                                <div className="tilderSettingsSearchEmpty">No matching settings found.</div>
                            )}
                        </div>
                    ) : null}
                </div>

                <div className="tilderSettingsSearchSummary">
                    {searchQuery.trim()
                        ? `${searchResults.length ? `${searchResults.length}+ jump matches` : '0 jump matches'} across ${filteredSections.length} section${filteredSections.length === 1 ? '' : 's'}`
                        : 'Browse all editor settings by section, or search and jump directly to a setting.'}
                </div>

                <div className="tilderSettingsSectionsScroll" ref={sectionScrollRef}>
                    <div className="tilderSettingsSections">
                    {filteredSections.map((section) => (
                        <section
                            key={section.id}
                            className="tilderSettingsSection"
                            ref={(node) => {
                                sectionRefs.current[section.id] = node;
                            }}
                        >
                            <div className="tilderSettingsSectionHeader">
                                <div>
                                    <h5>{section.title}</h5>
                                    <p>{section.description}</p>
                                </div>
                                <button type="button" className="tilderSettingsResetSection" onClick={() => resetSection(section.id)}>
                                    Reset Section
                                </button>
                            </div>

                            <div className="tilderSettingsCards">
                                {section.items.map((item) => {
                                    const currentValue = getValueByPath(settings, item.path);
                                    const resolvedValue = currentValue === undefined ? getValueByPath(defaultSettings, item.path) : currentValue;
                                    const defaultValue = getValueByPath(defaultSettings, item.path);
                                    const isDefault = getComparableValue(currentValue) === getComparableValue(defaultValue);

                                    return (
                                        <article
                                            key={item.path}
                                            id={pathToDomId(item.path)}
                                            className={`tilderSettingsCard ${highlightedSettingId === item.path ? 'highlighted' : ''}`}
                                        >
                                            <div className="tilderSettingsCardHeader">
                                                <div>
                                                    <div className="tilderSettingsCardTitleRow">
                                                        <h6>{item.label}</h6>
                                                        <span className="tilderSettingsSettingPath">{formatPath(item.path)}</span>
                                                    </div>
                                                    <p>{item.description}</p>
                                                </div>
                                            </div>

                                            <div className="tilderSettingsCardFooter">
                                                <div className="tilderSettingsControlWrap">
                                                    <SettingControl
                                                        item={item}
                                                        value={resolvedValue}
                                                        onCommit={(value) => updateSetting(item.path, value)}
                                                        systemFonts={systemFonts}
                                                    />
                                                </div>
                                                <ResetButton disabled={isDefault} onClick={() => resetSetting(item.path)} />
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                    </div>
                </div>
                    </>
                )}
            </div>
        </div>
    );
}
