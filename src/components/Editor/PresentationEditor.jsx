// PresentationEditor.jsx
import React, { useState } from 'react';

function PresentationEditor({ initialContent, onChange }) {
  const parseSlides = (content) => {
    if (!content || content.startsWith('data:')) {
      return [{ id: 1, content: '<h1>Slide 1</h1><p>Add your presentation content</p>' }];
    }
    try {
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) && parsed.length ? parsed : [{ id: 1, content: '<h1>Slide 1</h1>' }];
    } catch {
      return [{ id: 1, content: '<h1>Slide 1</h1><p>Add your presentation content</p>' }];
    }
  };

  const [slides, setSlides] = useState(parseSlides(initialContent));
  const [activeSlideId, setActiveSlideId] = useState(slides[0]?.id || 1);

  const activeSlide = slides.find((s) => s.id === activeSlideId) || slides[0];

  const updateSlideContent = (content) => {
    const newSlides = slides.map((s) => (s.id === activeSlideId ? { ...s, content } : s));
    setSlides(newSlides);
    onChange(JSON.stringify(newSlides));
  };

  const addSlide = () => {
    const newId = Math.max(...slides.map((s) => s.id), 0) + 1;
    const newSlides = [...slides, { id: newId, content: `<h1>Slide ${newId}</h1>` }];
    setSlides(newSlides);
    setActiveSlideId(newId);
    onChange(JSON.stringify(newSlides));
  };

  const execCommand = (cmd, arg = null) => {
    document.execCommand(cmd, false, arg);
  };

  return (
    <div className="office-editor presentation">
      <div className="office-toolbar">
        <button className="office-btn primary" onClick={addSlide}>+ New Slide</button>
        <div className="office-divider" />
        <button className="office-btn" onClick={() => execCommand('bold')}><b>B</b></button>
        <button className="office-btn" onClick={() => execCommand('italic')}><i>I</i></button>
        <button className="office-btn" onClick={() => execCommand('underline')}><u>U</u></button>
        <div className="office-divider" />
        <button className="office-btn" onClick={() => execCommand('justifyCenter')}>Center</button>
      </div>
      <div className="office-presentation-layout">
        <div className="office-slide-sidebar">
          {slides.map((slide, index) => (
            <div
              key={slide.id}
              className={`office-slide-thumbnail ${slide.id === activeSlideId ? 'active' : ''}`}
              onClick={() => setActiveSlideId(slide.id)}
            >
              <span className="slide-number">{index + 1}</span>
              <div className="slide-preview" dangerouslySetInnerHTML={{ __html: slide.content }} />
            </div>
          ))}
        </div>
        <div className="office-slide-main">
          <div className="office-slide-canvas-wrapper">
            <div
              key={activeSlideId}
              className="office-slide-canvas"
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => updateSlideContent(e.currentTarget.innerHTML)}
              dangerouslySetInnerHTML={{ __html: activeSlide.content }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default PresentationEditor;
