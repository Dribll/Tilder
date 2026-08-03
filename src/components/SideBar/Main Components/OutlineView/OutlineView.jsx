import React, { useState, useEffect, useMemo } from 'react';
import './OutlineView.css';

export default function OutlineView({ ariaExpandedisplayoutline, workspace }) {
  const [symbols, setSymbols] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedNodes, setCollapsedNodes] = useState(new Set());
  const [activeLine, setActiveLine] = useState(-1);
  const [activeSymbolId, setActiveSymbolId] = useState(null);

  const activeTabId = workspace?.activeTabId;
  const activeTab = workspace?.tabs?.find(t => t.id === activeTabId);

  useEffect(() => {
    if (!ariaExpandedisplayoutline) return;

    if (!activeTab || !workspace?.isTrusted) {
      setSymbols([]);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    async function fetchSymbols() {
      try {
        // Find if we have LSP or a way to get symbols
        const lspContext = window.getLspContext?.();
        if (lspContext?.bridge?.requestSymbols) {
          const result = await lspContext.bridge.requestSymbols({
            relativePath: activeTab.path,
            fileName: activeTab.name,
            text: activeTab.content,
          });
          if (isMounted) {
            setSymbols(result || []);
          }
        } else {
          // Fallback: comprehensive regex parser
          if (isMounted) setSymbols(generateFallbackSymbols(activeTab.content, activeTab.language));
        }
      } catch (err) {
        if (isMounted) setError('Failed to load outline.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    // Debounce symbol fetching
    const timer = setTimeout(fetchSymbols, 500);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [activeTab?.content, activeTab?.id, ariaExpandedisplayoutline, workspace?.isTrusted]);

  // Listen for cursor changes if supported
  useEffect(() => {
    const handleCursorChange = (e) => {
      const line = e.detail?.lineNumber || e.lineNumber;
      if (line !== undefined) {
        setActiveLine(line);
      }
    };
    window.addEventListener('editorCursorChange', handleCursorChange);
    return () => window.removeEventListener('editorCursorChange', handleCursorChange);
  }, []);

  // Update active symbol based on cursor
  useEffect(() => {
    if (activeLine === -1 || symbols.length === 0) {
      setActiveSymbolId(null);
      return;
    }
    
    let bestSymId = null;
    let bestStart = -1;

    const traverse = (list, depth = 0) => {
      list.forEach((sym, index) => {
        if (sym.range && sym.range.startLineNumber <= activeLine) {
          if (sym.range.startLineNumber >= bestStart) {
            bestStart = sym.range.startLineNumber;
            bestSymId = `${sym.name}-${sym.range.startLineNumber}-${depth}-${index}`;
          }
          if (sym.children) {
            traverse(sym.children, depth + 1);
          }
        }
      });
    };
    traverse(symbols);
    setActiveSymbolId(bestSymId);
  }, [activeLine, symbols]);

  const filteredSymbols = useMemo(() => {
    if (!searchQuery) return symbols;
    const lowerQuery = searchQuery.toLowerCase();
    
    const filterNodes = (nodes) => {
      let result = [];
      for (const node of nodes) {
        const nameMatch = node.name.toLowerCase().includes(lowerQuery);
        const filteredChildren = node.children ? filterNodes(node.children) : [];
        if (nameMatch || filteredChildren.length > 0) {
          result.push({ ...node, children: filteredChildren });
        }
      }
      return result;
    };
    
    return filterNodes(symbols);
  }, [symbols, searchQuery]);

  function getIconForKind(kind) {
    const map = {
      1: 'fa-solid fa-file-code',
      2: 'fa-solid fa-cube',
      3: 'fa-solid fa-cubes',
      4: 'fa-solid fa-box',
      5: 'fa-solid fa-building', // Class
      6: 'fa-solid fa-bolt', // Method
      7: 'fa-solid fa-wrench', // Property
      8: 'fa-solid fa-cube', // Field
      9: 'fa-solid fa-plus-minus', // Constructor
      10: 'fa-solid fa-tag', // Enum
      11: 'fa-solid fa-link', // Interface
      12: 'fa-solid fa-cube', // Function
      13: 'fa-solid fa-font', // Variable
      14: 'fa-solid fa-lock', // Constant
      15: 'fa-solid fa-font', // String
      16: 'fa-solid fa-hashtag', // Number
      17: 'fa-solid fa-toggle-on', // Boolean
      18: 'fa-solid fa-list', // Array
    };
    // Adjust Function icon to match typical VS Code icon (purple box / fx)
    if (kind === 12) return 'fa-solid fa-f';
    return map[kind] || 'fa-solid fa-code';
  }

  const toggleCollapse = (e, symId) => {
    e.stopPropagation();
    setCollapsedNodes(prev => {
      const next = new Set(prev);
      if (next.has(symId)) next.delete(symId);
      else next.add(symId);
      return next;
    });
  };

  const renderSymbols = (symbolList, depth = 0) => {
    return symbolList.map((sym, index) => {
      const symId = `${sym.name}-${sym.range?.startLineNumber}-${depth}-${index}`;
      const hasChildren = sym.children && sym.children.length > 0;
      const isCollapsed = collapsedNodes.has(symId) && !searchQuery;
      const isActive = symId === activeSymbolId;

      return (
        <div key={symId} className="outline-item-wrapper">
          <div 
            className={`outline-item ${isActive ? 'active' : ''}`} 
            style={{ paddingLeft: `${depth * 16 + 4}px` }}
            onClick={() => {
              if (window.jumpToEditorLine && sym.range) {
                window.jumpToEditorLine(sym.range.startLineNumber);
              } else if (window.tilderJumpToLine && sym.range) {
                window.tilderJumpToLine(sym.range.startLineNumber);
              }
            }}
          >
            <div 
              className="outline-chevron" 
              onClick={(e) => hasChildren ? toggleCollapse(e, symId) : null}
              style={{ opacity: hasChildren ? 1 : 0, cursor: hasChildren ? 'pointer' : 'default' }}
            >
              <i className={`fa-solid fa-chevron-${isCollapsed ? 'right' : 'down'}`}></i>
            </div>
            <i className={`${getIconForKind(sym.kind)} outline-icon kind-${sym.kind}`}></i>
            <span className="outline-name">{sym.name}</span>
            {sym.detail && <span className="outline-detail-badge">{sym.detail}</span>}
          </div>
          {hasChildren && !isCollapsed && (
            <div className="outline-children">
              {renderSymbols(sym.children, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="outline-view-container" style={{ display: ariaExpandedisplayoutline ? 'flex' : 'none' }}>
      <div className="outline-header">
        <h5>OUTLINE</h5>
        <input 
          type="text" 
          className="outline-search" 
          placeholder="Filter..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      <div className="outline-content">
        {!activeTab ? (
          <div className="outline-empty">No active editor</div>
        ) : loading && symbols.length === 0 ? (
          <div className="outline-empty">Loading symbols...</div>
        ) : error ? (
          <div className="outline-empty">{error}</div>
        ) : filteredSymbols.length > 0 ? (
          <div className="outline-tree">
            {renderSymbols(filteredSymbols)}
          </div>
        ) : (
          <div className="outline-empty">No symbols found</div>
        )}
      </div>
    </div>
  );
}

// Fallback logic for when LSP is not available
function generateFallbackSymbols(text, language) {
  if (!text) return [];
  const lines = text.split('\n');
  const symbols = [];
  const stack = []; // { symbol, level }
  
  const lang = (language || '').toLowerCase();
  
  let braceDepth = 0;
  let pythonDecorators = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    let symbol = null;
    let currentLevel = braceDepth;
    
    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;

    if (lang === 'python' || lang === 'py') {
      currentLevel = indent;
      if (trimmed.startsWith('@')) {
        pythonDecorators.push(trimmed);
        continue;
      }
      
      let match;
      if ((match = trimmed.match(/^(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(/))) {
        symbol = { name: match[1], kind: currentLevel > 0 ? 6 : 12 }; // Method or Function
      } else if ((match = trimmed.match(/^class\s+([a-zA-Z0-9_]+)(?:\([^)]*\))?:/))) {
        symbol = { name: match[1], kind: 5 }; // Class
      } else if ((match = trimmed.match(/^([A-Z][A-Z0-9_]*)\s*=/))) {
        symbol = { name: match[1], kind: 14 }; // Constant
      }
      
      if (symbol && pythonDecorators.length > 0) {
        symbol.detail = pythonDecorators.join(' ');
        pythonDecorators = [];
      }
    } else if (lang === 'markdown' || lang === 'md') {
      let match;
      if ((match = trimmed.match(/^(#{1,6})\s+(.*)/))) {
        currentLevel = match[1].length; 
        symbol = { name: match[2], kind: 15, detail: `H${currentLevel}` };
      }
    } else if (lang === 'html' || lang === 'xml') {
      let match;
      if ((match = trimmed.match(/<(h[1-6]|section|nav|main|header|footer|form|div(?:[^>]+(?:id|class)="[^"]*")?)[^>]*>/i))) {
        const tagMatch = match[0].match(/<([a-zA-Z0-9]+)/);
        const idMatch = match[0].match(/id="([^"]+)"/);
        const classMatch = match[0].match(/class="([^"]+)"/);
        let name = tagMatch ? tagMatch[1].toLowerCase() : 'tag';
        if (idMatch) name += `#${idMatch[1]}`;
        else if (classMatch) name += `.${classMatch[1].split(' ')[0]}`;
        
        currentLevel = indent;
        symbol = { name, kind: 13 };
      }
    } else if (lang === 'css' || lang === 'scss' || lang === 'less') {
      if (trimmed.endsWith('{') && !trimmed.startsWith('@import')) {
        let name = trimmed.slice(0, -1).trim();
        if (name) symbol = { name, kind: 13 };
      } else if (trimmed.startsWith('@media') || trimmed.startsWith('@keyframes')) {
        let name = trimmed.split('{')[0].trim();
        symbol = { name, kind: 13 };
      }
    } else if (lang === 'json') {
      let match;
      if ((match = trimmed.match(/^"([^"]+)"\s*:/))) {
        symbol = { name: match[1], kind: 7 };
        currentLevel = indent;
      }
    } else if (lang === 'rust' || lang === 'rs') {
       let match;
       if ((match = trimmed.match(/^(?:pub\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)\s*\(/))) {
         symbol = { name: match[1], kind: 12 };
       } else if ((match = trimmed.match(/^(?:pub\s+)?struct\s+([a-zA-Z0-9_]+)/))) {
         symbol = { name: match[1], kind: 5 };
       } else if ((match = trimmed.match(/^(?:pub\s+)?enum\s+([a-zA-Z0-9_]+)/))) {
         symbol = { name: match[1], kind: 10 };
       } else if ((match = trimmed.match(/^(?:pub\s+)?trait\s+([a-zA-Z0-9_]+)/))) {
         symbol = { name: match[1], kind: 11 };
       } else if ((match = trimmed.match(/^impl(?:<[^>]*>)?\s+([a-zA-Z0-9_]+)/))) {
         symbol = { name: match[1], kind: 5 };
       } else if ((match = trimmed.match(/^(?:pub\s+)?mod\s+([a-zA-Z0-9_]+)/))) {
         symbol = { name: match[1], kind: 2 };
       } else if ((match = trimmed.match(/^(?:pub\s+)?const\s+([A-Z0-9_]+)\s*:/))) {
         symbol = { name: match[1], kind: 14 };
       }
    } else if (lang === 'go') {
       let match;
       if ((match = trimmed.match(/^func\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_]+)\s*\(/))) {
         symbol = { name: match[1], kind: match[0].includes('(') && !match[0].startsWith('func (') ? 12 : 6 }; 
       } else if ((match = trimmed.match(/^type\s+([a-zA-Z0-9_]+)\s+(struct|interface)/))) {
         symbol = { name: match[1], kind: match[2] === 'struct' ? 5 : 11 };
       } else if ((match = trimmed.match(/^const\s+([A-Z0-9_]+)/))) {
         symbol = { name: match[1], kind: 14 };
       }
    } else {
      // JS/TS, Java, C#, C++, etc.
      let match;
      if ((match = trimmed.match(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class)\s+([a-zA-Z0-9_]+)/))) {
        const isClass = match[0].includes('class');
        symbol = { name: match[1], kind: isClass ? 5 : 12 };
        if (match[0].includes('export')) symbol.detail = 'export';
      } else if ((match = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z0-9_]+)?\s*=>/))) {
        symbol = { name: match[1], kind: 12 };
        if (match[0].includes('export')) symbol.detail = 'export';
      } else if ((match = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*function\s*\(/))) {
        symbol = { name: match[1], kind: 12 };
      } else if ((match = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+([A-Z][A-Z0-9_]*)\s*=/))) {
        symbol = { name: match[1], kind: 14 };
      } else if ((match = trimmed.match(/^(?:export\s+)?interface\s+([a-zA-Z0-9_]+)/))) {
        symbol = { name: match[1], kind: 11 };
      } else if ((match = trimmed.match(/^(?:export\s+)?type\s+([a-zA-Z0-9_]+)\s*=/))) {
        symbol = { name: match[1], kind: 11 };
      } else if ((match = trimmed.match(/^(?:export\s+)?enum\s+([a-zA-Z0-9_]+)/))) {
        symbol = { name: match[1], kind: 10 };
      } else if ((match = trimmed.match(/^(?:public|private|protected)\s+(?:static\s+)?(?:[a-zA-Z0-9_<>[\]]+\s+)?([a-zA-Z0-9_]+)\s*\(/))) {
        symbol = { name: match[1], kind: 6 }; // Java/C# method
      } else if ((match = trimmed.match(/^(?:static\s+)?(?:final\s+)?(?:readonly\s+)?(?:[a-zA-Z0-9_<>[\]]+\s+)?([A-Z][A-Z0-9_]*)\s*=/))) {
        symbol = { name: match[1], kind: 14 }; 
      } else if ((match = trimmed.match(/^namespace\s+([a-zA-Z0-9_]+)/))) {
        symbol = { name: match[1], kind: 3 };
      } else if ((match = trimmed.match(/^struct\s+([a-zA-Z0-9_]+)/))) {
        symbol = { name: match[1], kind: 5 };
      } else if ((match = trimmed.match(/^#define\s+([a-zA-Z0-9_]+)/))) {
        symbol = { name: match[1], kind: 14 };
      } else if ((match = trimmed.match(/^(?:get|set)\s+([a-zA-Z0-9_]+)\s*\(/))) {
        symbol = { name: match[1], kind: 7 };
      } else if (braceDepth > 0 && (match = trimmed.match(/^(?:async\s+)?([a-zA-Z0-9_]+)\s*\([^)]*\)\s*{/))) {
        if (!['if', 'for', 'while', 'switch', 'catch', 'function'].includes(match[1])) {
          symbol = { name: match[1], kind: 6 }; // Method inside class
        }
      }
    }

    if (symbol) {
      symbol.range = { startLineNumber: i + 1 };
      symbol.children = [];
      
      // Keep popping until we find a parent with level < currentLevel
      while (stack.length > 0 && stack[stack.length - 1].level >= currentLevel) {
        stack.pop();
      }
      
      if (stack.length > 0) {
        stack[stack.length - 1].symbol.children.push(symbol);
      } else {
        symbols.push(symbol);
      }
      
      stack.push({ symbol, level: currentLevel });
    }

    // Update brace depth for next lines
    if (['javascript', 'typescript', 'jsx', 'tsx', 'java', 'csharp', 'c', 'cpp', 'rust', 'go', 'css', 'scss', 'less'].includes(lang)) {
       const open = (line.match(/\{/g) || []).length;
       const close = (line.match(/\}/g) || []).length;
       braceDepth += (open - close);
       if (braceDepth < 0) braceDepth = 0;
    }
  }

  return symbols;
}
