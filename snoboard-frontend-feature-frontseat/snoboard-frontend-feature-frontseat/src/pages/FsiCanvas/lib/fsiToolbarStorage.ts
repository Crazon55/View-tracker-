const STORAGE_KEY = "fsi-toolbar-expanded";

export function loadToolbarExpanded(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveToolbarExpanded(expanded: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, expanded ? "1" : "0");
  } catch {
    /* ignore */
  }
}
