import { desktopDetectRuntimes } from './desktopFileApi.js';

let cachedRuntimes = null;
let scanPromise = null;

export async function getDetectedRuntimes() {
  if (cachedRuntimes) return cachedRuntimes;
  
  if (!scanPromise) {
    scanPromise = desktopDetectRuntimes().then(result => {
      cachedRuntimes = result || {};
      return cachedRuntimes;
    });
  }
  
  return scanPromise;
}

export function hasRuntime(language) {
  if (!cachedRuntimes) return false;
  
  // Normalization maps
  const map = {
    'python': ['python'],
    'javascript': ['node'],
    'typescript': ['node'], // Node can run ts if ts-node is installed, but we'll assume node is the runtime
    'java': ['java', 'javac'],
    'rust': ['rust', 'cargo'],
    'c': ['gcc', 'g++'],
    'cpp': ['g++', 'gcc'],
    'go': ['go']
  };
  
  const required = map[language.toLowerCase()];
  if (!required) return false;
  
  return required.some(req => !!cachedRuntimes[req]);
}
