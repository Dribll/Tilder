import React, { useState, useRef } from "react";

const SIDEBAR_ORDER_KEY = 'tilder-sidebar-order';
const DEFAULT_ORDER = ['explorer', 'search', 'codesearch', 'extensions', 'debug', 'tests', 'git', 'github', 'backpack', 'hardware'];

function normalizeSidebarOrder(savedOrder) {
  if (!Array.isArray(savedOrder)) {
    return DEFAULT_ORDER;
  }

  // Keep old persisted layouts compatible while removing stale or duplicate ids.
  return Array.from(new Set([...savedOrder.filter((id) => DEFAULT_ORDER.includes(id)), ...DEFAULT_ORDER]));
}

export default function SideBar(props) {
  const [order, setOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SIDEBAR_ORDER_KEY));
      if (Array.isArray(saved) && saved.length >= DEFAULT_ORDER.length - 1) {
        return normalizeSidebarOrder(saved);
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

  // Badge counts passed as props from App.jsx
  const badges = {
    git: props.gitChangesCount || 0,
    debug: props.problemsCount || 0,
    extensions: props.extensionUpdatesCount || 0,
  };

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
    hardware: {
      show: true,
      id: "hardware",
      title: "Hardware Manager",
      onClick: props.toggleAriaExpandedhardware,
      iconClass: "fa-solid fa-microchip fa-xl"
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
          const badgeCount = badges[key] || 0;
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
              <div title={def.title} id={def.id} className="sidebaricons" onClick={def.onClick} style={{ position: 'relative' }}>
                <span><i className={def.iconClass}></i></span>
                {badgeCount > 0 && (
                  <span className="sidebar-badge" aria-label={`${badgeCount} notifications`}>
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </div>
              <span className="sidebarIconBar"></span>
            </div>
          );
        })}
      </div>
    </>
  );
}

