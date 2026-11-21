import { AlertTriangle, Compass } from 'lucide-react';
// The shell's stylesheet also holds the two full-screen states, so they stay with its height rules.
import styles from '../App.module.css';

/** Shown while the first board loads. */
export function LoadingScreen() {
  return (
    <div className={styles.loadingScreen}>
      <Compass className="spin-icon" size={38} />
      <h2>Unrolling 1901 Imperial War Atlas...</h2>
    </div>
  );
}

/** Shown when the backend cannot be reached and there is no board to draw. */
export function ErrorScreen({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry: () => void;
}) {
  return (
    <div className={styles.errorScreen}>
      <AlertTriangle size={36} />
      <h2>Backend Connection Required</h2>
      <p>{message}</p>
      <button type="button" onClick={onRetry}>
        Retry Connection
      </button>
    </div>
  );
}
