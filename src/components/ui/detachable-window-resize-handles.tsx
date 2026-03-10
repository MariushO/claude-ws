'use client';

export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null;

const RESIZE_HANDLE_SIZE = 12;

interface ResizeHandlesProps {
  onResizeStart: (direction: ResizeDirection, e: React.MouseEvent) => void;
}

interface CornerHandleConfig {
  direction: ResizeDirection;
  position: string;
  cursor: string;
  gradient: string;
}

const CORNER_HANDLES: CornerHandleConfig[] = [
  {
    direction: 'nw',
    position: 'top-0 left-0',
    cursor: 'cursor-nwse-resize',
    gradient: 'linear-gradient(135deg, hsl(var(--border)) 50%, transparent 50%)',
  },
  {
    direction: 'ne',
    position: 'top-0 right-0',
    cursor: 'cursor-nesw-resize',
    gradient: 'linear-gradient(-135deg, hsl(var(--border)) 50%, transparent 50%)',
  },
  {
    direction: 'sw',
    position: 'bottom-0 left-0',
    cursor: 'cursor-nesw-resize',
    gradient: 'linear-gradient(45deg, hsl(var(--border)) 50%, transparent 50%)',
  },
  {
    direction: 'se',
    position: 'bottom-0 right-0',
    cursor: 'cursor-nwse-resize',
    gradient: 'linear-gradient(-45deg, hsl(var(--border)) 50%, transparent 50%)',
  },
];

interface EdgeHandleConfig {
  direction: ResizeDirection;
  position: string;
  cursor: string;
  style: React.CSSProperties;
}

const EDGE_HANDLES: EdgeHandleConfig[] = [
  {
    direction: 'n',
    position: 'top-0 left-0 right-0',
    cursor: 'cursor-ns-resize',
    style: { height: '8px', marginTop: '-4px', background: 'transparent' },
  },
  {
    direction: 's',
    position: 'bottom-0 left-0 right-0',
    cursor: 'cursor-ns-resize',
    style: { height: '8px', marginBottom: '-4px', background: 'transparent' },
  },
  {
    direction: 'w',
    position: 'top-0 bottom-0 left-0',
    cursor: 'cursor-ew-resize',
    style: { width: '8px', marginLeft: '-4px', background: 'transparent' },
  },
  {
    direction: 'e',
    position: 'top-0 bottom-0 right-0',
    cursor: 'cursor-ew-resize',
    style: { width: '8px', marginRight: '-4px', background: 'transparent' },
  },
];

/** Resize handles for all 4 corners and 4 edges of a detachable window */
export function DetachableWindowResizeHandles({ onResizeStart }: ResizeHandlesProps) {
  return (
    <>
      {CORNER_HANDLES.map(({ direction, position, cursor, gradient }) => (
        <div
          key={direction}
          className={`absolute ${position} ${cursor} hover:opacity-100 opacity-50 transition-opacity`}
          style={{
            width: `${RESIZE_HANDLE_SIZE}px`,
            height: `${RESIZE_HANDLE_SIZE}px`,
            background: gradient,
          }}
          onMouseDown={(e) => onResizeStart(direction, e)}
        />
      ))}
      {EDGE_HANDLES.map(({ direction, position, cursor, style }) => (
        <div
          key={direction}
          className={`absolute ${position} ${cursor} hover:opacity-100 opacity-0 transition-opacity`}
          style={style}
          onMouseDown={(e) => onResizeStart(direction, e)}
        />
      ))}
    </>
  );
}
