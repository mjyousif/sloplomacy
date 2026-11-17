import { GripHorizontal, Maximize2, Minus, Plus } from 'lucide-react';
import type React from 'react';
import { useRef, useState } from 'react';
import { cx } from '../../../utils/cx';
import { readMapInsets } from '../hooks/mapInsets';
import styles from './MapCameraBar.module.css';

export type CameraBarCorner =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export interface MapCameraBarProps {
  /** Map viewport container used to clamp and corner-snap the bar within visible bounds. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetCamera: () => void;
}

const EDGE_MARGIN_PX = 14;
const CORNER_SNAP_PX = 36;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * Google-Maps-style floating camera & zoom icon bar overlaid on the map.
 * Dragged from its left grip handle, clamped inside the visible map view, and
 * snaps to the nearest corner when released nearby.
 */
export function MapCameraBar({
  containerRef,
  onZoomIn,
  onZoomOut,
  onResetCamera,
}: MapCameraBarProps) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const [corner, setCorner] = useState<CameraBarCorner>('bottom-right');
  const [freePos, setFreePos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const dragSessionRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    latestPos: { x: number; y: number };
  } | null>(null);

  const handleDragStart = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    const barEl = barRef.current;
    const containerEl = containerRef.current;
    if (!barEl || !containerEl) return;

    const barRect = barEl.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();
    const insets = readMapInsets(containerEl);

    const minX = insets.left + EDGE_MARGIN_PX;
    const maxX = Math.max(
      minX,
      containerRect.width - insets.right - EDGE_MARGIN_PX - barRect.width,
    );
    const minY = EDGE_MARGIN_PX;
    const maxY = Math.max(
      minY,
      containerRect.height - EDGE_MARGIN_PX - barRect.height,
    );

    const originX = clamp(barRect.left - containerRect.left, minX, maxX);
    const originY = clamp(barRect.top - containerRect.top, minY, maxY);

    dragSessionRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX,
      originY,
      minX,
      maxX,
      minY,
      maxY,
      latestPos: { x: originX, y: originY },
    };

    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging(true);
  };

  const handleDragMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    const session = dragSessionRef.current;
    if (!session) return;
    if (
      e.currentTarget.hasPointerCapture &&
      !e.currentTarget.hasPointerCapture(e.pointerId)
    ) {
      return;
    }

    const x = clamp(
      session.originX + (e.clientX - session.startX),
      session.minX,
      session.maxX,
    );
    const y = clamp(
      session.originY + (e.clientY - session.startY),
      session.minY,
      session.maxY,
    );
    session.latestPos = { x, y };
    setFreePos({ x, y });
  };

  const handleDragEnd = () => {
    const session = dragSessionRef.current;
    dragSessionRef.current = null;
    setDragging(false);
    if (!session) return;

    const { latestPos, minX, maxX, minY, maxY } = session;
    const corners: Array<{ name: CameraBarCorner; x: number; y: number }> = [
      { name: 'top-left', x: minX, y: minY },
      { name: 'top-right', x: maxX, y: minY },
      { name: 'bottom-left', x: minX, y: maxY },
      { name: 'bottom-right', x: maxX, y: maxY },
    ];

    let bestCorner: CameraBarCorner | null = null;
    let bestDist = CORNER_SNAP_PX;
    for (const c of corners) {
      const dist = Math.hypot(latestPos.x - c.x, latestPos.y - c.y);
      if (dist <= bestDist) {
        bestDist = dist;
        bestCorner = c.name;
      }
    }

    if (bestCorner) {
      setCorner(bestCorner);
      setFreePos(null);
    }
  };

  const freeStyle = freePos
    ? { left: `${freePos.x}px`, top: `${freePos.y}px` }
    : undefined;

  return (
    <div
      ref={barRef}
      className={styles.mapCameraBar}
      style={freeStyle}
      data-corner={freePos ? undefined : corner}
      data-dragging={dragging ? 'true' : undefined}
      data-testid="map-camera-bar"
      role="group"
      aria-label="Map view and camera controls"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={cx(styles.cameraBtn, styles.fitBtn)}
        onClick={onResetCamera}
        title="Fit Map"
        aria-label="Fit Map"
      >
        <Maximize2 size={14} />
      </button>

      <span className={styles.separator} aria-hidden="true" />

      <button
        type="button"
        className={styles.cameraBtn}
        onClick={onZoomIn}
        title="Zoom In"
        aria-label="Zoom In"
      >
        <Plus size={14} />
      </button>

      <button
        type="button"
        className={styles.cameraBtn}
        onClick={onZoomOut}
        title="Zoom Out"
        aria-label="Zoom Out"
      >
        <Minus size={14} />
      </button>

      <span
        className={styles.dragHandle}
        data-testid="map-camera-drag-handle"
        title="Drag to move camera controls"
        aria-hidden="true"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onLostPointerCapture={handleDragEnd}
      >
        <GripHorizontal size={14} />
      </span>
    </div>
  );
}
