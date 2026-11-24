import { KeyRound, PlusCircle } from 'lucide-react';
import type React from 'react';
import { Button } from '../ui/Button';
import styles from './LobbyActionRow.module.css';

export interface LobbyActionRowProps {
  onHostGame: () => void;
  onJoinWithCode: () => void;
}

/** The two buttons above the game lists that open the Host and Join with code dialogs. */
export const LobbyActionRow: React.FC<LobbyActionRowProps> = ({
  onHostGame,
  onJoinWithCode,
}) => (
  <div className={styles.row} data-testid="lobby-action-row">
    <Button
      variant="secondary"
      className={styles.action}
      onClick={onJoinWithCode}
    >
      <KeyRound size={15} />
      <span>Join with code</span>
    </Button>
    <Button variant="primary" className={styles.action} onClick={onHostGame}>
      <PlusCircle size={16} />
      <span>Host game</span>
    </Button>
  </div>
);
