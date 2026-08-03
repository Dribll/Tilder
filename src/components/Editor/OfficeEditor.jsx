import React from 'react';
import WordEditor from './WordEditor';
import SpreadsheetEditor from './SpreadsheetEditor';
import PresentationEditor from './PresentationEditor';

export default function OfficeEditor({ tab, onChange }) {
  const extension = String(tab?.name || '').split('.').pop().toLowerCase();

  if (extension === 'docx') {
    return <WordEditor initialContent={tab.content} onChange={onChange} />;
  }
  if (extension === 'xlsx' || extension === 'csv') {
    return <SpreadsheetEditor initialContent={tab.content} onChange={onChange} />;
  }
  if (extension === 'pptx') {
    return <PresentationEditor initialContent={tab.content} onChange={onChange} />;
  }

  return (
    <div className="office-editor unsupported">
      <div className="office-unsupported-message">
        Unsupported office format: {extension}
      </div>
    </div>
  );
}
