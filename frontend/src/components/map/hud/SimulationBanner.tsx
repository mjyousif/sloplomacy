import { Eye, Play } from 'lucide-react';
import styles from './SimulationBanner.module.css';

interface SimulationBannerProps {
  compact: boolean;
  sandboxMode: boolean;
  showSimulationOverlay: boolean;
  onAdjudicateTurn: () => void;
  onClearSimulationOverlay: () => void;
}

/** The strip over the map while a hypothetical outcome is on show. */
export function SimulationBanner({
  compact,
  sandboxMode,
  showSimulationOverlay,
  onAdjudicateTurn,
  onClearSimulationOverlay,
}: SimulationBannerProps) {
  return (
    <div className={styles.simulationMapBanner}>
      <Eye size={16} />
      <span>
        {compact ? (
          // A phone has room for one short line here.
          <>
            <strong>HYPOTHETICAL</strong> · guesses are discarded on exit
          </>
        ) : (
          <>
            <strong>HYPOTHETICAL PLANNING &amp; OUTCOME PREVIEW</strong> —
            Foreign guesses are discarded upon exit
          </>
        )}
      </span>
      <button
        className={styles.simAdvanceBtn}
        onClick={onAdjudicateTurn}
        title="Step forward one phase in Sandbox to plan follow-up turns"
      >
        <Play size={12} /> Step Turn Forward
      </button>
      {showSimulationOverlay && !sandboxMode && (
        <button
          className={styles.simCloseBtn}
          onClick={onClearSimulationOverlay}
        >
          Hide Preview
        </button>
      )}
    </div>
  );
}
