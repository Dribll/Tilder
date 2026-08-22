import re

with open('src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

media_viewer_code = """
const isBinaryMediaFile = (name) => /\.(png|jpg|jpeg|gif|bmp|webp|svg|ico|pdf|mp4|mp3|wav|webm|mov|avi)$/i.test(name || '');

import { convertFileSrc } from '@tauri-apps/api/core';

function MediaViewer({ tab }) {
  const [src, setSrc] = useState(tab?.blobUrl || null);

  useEffect(() => {
    if (tab?.nativePath) {
      try {
        setSrc(convertFileSrc(tab.nativePath));
      } catch (e) {
        setSrc(http://asset.localhost/);
      }
    } else if (tab?.blobUrl) {
      setSrc(tab.blobUrl);
    }
  }, [tab?.nativePath, tab?.blobUrl]);

  const ext = (tab?.name || '').split('.').pop().toLowerCase();
  const isImage = /^(png|jpg|jpeg|gif|bmp|webp|svg|ico)$/.test(ext);
  const isPdf = ext === 'pdf';
  const isVideo = /^(mp4|webm|mov|avi)$/.test(ext);
  const isAudio = /^(mp3|wav|webm)$/.test(ext);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--tilder-body-bg, #0f172a)', color: 'rgba(255,255,255,0.7)', gap: 16, padding: 24 }}>
      {isImage && src && <img src={src} alt={tab.name} style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: 8, boxShadow: '0 4px 32px rgba(0,0,0,0.5)' }} />}
      {isPdf && src && <iframe src={src} title={tab.name} style={{ width: '100%', height: '80vh', border: 'none', borderRadius: 8 }} />}
      {isVideo && src && <video src={src} controls style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: 8 }} />}
      {isAudio && src && <audio src={src} controls style={{ width: '100%' }} />}
      {!src && <div style={{ textAlign: 'center' }}><span><i className="fa-solid fa-file" style={{ fontSize: 48, opacity: 0.3 }} /></span><p style={{ marginTop: 12, opacity: 0.5 }}>Binary file - {tab?.name}</p></div>}
      {src && <p style={{ fontSize: 11, opacity: 0.4, marginTop: 8 }}>{tab?.nativePath || tab?.path}</p>}
    </div>
  );
}
"""

content = content.replace("const isOfficeFile = (name) => /\.(docx|xlsx|csv|pptx)$/i.test(name || '');", "const isOfficeFile = (name) => /\.(docx|xlsx|csv|pptx)$/i.test(name || '');\n" + media_viewer_code)

# Replace the MonacoEditor fallback with MediaViewer support in 3 places

replacement_pattern = r'''(isOfficeFile\([^)]+\) \?\s*\(\s*<OfficeEditor[^>]+>\s*\)\s*:\s*)(\w+\.type === 'diff')'''
new_pattern = r'''\1isBinaryMediaFile(\2_REPLACE_TAB.name) ? (\n    <MediaViewer tab={\2_REPLACE_TAB} />\n  ) : \2'''

# Actually we need to target the 3 instances specifically. Let's find them manually.
# Instance 1: activeTab
content = re.sub(
    r"(isOfficeFile\(activeTab\.name\) \?\s*\(\s*<OfficeEditor tab=\{activeTab\} onChange=\{handleEditorChange\} />\s*\)\s*:\s*)(activeTab\.type === 'diff')",
    r"\1isBinaryMediaFile(activeTab.name) ? (\n    <MediaViewer tab={activeTab} />\n  ) : \2",
    content
)

# Instance 2: primaryPaneEditorTab
content = re.sub(
    r"(isOfficeFile\(primaryPaneEditorTab\.name\) \?\s*\(\s*<OfficeEditor tab=\{primaryPaneEditorTab\} onChange=\{handleEditorChange\} />\s*\)\s*:\s*)(\(\s*<MonacoEditor)",
    r"\1isBinaryMediaFile(primaryPaneEditorTab.name) ? (\n    <MediaViewer tab={primaryPaneEditorTab} />\n  ) : \2",
    content
)

# Instance 3: paneTab
content = re.sub(
    r"(isOfficeFile\(paneTab\.name\) \?\s*\(\s*<OfficeEditor[^>]+/>\s*\)\s*:\s*)(\(\s*<MonacoEditor)",
    r"\1isBinaryMediaFile(paneTab.name) ? (\n    <MediaViewer tab={paneTab} />\n  ) : \2",
    content
)

with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done!')
