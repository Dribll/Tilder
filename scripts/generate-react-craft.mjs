import fs from 'fs';
import path from 'path';

const PUBLIC_EXTENSIONS_DIR = 'public/extensions/react-craft';
const OUTPUT_FILE = path.join(PUBLIC_EXTENSIONS_DIR, 'main.js');

const VOID_HTML_TAGS = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
const STANDARD_HTML_TAGS = [
  'a', 'abbr', 'address', 'article', 'aside', 'audio', 'b', 'bdi', 'bdo', 'blockquote', 'body', 'button', 'canvas', 'caption', 'cite', 'code', 'colgroup', 'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt', 'em', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'html', 'i', 'iframe', 'ins', 'kbd', 'label', 'legend', 'li', 'main', 'map', 'mark', 'menu', 'meter', 'nav', 'noscript', 'object', 'ol', 'optgroup', 'option', 'output', 'p', 'picture', 'portal', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'script', 'section', 'select', 'small', 'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'u', 'ul', 'var', 'video'
];

const COMPONENT_NAME_PREFIXES = [
  'Auth', 'App', 'Dashboard', 'Data', 'Editor', 'Form', 'Hero', 'Layout', 'List', 'Menu', 'Modal', 'Nav', 'Page', 'Profile', 'Search', 'Settings', 'Sidebar', 'Table', 'User', 'Widget', 'Global', 'Main', 'Header', 'Footer',
  'Admin', 'Account', 'Analytics', 'Asset', 'Billing', 'Blog', 'Calendar', 'Cart', 'Category', 'Chat', 'Checkout', 'Comment', 'Config', 'Contact', 'Content', 'Course', 'Customer', 'Device', 'Document', 'Email', 'Event', 'File', 'Filter', 'Friend', 'Gallery', 'Game', 'Group', 'Help', 'History', 'Home', 'Inventory', 'Invoice', 'Issue', 'Job', 'Label', 'Language', 'Location', 'Log', 'Mail', 'Map', 'Media', 'Message', 'Metric', 'Notification', 'Order', 'Organization', 'Payment', 'Permission', 'Phone', 'Photo', 'Plan', 'Post', 'Product', 'Project', 'Question', 'Report', 'Review', 'Role', 'Schedule', 'Section', 'Session', 'Shop', 'Stat', 'Subscription', 'Tag', 'Task', 'Team', 'Theme', 'Ticket', 'Topic', 'Transaction', 'Utility', 'Vehicle', 'Video', 'Wallet', 'Web'
];

const COMPONENT_NAME_SUFFIXES = [
  'Button', 'Card', 'Container', 'Dialog', 'Dropdown', 'Field', 'Grid', 'Group', 'Icon', 'Input', 'Item', 'Label', 'Link', 'Loader', 'Overlay', 'Panel', 'Popover', 'Provider', 'Row', 'Section', 'Select', 'Wrapper', 'View', 'Controller',
  'Action', 'Alert', 'Avatar', 'Badge', 'Banner', 'Box', 'Breadcrumb', 'Chart', 'Checkbox', 'Chip', 'Collapse', 'Drawer', 'Footer', 'Header', 'Image', 'Info', 'List', 'Menu', 'Modal', 'Nav', 'Pagination', 'Picker', 'Progress', 'Radio', 'Slider', 'Stepper', 'Switch', 'Table', 'Tabs', 'Tag', 'Text', 'Toast', 'Tooltip', 'Tree', 'Upload', 'Video', 'Window', 'Wizard', 'Accordion', 'Autocomplete', 'Calendar', 'Carousel', 'ColorPicker', 'DatePicker', 'Divider', 'Empty', 'Form', 'Layout', 'Loading', 'Message', 'Notification', 'Popconfirm', 'Rate', 'Result', 'Skeleton', 'Space', 'Spin', 'Statistic', 'Timeline', 'Transfer', 'Typography', 'Upload'
];

function generateComponentNames() {
  const names = [];
  for (const prefix of COMPONENT_NAME_PREFIXES) {
    for (const suffix of COMPONENT_NAME_SUFFIXES) {
      names.push(`${prefix}${suffix}`);
    }
  }
  return names;
}

const componentNames = generateComponentNames();

const header = `/**
 * React Craft Extension - Generated Massive Snippet Library
 * Version: 2.0.0
 * Count: Dynamic (10,000+ combinations)
 */

const SHARED_LANGUAGES = ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'];
const JSX_LANGUAGES = ['javascriptreact', 'typescriptreact'];

function createSnippetRegistry() {
  const store = new Map();
  return {
    add: (item) => {
      const languages = item.languages || SHARED_LANGUAGES;
      languages.forEach(lang => {
        if (!store.has(lang)) store.set(lang, []);
        store.get(lang).push(item);
      });
    },
    list: (lang) => store.get(lang) || []
  };
}

function createAliasFamily(label) {
  const lower = label.toLowerCase();
  return [lower, \`react.\${lower}\`, \`rc.\${lower}\`, \`snippet.\${lower}\`].filter(v => v !== lower);
}
`;

const JSX_LANGUAGES = ['javascriptreact', 'typescriptreact'];

const snippetsArray = [];

function createAliasFamily(label) {
  const lower = label.toLowerCase();
  return [lower, `react.${lower}`, `rc.${lower}`, `snippet.${lower}`].filter(v => v !== lower);
}

// Helper to push a snippet
function addSnippet(label, aliases, insertText, detail, languages = null) {
  snippetsArray.push({
    label,
    aliases,
    insertText,
    detail,
    languages
  });
}

// 1. Core ES7+ Compat
const ES7_BASE = [
  // EXPORTS
  ['exp', "export default ${1:moduleName}", 'Export default'],
  ['exd', "export { ${2:destructured} } from '${1:module}'", 'Export destructured'],
  ['exa', "export { ${1:originalName} as ${2:aliasName} } from '${3:module}'", 'Export with alias'],
  ['enf', "export const ${1:functionName} = (${2:params}) => {\n  ${0}\n}", 'Export named function'],
  ['edf', "export default (${1:params}) => {\n  ${0}\n}", 'Export default arrow function'],
  ['edn', "export default function ${1:functionName}(${2:params}) {\n  ${0}\n}", 'Export default named function'],

  // CONSOLE
  ['clg', "console.log(${1:object})", 'console.log'],
  ['clo', "console.log('${1:object}', ${1:object})", 'console.log with name'],
  ['clj', "console.log('${1:object}', JSON.stringify(${1:object}, null, 2))", 'console.log JSON'],
  ['ccl', "console.clear()", 'console.clear'],
  ['cer', "console.error(${1:object})", 'console.error'],
  ['ctr', "console.trace(${1:object})", 'console.trace'],
  ['cwa', "console.warn(${1:object})", 'console.warn'],
  ['cin', "console.info(${1:object})", 'console.info'],
  ['ctl', "console.table(${1:object})", 'console.table'],
  ['cco', "console.count('${1:label}')", 'console.count'],
  ['cti', "console.time('${1:label}')", 'console.time'],
  ['cte', "console.timeEnd('${1:label}')", 'console.timeEnd'],

  // REACT CORE & HOOKS
  ['useState', "const [${1:state}, set${2:State}] = useState(${3:initialState})", 'useState hook'],
  ['useEffect', "useEffect(() => {\n  ${1}\n  return () => {\n    ${2}\n  }\n}, [${3}])", 'useEffect hook'],
  ['useContext', "const ${1:value} = useContext(${2:Context})", 'useContext hook'],
  ['useReducer', "const [state, dispatch] = useReducer(${1:reducer}, ${2:initialState})", 'useReducer hook'],
  ['useCallback', "const ${1:memoizedCallback} = useCallback(() => {\n  ${2}\n}, [${3}])", 'useCallback hook'],
  ['useMemo', "const ${1:memoizedValue} = useMemo(() => ${2:computeExpensiveValue}, [${3}])", 'useMemo hook'],
  ['useRef', "const ${1:refContainer} = useRef(${2:initialValue})", 'useRef hook'],
  ['useImperativeHandle', "useImperativeHandle(${1:ref}, () => ({\n  ${2}\n}), [${3}])", 'useImperativeHandle hook'],
  ['useLayoutEffect', "useLayoutEffect(() => {\n  ${1}\n  return () => {\n    ${2}\n  }\n}, [${3}])", 'useLayoutEffect hook'],
  ['useDebugValue', "useDebugValue(${1:value})", 'useDebugValue hook'],
  ['useId', "const ${1:id} = useId()", 'useId hook'],
  ['useTransition', "const [isPending, startTransition] = useTransition()", 'useTransition hook'],
  ['useDeferredValue', "const deferredValue = useDeferredValue(${1:value})", 'useDeferredValue hook'],
  
  // COMPONENTS (GENERIC)
  ['rfc', "import React from 'react'\n\nexport default function ${1:FileName}() {\n  return (\n    <div>\n      $0\n    </div>\n  )\n}", 'React functional component'],
  ['rfce', "import React from 'react'\n\nfunction ${1:FileName}() {\n  return (\n    <div>\n      $0\n    </div>\n  )\n}\n\nexport default ${1:FileName}", 'React functional component with export'],
  ['rafc', "import React from 'react'\n\nexport const ${1:FileName} = () => {\n  return (\n    <div>\n      $0\n    </div>\n  )\n}", 'React arrow functional component'],
  ['rafic', "import React from 'react'\n\nexport const ${1:FileName} = () => {\n  return (\n    <>\n      $0\n    </>\n  )\n}", 'React fragment arrow functional component'],
  ['rafice', "import React from 'react'\n\nconst ${1:FileName} = () => {\n  return (\n    <>\n      $0\n    </>\n  )\n}\n\nexport default ${1:FileName}", 'React fragment arrow functional component with export'],
  ['rcc', "import React, { Component } from 'react'\n\nexport default class ${1:FileName} extends Component {\n  render() {\n    return (\n      <div>\n        $0\n      </div>\n    )\n  }\n}", 'React class component'],
  ['rce', "import React, { Component } from 'react'\n\nclass ${1:FileName} extends Component {\n  render() {\n    return (\n      <div>\n        $0\n      </div>\n    )\n  }\n}\n\nexport default ${1:FileName}", 'React class component with export'],

  // NEXT.JS (APP ROUTER)
  ['npage', "export default function Page() {\n  return (\n    <main>\n      <h1>${1:Page Title}</h1>\n      $0\n    </main>\n  )\n}", 'Next.js App Router Page'],
  ['nlayout', "export default function Layout({ children }) {\n  return (\n    <section>\n      $0\n      {children}\n    </section>\n  )\n}", 'Next.js App Router Layout'],
  ['nloading', "export default function Loading() {\n  return (\n    <div>Loading...</div>\n  )\n}", 'Next.js App Router Loading'],
  ['nerror', "'use client'\n\nimport { useEffect } from 'react'\n\nexport default function Error({ error, reset }) {\n  useEffect(() => {\n    console.error(error)\n  }, [error])\n\n  return (\n    <div>\n      <h2>Something went wrong!</h2>\n      <button onClick={() => reset()}>Try again</button>\n    </div>\n  )\n}", 'Next.js App Router Error'],
  ['nroute', "import { NextResponse } from 'next/server'\n\nexport async function GET(request) {\n  return NextResponse.json({ message: 'Hello from API' })\n}", 'Next.js API Route (Route Handler)'],

  // REDUX & TOOLKIT
  ['rxslice', "import { createSlice } from '@reduxjs/toolkit'\n\nconst initialState = {\n  value: 0,\n}\n\nexport const ${1:sliceName}Slice = createSlice({\n  name: '${1:sliceName}',\n  initialState,\n  reducers: {\n    ${2:increment}: (state) => {\n      state.value += 1\n    },\n  },\n})\n\nexport const { ${2:increment} } = ${1:sliceName}Slice.actions\nexport default ${1:sliceName}Slice.reducer", 'Redux Toolkit Slice'],
  ['rxaction', "export const ${1:actionName} = (payload) => ({\n  type: ${2:type},\n  payload\n})", 'Redux action'],
  ['rxconst', "export const ${1:actionName} = '${1:actionName}'", 'Redux constant'],
  ['rxreducer', "const initialState = {}\n\nexport default (state = initialState, { type, payload }) => {\n  switch (type) {\n\n  case ${1:typeName}:\n    return { ...state, ...payload }\n\n  default:\n    return state\n  }\n}", 'Redux reducer'],
  ['rxselect', "import { createSelector } from 'reselect'\n\nexport const ${1:selectorName} = state => state.${2:reducerName}", 'Redux selector'],

  // REACT NATIVE
  ['imrn', "import { ${1:View, Text, StyleSheet} } from 'react-native'", 'Import React Native components'],
  ['rnfe', "import React from 'react'\nimport { View, Text, StyleSheet } from 'react-native'\n\nconst ${1:FileName} = () => {\n  return (\n    <View style={styles.container}>\n      <Text>${1:FileName}</Text>\n    </View>\n  )\n}\n\nconst styles = StyleSheet.create({\n  container: {\n    flex: 1,\n    justifyContent: 'center',\n    alignItems: 'center',\n  },\n})\n\nexport default ${1:FileName}", 'React Native functional component'],
  ['rnfes', "import React from 'react'\nimport { View, Text, StyleSheet } from 'react-native'\n\nconst ${1:FileName} = () => {\n  return (\n    <View style={styles.container}>\n      <Text>${1:FileName}</Text>\n    </View>\n  )\n}\n\nexport default ${1:FileName}\n\nconst styles = StyleSheet.create({\n  container: {},\n})", 'React Native functional component with StyleSheet'],

  // PROPTYPES
  ['pta', "PropTypes.array", 'PropTypes array'],
  ['ptar', "PropTypes.array.isRequired", 'PropTypes array required'],
  ['ptb', "PropTypes.bool", 'PropTypes boolean'],
  ['ptbr', "PropTypes.bool.isRequired", 'PropTypes boolean required'],
  ['ptf', "PropTypes.func", 'PropTypes function'],
  ['ptfr', "PropTypes.func.isRequired", 'PropTypes function required'],
  ['ptn', "PropTypes.number", 'PropTypes number'],
  ['ptnr', "PropTypes.number.isRequired", 'PropTypes number required'],
  ['pto', "PropTypes.object", 'PropTypes object'],
  ['ptor', "PropTypes.object.isRequired", 'PropTypes object required'],
  ['pts', "PropTypes.string", 'PropTypes string'],
  ['ptsr', "PropTypes.string.isRequired", 'PropTypes string required'],
  ['ptnd', "PropTypes.node", 'PropTypes node'],
  ['ptndr', "PropTypes.node.isRequired", 'PropTypes node required'],
  ['ptel', "PropTypes.element", 'PropTypes element'],
  ['ptelr', "PropTypes.element.isRequired", 'PropTypes element required'],
  ['pti', "PropTypes.instanceOf(${1:name})", 'PropTypes instanceOf'],
  ['ptir', "PropTypes.instanceOf(${1:name}).isRequired", 'PropTypes instanceOf required'],
  ['pte', "PropTypes.oneOf(['${1:name}'])", 'PropTypes oneOf'],
  ['pter', "PropTypes.oneOf(['${1:name}']).isRequired", 'PropTypes oneOf required'],
  
  // OBJECTS & LOGIC
  ['onv', "Object.values(${1:obj})", 'Object.values'],
  ['onk', "Object.keys(${1:obj})", 'Object.keys'],
  ['one', "Object.entries(${1:obj})", 'Object.entries'],
  ['oni', "Object.assign({}, ${1:obj})", 'Object.assign'],
  ['fre', "${1:array}.forEach(${2:item} => {\n  ${0}\n})", 'Array forEach'],
  ['map', "${1:array}.map(${2:item} => {\n  ${0}\n})", 'Array map'],
  ['filter', "${1:array}.filter(${2:item} => {\n  ${0}\n})", 'Array filter'],
  ['reduce', "${1:array}.reduce((${2:acc}, ${3:curr}) => {\n  ${0}\n}, ${4:initial})", 'Array reduce'],
  ['find', "${1:array}.find(${2:item} => ${3:condition})", 'Array find'],
  ['every', "${1:array}.every(${2:item} => ${3:condition})", 'Array every'],
  ['some', "${1:array}.some(${2:item} => ${3:condition})", 'Array some'],
  ['prom', "new Promise((resolve, reject) => {\n  ${0}\n})", 'New Promise'],
  ['async', "async (${1:params}) => {\n  ${0}\n}", 'Async arrow function'],
  ['await', "await ${1:promise}", 'Await promise'],

  // TESTING (VITEST/JEST)
  ['desc', "describe('${1:description}', () => {\n  ${0}\n})", 'Test describe'],
  ['test', "test('${1:description}', () => {\n  ${0}\n})", 'Test block'],
  ['it', "it('${1:description}', () => {\n  ${0}\n})", 'It block'],
  ['expect', "expect(${1:value}).toBe(${2:expected})", 'Test expectation'],
  ['be', "beforeEach(() => {\n  ${0}\n})", 'Before each'],
  ['ae', "afterEach(() => {\n  ${0}\n})", 'After each'],

  // ZUSTAND & TANSTACK
  ['zus', "import { create } from 'zustand'\n\nconst use${1:Store} = create((set) => ({\n  ${2:state}: ${3:initialValue},\n  set${2:State}: (${2:state}) => set({ ${2:state} }),\n}))\n\nexport default use${1:Store}", 'Zustand store'],
  ['useq', "const { data, isLoading, error } = useQuery(['${1:key}'], () => ${2:fetcher})", 'useQuery hook'],
  ['usem', "const { mutate, isLoading } = useMutation(${1:mutationFn}, {\n  onSuccess: () => {\n    ${0}\n  }\n})", 'useMutation hook'],
];

ES7_BASE.forEach(([label, text, detail]) => {
  addSnippet(label, createAliasFamily(label), text, detail);
});

// 2. Generative HTML/JSX Tags (The "Volume" part)
for (const tag of STANDARD_HTML_TAGS) {
  addSnippet(`<${tag}>`, [`jsx.${tag}`, `${tag}.jsx`], `<${tag}>\n  $0\n</${tag}>`, `JSX ${tag} element`, JSX_LANGUAGES);
  addSnippet(`${tag}.class`, [`${tag}.className`, `jsx.${tag}.class`], `<${tag} className="\${1:className}">\n  $0\n</${tag}>`, `${tag} with className`, JSX_LANGUAGES);
  addSnippet(`${tag}.tw`, [`${tag}.tailwind`], `<${tag} className="\${1:flex items-center}">\n  $0\n</${tag}>`, `${tag} with Tailwind`, JSX_LANGUAGES);
  addSnippet(`${tag}.id`, [`${tag}.id_`], `<${tag} id="\${1:id}">\n  $0\n</${tag}>`, `${tag} with ID`, JSX_LANGUAGES);
  addSnippet(`${tag}.click`, [`${tag}.onClick`], `<${tag} onClick={\${1:() => {}}}>\n  $0\n</${tag}>`, `${tag} with onClick`, JSX_LANGUAGES);
}

for (const tag of VOID_HTML_TAGS) {
  addSnippet(`<${tag}/>`, [`jsx.${tag}`, `${tag}.jsx`], `<${tag} $0 />`, `Self-closing JSX ${tag}`, JSX_LANGUAGES);
}

// 3. Generative Components
for (const name of componentNames) {
  const slug = name.toLowerCase();
  addSnippet(`rfc.${slug}`, [`${slug}.fc`, `react.${name}`], `import React from 'react'\n\nexport default function ${name}() {\n  return (\n    <div>\n      $0\n    </div>\n  );\n}`, `${name} functional component`, JSX_LANGUAGES);
  addSnippet(`rafc.${slug}`, [`${slug}.afc`, `${name}.afc`], `import React from 'react'\n\nexport const ${name} = () => {\n  return (\n    <div>\n      $0\n    </div>\n  );\n};`, `${name} arrow component`, JSX_LANGUAGES);
  addSnippet(`rfic.${slug}`, [`${slug}.rfic`], `import React from 'react'\n\nexport default function ${name}() {\n  return (\n    <>\n      $0\n    </>\n  );\n}`, `${name} fragment component`, JSX_LANGUAGES);
  addSnippet(`rfice.${slug}`, [`${slug}.rfice`], `import React from 'react'\n\nfunction ${name}() {\n  return (\n    <>\n      $0\n    </>\n  );\n}\n\nexport default ${name}`, `${name} fragment component with export`, JSX_LANGUAGES);
  addSnippet(`rafic.${slug}`, [`${slug}.rafic`], `import React from 'react'\n\nexport const ${name} = () => {\n  return (\n    <>\n      $0\n    </>\n  );\n}`, `${name} arrow fragment component`, JSX_LANGUAGES);
  addSnippet(`rafice.${slug}`, [`${slug}.rafice`], `import React from 'react'\n\nconst ${name} = () => {\n  return (\n    <>\n      $0\n    </>\n  );\n}\n\nexport default ${name}`, `${name} arrow fragment component with export`, JSX_LANGUAGES);
  addSnippet(`rmc.${slug}`, [`${slug}.rmc`], `import React, { memo } from 'react'\n\nexport default memo(function ${name}() {\n  return (\n    <div>\n      $0\n    </div>\n  );\n})`, `${name} memo functional component`, JSX_LANGUAGES);
  addSnippet(`rmce.${slug}`, [`${slug}.rmce`], `import React, { memo } from 'react'\n\nconst ${name} = memo(() => {\n  return (\n    <div>\n      $0\n    </div>\n  );\n})\n\nexport default ${name}`, `${name} memo arrow component`, JSX_LANGUAGES);
  addSnippet(`rcc.${slug}`, [`${slug}.rcc`], `import React, { Component } from 'react'\n\nexport default class ${name} extends Component {\n  render() {\n    return (\n      <div>\n        $0\n      </div>\n    );\n  }\n}`, `${name} class component`, JSX_LANGUAGES);
  addSnippet(`rce.${slug}`, [`${slug}.rce`], `import React, { Component } from 'react'\n\nclass ${name} extends Component {\n  render() {\n    return (\n      <div>\n        $0\n      </div>\n    );\n  }\n}\n\nexport default ${name}`, `${name} class component with export`, JSX_LANGUAGES);
  
  // Custom Hooks for every component
  addSnippet(`use${name}`, [`u.${slug}`], `import { useState, useEffect } from 'react'\n\nexport const use${name} = (\${1:initialValue}) => {\n  const [state, setState] = useState(\${1:initialValue})\n\n  useEffect(() => {\n    $0\n  }, [])\n\n  return [state, setState]\n}`, `use${name} custom hook`);

  // Styled/Tailwind variants
  addSnippet(`${name}.tw`, [`${slug}.tw`], `<${name} className="\${1:flex items-center}">\n  $0\n</${name}>`, `${name} with Tailwind`, JSX_LANGUAGES);
  addSnippet(`${name}.css`, [`${slug}.css`], `import styles from './${name}.module.css'\n\nconst ${name} = () => {\n  return (\n    <div className={styles.container}>\n      $0\n    </div>\n  );\n}`, `${name} with CSS Modules`, JSX_LANGUAGES);
}

// 4. Advanced Hook Patterns
const HOOKS = ['useMemo', 'useCallback', 'useRef', 'useContext', 'useReducer', 'useLayoutEffect', 'useId', 'useTransition', 'useDeferredValue'];
HOOKS.forEach(hook => {
  addSnippet(hook, [hook.toLowerCase()], `const \${1:value} = ${hook}(() => {\n  $0\n}, [\${2}])`, `${hook} hook pattern`);
});

// 5. Premium Library Patterns (Framer Motion)
const MOTION_TAGS = ['div', 'span', 'h1', 'h2', 'section', 'button', 'nav', 'ul', 'li'];
MOTION_TAGS.forEach(tag => {
  addSnippet(`motion.${tag}`, [`m.${tag}`], `<motion.${tag}\n  initial={{ opacity: 0, y: 20 }}\n  animate={{ opacity: 1, y: 0 }}\n  transition={{ duration: 0.5 }}\n>\n  $0\n</motion.${tag}>`, `Framer Motion ${tag}`, JSX_LANGUAGES);
});

// 6. Premium Layout Snippets
const LAYOUTS = [
  ['flex.center', 'flex items-center justify-center', 'Centered flexbox'],
  ['flex.col', 'flex flex-col', 'Column flexbox'],
  ['flex.between', 'flex items-center justify-between', 'Space-between flexbox'],
  ['grid.hero', 'grid grid-cols-1 md:grid-cols-2 gap-8 items-center', 'Hero section grid'],
  ['glass', 'bg-white/10 backdrop-blur-md border border-white/20', 'Glassmorphism class'],
  ['shadow.premium', 'shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-sm', 'Premium shadow'],
];

LAYOUTS.forEach(([label, classes, detail]) => {
  addSnippet(label, [`tw.${label}`, `style.${label}`], `<div className="${classes}">\n  $0\n</div>`, detail, JSX_LANGUAGES);
});

// 7. Master Templates
const MASTER_TEMPLATES = [
  {
    label: 'template.auth',
    insertText: `import React, { useState } from 'react';
import { motion } from 'framer-motion';

export default function AuthForm() {
  const [isLogin, setIsLogin] = useState(true);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl"
      >
        <h2 className="mb-6 text-3xl font-bold text-white">
          {isLogin ? 'Welcome Back' : 'Create Account'}
        </h2>
        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400">Email Address</label>
            <input type="email" className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 p-3 text-white outline-none focus:border-purple-500/50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400">Password</label>
            <input type="password" className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 p-3 text-white outline-none focus:border-purple-500/50" />
          </div>
          <button className="w-full rounded-lg bg-purple-600 p-3 font-semibold text-white transition-colors hover:bg-purple-700">
            {isLogin ? 'Sign In' : 'Register'}
          </button>
        </form>
        <button 
          onClick={() => setIsLogin(!isLogin)}
          className="mt-6 text-sm text-zinc-400 hover:text-white"
        >
          {isLogin ? "Don't have an account? Register" : "Already have an account? Login"}
        </button>
      </motion.div>
    </div>
  );
}`,
    detail: 'Full premium Auth Form template with Framer Motion',
  },
  {
    label: 'template.dashboard',
    insertText: `import React from 'react';
import { motion } from 'framer-motion';

export default function DashboardLayout({ children }) {
  return (
    <div className="flex h-screen bg-zinc-950 text-white">
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/10 bg-zinc-900/50 p-6">
        <h1 className="text-2xl font-bold text-purple-500">Tilder</h1>
        <nav className="mt-8 space-y-2">
          {['Overview', 'Projects', 'Analytics', 'Settings'].map(item => (
            <button key={item} className="block w-full rounded-lg px-4 py-2 text-left hover:bg-white/5">
              {item}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-10">
        <header className="mb-10 flex items-center justify-between">
          <h2 className="text-4xl font-bold">Dashboard</h2>
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500" />
          </div>
        </header>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {[1, 2, 3].map(i => (
            <motion.div 
              key={i}
              whileHover={{ y: -5 }}
              className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
            >
              <h3 className="text-zinc-400">Total Revenue</h3>
              <p className="mt-2 text-3xl font-bold">$12,450.00</p>
            </motion.div>
          ))}
        </div>
        <div className="mt-10">
          {children}
        </div>
      </main>
    </div>
  );
}`,
    detail: 'Complete Dashboard Layout template',
  }
];

MASTER_TEMPLATES.forEach(t => addSnippet(t.label, [`t.${t.label.split('.')[1]}`], t.insertText, t.detail, JSX_LANGUAGES));

const body = `
const ALL_SNIPPETS = ${JSON.stringify(snippetsArray, null, 2)};

export async function activate(api) {
  const registry = createSnippetRegistry();
  
  ALL_SNIPPETS.forEach(item => registry.add(item));

  SHARED_LANGUAGES.forEach((languageId) => {
    api.completions.register(languageId, registry.list(languageId));
  });

  api.notifications.info("React Craft activated with " + ALL_SNIPPETS.length.toLocaleString() + " snippets!");
}
`;

if (!fs.existsSync(PUBLIC_EXTENSIONS_DIR)) {
  fs.mkdirSync(PUBLIC_EXTENSIONS_DIR, { recursive: true });
}

fs.writeFileSync(OUTPUT_FILE, header + body);
console.log("Generated " + snippetsArray.length + " snippets to " + OUTPUT_FILE);
