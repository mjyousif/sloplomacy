import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import styles from './MapZoomControls.module.css';

interface MapZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  /** Back to the camera's home: the player's own units. */
  onReset: () => void;
}

/** A phone's zoom buttons, on the map: phones have no wheel and the tools rail is out of reach. */
export function MapZoomControls({
  onZoomIn,
  onZoomOut,
  onReset,
}: MapZoomControlsProps) {
  return (
    <div className={styles.mapZoomControls} role="group" aria-label="Map zoom">
      <button
        type="button"
        className={styles.mapZoomBtn}
        aria-label="Zoom in"
        onClick={onZoomIn}
      >
        <ZoomIn size={20} />
      </button>
      <button
        type="button"
        className={styles.mapZoomBtn}
        aria-label="Zoom out"
        onClick={onZoomOut}
      >
        <ZoomOut size={20} />
      </button>
      <button
        type="button"
        className={styles.mapZoomBtn}
        aria-label="Back to my units"
        onClick={onReset}
      >
        <Maximize2 size={18} />
      </button>
    </div>
  );
}
