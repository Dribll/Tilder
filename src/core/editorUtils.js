/* src/core/editorUtils.js */
/**
 * Safely dispose Monaco editor resources to avoid "dispose is not a function" errors.
 * This utility checks that the model and editor instances exist before calling dispose.
 */
export function disposeEditorResources(editorInstance) {
  if (!editorInstance) return;
  try {
    const model = editorInstance.getModel?.();
    if (model && typeof model.dispose === 'function') {
      model.dispose();
    }
  } catch (e) {
    console.warn('Failed to dispose model:', e);
  }
  try {
    if (typeof editorInstance.dispose === 'function') {
      editorInstance.dispose();
    }
  } catch (e) {
    console.warn('Failed to dispose editor:', e);
  }
}

/**
 * Helper to enforce LTR direction.
 */
export function setDirectionLTR(element) {
  if (element && element.style) {
    element.style.direction = 'ltr';
  }
}

/**
 * Helper to enforce RTL direction.
 */
export function setDirectionRTL(element) {
  if (element && element.style) {
    element.style.direction = 'rtl';
  }
}
