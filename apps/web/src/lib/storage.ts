export function readStoredBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined" || !window.localStorage) {
    return fallback;
  }

  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

export function writeStoredBoolean(key: string, value: boolean): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Layout preference persistence is optional; the app remains usable without it.
  }
}
