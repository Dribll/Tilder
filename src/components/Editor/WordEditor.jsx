import React, { useState, useEffect, useRef } from 'react';
import { Editor } from '@tinymce/tinymce-react';
import { setDirectionLTR, setDirectionRTL } from '../../core/editorUtils';

export default function WordEditor({ initialContent, onChange }) {
  const editorRef = useRef(null);
  const [rtl, setRtl] = useState(false);

  // Apply direction after editor mounts
  useEffect(() => {
    const iframe = editorRef.current?.editor?.iframeElement;
    if (iframe) {
      const body = iframe.contentDocument?.body;
      if (body) {
        rtl ? setDirectionRTL(body) : setDirectionLTR(body);
      }
    }
  }, [rtl]);

  const handleEditorChange = (content, editor) => {
    onChange(content);
  };

  return (
    <div className="word-editor">
      <div className="toolbar">
        <button onClick={() => setRtl(prev => !prev)} title="Toggle RTL">
          {rtl ? 'LTR' : 'RTL'}
        </button>
      </div>
      <Editor
        apiKey="no-api-key"
        onInit={(evt, editor) => (editorRef.current = { editor })}
        initialValue={initialContent || '<h1>Untitled Document</h1><p>Start typing...</p>'}
        init={{
          height: 600,
          menubar: false,
          toolbar:
            'undo redo | formatselect | bold italic underline | alignleft aligncenter alignright | bullist numlist outdent indent | removeformat',
          content_style: 'body { font-family: Arial,Helvetica,sans-serif; font-size:14px }',
        }}
        onEditorChange={handleEditorChange}
      />
    </div>
  );
}
