const STORAGE_KEY_PREFIX = 'detachable-window-';

export const MIN_WIDTH = 400;
export const MIN_HEIGHT = 300;

export interface StoredWindowData {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowState {
  position: { x: number; y: number };
  size: { width: number; height: number };
}

/** Calculate bottom center position relative to the viewport */
export function getBottomCenterPosition(
  width: number,
  height: number
): { x: number; y: number } {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  return {
    x: (viewportWidth - width) / 2,
    y: viewportHeight - height - 20,
  };
}

/** Load window position and size from localStorage, clamped to viewport bounds */
export function loadWindowData(
  storageKey: string,
  defaultSize: { width: number; height: number }
): WindowState {
  if (typeof window === 'undefined') {
    return {
      position: getBottomCenterPosition(defaultSize.width, defaultSize.height),
      size: defaultSize,
    };
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + storageKey);
    if (saved) {
      const parsed = JSON.parse(saved) as StoredWindowData;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const validWidth = Math.max(MIN_WIDTH, Math.min(parsed.width, viewportWidth));
      const validHeight = Math.max(MIN_HEIGHT, Math.min(parsed.height, viewportHeight));
      const validX = Math.max(0, Math.min(parsed.x, viewportWidth - validWidth));
      const validY = Math.max(0, Math.min(parsed.y, viewportHeight - validHeight));

      return {
        position: { x: validX, y: validY },
        size: { width: validWidth, height: validHeight },
      };
    }
  } catch {
    // Ignore storage errors
  }

  return {
    position: getBottomCenterPosition(defaultSize.width, defaultSize.height),
    size: defaultSize,
  };
}

/** Save window position and size to localStorage */
export function saveWindowData(
  storageKey: string,
  position: { x: number; y: number },
  size: { width: number; height: number }
): void {
  if (typeof window === 'undefined') return;

  try {
    const data: StoredWindowData = {
      x: Math.round(position.x),
      y: Math.round(position.y),
      width: Math.round(size.width),
      height: Math.round(size.height),
    };
    localStorage.setItem(STORAGE_KEY_PREFIX + storageKey, JSON.stringify(data));
  } catch {
    // Ignore storage errors
  }
}
