// native_drop.rs — intentionally empty.
// External OS file drops are now handled via Tauri's built-in drag-drop
// handler (tauri://drag-drop event).  The `disable_drag_drop_handler()`
// call was removed from lib.rs so WRY registers its own IDropTarget on the
// WebView2 HWND, which emits tauri://drag-drop with absolute file paths.
// Internal HTML5 drag-and-drop is handled entirely by WebView2's renderer
// process and is not affected by the OLE IDropTarget registration.
#![cfg(target_os = "windows")]
