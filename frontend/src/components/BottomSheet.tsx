import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  clampSheetHeight,
  nearestSnap,
  nextSnap,
  type SheetSnap,
  type SheetSnapHeights,
  snapHeights,
} from '../utils/sheetHelpers';

export interface BottomSheetProps {
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  /** Always visible, under the handle. Its height decides the peek. */
  peek: ReactNode;
  /** Shown as the sheet is pulled up. Scrolls on its own. */
  children: ReactNode;
  label: string;
  testId?: string;
}

/** A finger has to travel this far before a press on the handle counts as a drag, not a tap. */
const HANDLE_DRAG_THRESHOLD = 6;

/** A click this soon after a handled pointer release belongs to that press. */
const POINTER_CLICK_WINDOW_MS = 500;

/** Matches the transition on `.bottom-sheet.sliding` in compact.css. */
const SLIDE_MS = 220;

/**
 * The phone's pull-up panel. It sits at the bottom of the game area with three stops: peek
 * (the handle and `peek` only), half and full. Drag the handle to move it, or tap it to step
 * through the stops.
 *
 * It also leaves a spacer as tall as the peek in the page flow, so whatever sits above it (the
 * map) ends where the peek begins instead of running underneath it.
 */
export function BottomSheet({
  snap,
  onSnapChange,
  peek,
  children,
  label,
  testId,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const [headHeight, setHeadHeight] = useState(0);
  const [dragVisible, setDragVisible] = useState<number | null>(null);
  // The sheet only slides when it moves between stops. Measuring, rotating or loading the page
  // changes its size too, and none of those should play as a slide.
  const [sliding, setSliding] = useState(false);
  const slideTimerRef = useRef<number | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startVisible: number;
    moved: boolean;
    lastY: number;
    lastT: number;
    velocity: number;
  } | null>(null);

  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    const container = sheet?.parentElement;
    const head = headRef.current;
    if (!container || !head) return;
    const measure = () => {
      setContainerHeight(container.clientHeight);
      setHeadHeight(Math.ceil(head.getBoundingClientRect().height));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(head);
    return () => observer.disconnect();
  }, []);

  const slide = useCallback(() => {
    setSliding(true);
    if (slideTimerRef.current !== null)
      window.clearTimeout(slideTimerRef.current);
    slideTimerRef.current = window.setTimeout(() => {
      slideTimerRef.current = null;
      setSliding(false);
    }, SLIDE_MS + 60);
  }, []);

  useEffect(
    () => () => {
      if (slideTimerRef.current !== null)
        window.clearTimeout(slideTimerRef.current);
    },
    [],
  );

  // App can move the sheet too (dropping it to peek while the map waits for a tap).
  const lastSnapRef = useRef(snap);
  useLayoutEffect(() => {
    if (lastSnapRef.current === snap) return;
    lastSnapRef.current = snap;
    slide();
  }, [snap, slide]);

  const heights: SheetSnapHeights = snapHeights(containerHeight, headHeight);
  const settled = heights[snap];
  const visible = dragVisible ?? settled;
  const hidden = Math.max(0, heights.full - visible);
  const settledHidden = Math.max(0, heights.full - settled);

  // When a pointer press last acted, so the click that follows it is ignored. A drag that ends
  // off the handle fires no click, so this is a time, not a flag that could linger.
  const pointerHandledAtRef = useRef(-Infinity);

  const finishDrag = useCallback(
    (cancelled: boolean) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag) return;
      pointerHandledAtRef.current = performance.now();
      if (!drag.moved) {
        setDragVisible(null);
        if (!cancelled) onSnapChange(nextSnap(snap));
        return;
      }
      const lastVisible = clampSheetHeight(
        drag.startVisible + (drag.startY - drag.lastY),
        heights,
      );
      // Slide from where the finger let go, even when it settles back on the same stop.
      slide();
      setDragVisible(null);
      onSnapChange(
        nearestSnap(lastVisible, cancelled ? 0 : drag.velocity, heights),
      );
    },
    [heights, onSnapChange, slide, snap],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startVisible: settled,
      moved: false,
      lastY: event.clientY,
      lastT: event.timeStamp,
      velocity: 0,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (
      !drag.moved &&
      Math.abs(event.clientY - drag.startY) < HANDLE_DRAG_THRESHOLD
    )
      return;
    drag.moved = true;
    const dt = event.timeStamp - drag.lastT;
    if (dt > 0) {
      // Positive while the finger moves up, which grows the sheet.
      drag.velocity = (drag.lastY - event.clientY) / dt;
    }
    drag.lastY = event.clientY;
    drag.lastT = event.timeStamp;
    setDragVisible(
      clampSheetHeight(
        drag.startVisible + (drag.startY - event.clientY),
        heights,
      ),
    );
  };

  const sheetStyle = {
    height: heights.full,
    transform: `translateY(${hidden}px)`,
  } as CSSProperties;

  return (
    <>
      <div
        className="bottom-sheet-spacer"
        style={{ height: heights.peek }}
        aria-hidden="true"
      />
      <section
        ref={sheetRef}
        className={`bottom-sheet ${sliding && dragVisible === null ? 'sliding' : ''}`}
        data-snap={snap}
        data-testid={testId}
        aria-label={label}
        style={sheetStyle}
      >
        <div ref={headRef} className="bottom-sheet-head">
          <button
            type="button"
            className="bottom-sheet-handle"
            data-testid="bottom-sheet-handle"
            aria-label={snap === 'full' ? `Lower ${label}` : `Raise ${label}`}
            aria-expanded={snap !== 'peek'}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={() => finishDrag(false)}
            onPointerCancel={() => finishDrag(true)}
            onClick={() => {
              // A pointer press was handled on release above. Only a keyboard press gets here fresh.
              if (
                performance.now() - pointerHandledAtRef.current <
                POINTER_CLICK_WINDOW_MS
              )
                return;
              onSnapChange(nextSnap(snap));
            }}
          >
            <span className="bottom-sheet-grip" aria-hidden="true" />
          </button>
          <div className="bottom-sheet-peek" data-testid="bottom-sheet-peek">
            {peek}
          </div>
        </div>
        {/* Padding as tall as the part below the screen's edge, so the last card can scroll into
            view. While lowered, the body is off screen, so it is inert: no focus, taps or reading. */}
        <div
          className="bottom-sheet-body"
          data-testid="bottom-sheet-body"
          style={{ paddingBottom: settledHidden }}
          inert={snap === 'peek' && dragVisible === null}
        >
          {children}
        </div>
      </section>
    </>
  );
}
