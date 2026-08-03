import React, { useState, useRef } from "react";

const SIDEBAR_ORDER_KEY = 'tilder-sidebar-order';
const DEFAULT_ORDER = ['explorer', 'search', 'extensions', 'debug', 'tests', 'git', 'github', 'backpack'];

export default function SideBar(props) {
  const [order, setOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SIDEBAR_ORDER_KEY));
      if (Array.isArray(saved) && saved.length === DEFAULT_ORDER.length) {
        return saved;
      }
    } catch {}
    return DEFAULT_ORDER;
  });

  const dragSrcIndex = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  function handleDragStart(e, index) {
    dragSrcIndex.current = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  }

  function handleDragOver(e, index) {
    e.preventDefault();
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  }

  function handleDrop(e, targetIndex) {
    e.preventDefault();
    const src = dragSrcIndex.current;
    if (src === null || src === targetIndex) {
      setDragOverIndex(null);
      return;
    }
    const nextOrder = [...order];
    const [moved] = nextOrder.splice(src, 1);
    nextOrder.splice(targetIndex, 0, moved);
    setOrder(nextOrder);
    setDragOverIndex(null);
    dragSrcIndex.current = null;
    try {
      localStorage.setItem(SIDEBAR_ORDER_KEY, JSON.stringify(nextOrder));
    } catch {}
  }

  const iconDefs = {
    explorer: {
      show: props.showExplorer,
      id: "filepioneer",
      title: "File Pioneer (Ctrl + E)",
      onClick: props.toggleAriaExpandedfilepioneer,
      iconClass: "fa-regular fa-file fa-xl"
    },
    search: {
      show: props.showSearch,
      id: "search",
      title: "Search",
      onClick: props.toggleAriaExpandedsearch,
      iconClass: "fa-solid fa-magnifying-glass fa-xl"
    },

    extensions: {
      show: props.showExtensions,
      id: "extensions",
      title: "Extensions",
      onClick: props.toggleAriaExpandedextensions,
      iconClass: "fa-solid fa-puzzle-piece fa-xl"
    },
    debug: {
      show: props.showDebug,
      id: "debug",
      title: "Debug",
      onClick: props.toggleAriaExpandedebug,
      iconClass: "fa-solid fa-bug-slash fa-xl"
    },
    tests: {
      show: props.showTests,
      id: "testrunner",
      title: "Testing",
      onClick: props.toggleAriaExpandedtestrunner,
      iconClass: "fa-solid fa-flask fa-xl"
    },
    git: {
      show: props.showGit,
      id: "git",
      title: "Source Control",
      onClick: props.toggleAriaExpandedgit,
      iconClass: "fa-brands fa-git-alt fa-xl"
    },
    github: {
      show: props.showGitHub,
      id: "github",
      title: "GitHub",
      onClick: props.toggleAriaExpandedgithub,
      iconClass: "fa-brands fa-github fa-xl"
    },
    backpack: {
      show: props.showBackpack,
      id: "backpack",
      title: "Backpack — Code Snippets",
      onClick: props.toggleAriaExpandedbackpack,
      iconClass: "fa-solid fa-bag-shopping fa-xl"
    }
  };

  return (
    <>
      <div className="sidebar">
        {order.map((key, index) => {
          const def = iconDefs[key];
          if (!def || !def.show) return null;
          return (
            <div
              key={key}
              className="iconWrapper"
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={() => { setDragOverIndex(null); dragSrcIndex.current = null; }}
              style={{
                opacity: dragSrcIndex.current === index ? 0.5 : 1,
                borderTop: dragOverIndex === index ? '2px solid #8fe388' : '2px solid transparent',
                transition: 'border 0.2s ease',
                cursor: 'grab'
              }}
            >
              <div title={def.title} id={def.id} className="sidebaricons" onClick={def.onClick}>
                <i className={def.iconClass}></i>
              </div>
              <span className="sidebarIconBar"></span>
            </div>
          );
        })}
      </div>
    </>
  );
}
