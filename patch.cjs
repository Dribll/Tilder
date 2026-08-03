const fs = require('fs');
let content = fs.readFileSync('src/App.jsx', 'utf8');

if (!content.includes('import OfficeEditor')) {
  content = content.replace(
    "import MonacoEditor from './components/Editor/MonacoEditor.jsx';",
    "import MonacoEditor from './components/Editor/MonacoEditor.jsx';\nimport OfficeEditor from './components/Editor/OfficeEditor.jsx';\nconst isOfficeFile = (name) => /\\.(docx|xlsx|csv|pptx)$/i.test(name || '');"
  );
}

// Ensure clean revert of any leftover parts if any
// ...

function replaceComponent(regex, officePropTab, officePropOnChange) {
  content = content.replace(regex, (match) => {
    return `isOfficeFile(${officePropTab}.name) ? (\n  <OfficeEditor tab={${officePropTab}} onChange={${officePropOnChange}} />\n) : (\n  ${match}\n)`;
  });
}

// 1. activeTab
const r1 = /<MonacoEditor\s+key={`\$\{activeTab\.id\}:\$\{activeTab\.language\}:\$\{activeTab\.name\}`}[\s\S]*?monacoEditorStyle=\{monacoEditorStyle\}\s*\/>/;
replaceComponent(r1, 'activeTab', 'handleEditorChange');

// 2. primaryPaneEditorTab
const r2 = /<MonacoEditor\s+key={`\$\{primaryPaneEditorTab\.id\}:\$\{primaryPaneEditorTab\.language\}:\$\{primaryPaneEditorTab\.name\}`}[\s\S]*?monacoEditorStyle=\{splitMonacoEditorStyle\}\s*\/>/;
replaceComponent(r2, 'primaryPaneEditorTab', 'handleEditorChange');

// 3. paneTab
const r3 = /<MonacoEditor\s+key={`secondary-\$\{paneIndex\}-\$\{paneTab\.id\}:\$\{paneTab\.language\}:\$\{paneTab\.name\}`}[\s\S]*?monacoEditorStyle=\{splitMonacoEditorStyle\}\s*\/>/;
replaceComponent(r3, 'paneTab', `(value) => { workspace.updateTabContent(paneTab.id, value ?? ''); refresh(); queueSave(paneTab.id); }`);

fs.writeFileSync('src/App.jsx', content);
