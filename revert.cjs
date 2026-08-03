const fs = require('fs');
let content = fs.readFileSync('src/App.jsx', 'utf8');

content = content.replace("import OfficeEditor from './components/Editor/OfficeEditor.jsx';\nconst isOfficeFile = (name) => /\\.(docx|xlsx|csv|pptx)$/i.test(name || '');\nimport LivePreview from './components/LivePreview/LivePreview.jsx';", "import LivePreview from './components/LivePreview/LivePreview.jsx';");
content = content.replace("import OfficeEditor from './components/Editor/OfficeEditor.jsx';\nconst isOfficeFile = (name) => /\\.(docx|xlsx|csv|pptx)$/i.test(name || '');", "");


content = content.replace("isOfficeFile(activeTab.name) ? <OfficeEditor tab={activeTab} onChange={handleEditorChange} /> : (isOfficeFile(primaryPaneEditorTab.name) ? <OfficeEditor tab={primaryPaneEditorTab} onChange={handleEditorChange} /> : (isOfficeFile(paneTab.name) ? <OfficeEditor tab={paneTab} onChange={(value) => { workspace.updateTabContent(paneTab.id, value ?? ''); refresh(); queueSave(paneTab.id); }} /> : (<MonacoEditor", "<MonacoEditor");

// There are three closing parens added at the end of the blocks. I'll just remove them.
content = content.replace(/monacoEditorStyle=\{monacoEditorStyle\}\s*\/>\)/g, 'monacoEditorStyle={monacoEditorStyle}\n                        />');
content = content.replace(/monacoEditorStyle=\{splitMonacoEditorStyle\}\s*\/>\)/g, 'monacoEditorStyle={splitMonacoEditorStyle}\n                        />');

fs.writeFileSync('src/App.jsx', content);
