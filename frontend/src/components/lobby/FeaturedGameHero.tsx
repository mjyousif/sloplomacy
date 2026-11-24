import { Clock, Lock, Play } from 'lucide-react';
import type React from 'react';
import {
  type AuthUser,
  type MultiplayerGameSummary,
  POWER_METADATA,
  type Power,
} from '../../types/diplomacy';
import {
  deadlineLabel,
  describeMyGame,
  finalizedLabel,
  supplyCenterCount,
} from '../../utils/heroGame';
import { Button } from '../ui/Button';
import { PowerFlag } from '../ui/PowerFlag';
import { StatusBadge } from '../ui/StatusBadge';
import styles from './FeaturedGameHero.module.css';
import { GameActionsMenu } from './GameActionsMenu';
import { MiniMap } from './MiniMap';

export interface FeaturedGameHeroProps {
  user: AuthUser;
  /** The player's most pressing game, from `pickHeroGame`. */
  game: MultiplayerGameSummary;
  /** The time the deadline is counted from; passed in so tests can fix it. */
  nowMs?: number;
  onEnterGame: (game: MultiplayerGameSummary, power: Power) => void;
  onOpenSurrenderModal: (game: MultiplayerGameSummary, power: Power) => void;
}

/**
 * The top of the homepage for a player with games: the board of the game that most needs them,
 * beside what it is waiting for and the button back into it.
 */
export const FeaturedGameHero: React.FC<FeaturedGameHeroProps> = ({
  user,
  game,
  nowMs = Date.now(),
  onEnterGame,
  onOpenSurrenderModal,
}) => {
  const copy = describeMyGame(game, user, nowMs);
  const meta = POWER_METADATA[copy.power];
  const live = copy.urgency === 'your-move' || copy.urgency === 'waiting';
  const due = live ? deadlineLabel(game.deadline, nowMs) : null;
  const centers = game.board
    ? supplyCenterCount(game.board.ownership, copy.power)
    : null;

  return (
    <section
      className={styles.hero}
      data-testid="featured-game-hero"
      data-urgency={copy.urgency}
      aria-label={`Your game ${game.name}`}
    >
      <div className={styles.mapPane}>
        <MiniMap
          board={game.board}
          viewerPower={copy.power}
          stripedLand
          label={`Board of ${game.name}`}
        />
        {!game.board && (
          <p className={styles.noBoard} data-testid="hero-no-board">
            The map appears once this game has been opened.
          </p>
        )}
      </div>

      <div className={styles.panel}>
        <StatusBadge status={copy.urgency} size="md" testId="hero-status">
          {copy.status}
        </StatusBadge>
        <h2 className={styles.name} data-testid="hero-game-name">
          {game.name}
          {game.is_private && (
            <span className={styles.privateTag}>
              <Lock size={11} /> Private
            </span>
          )}
        </h2>
        <p className={styles.line}>{copy.turn}</p>
        <p className={styles.line} data-testid="hero-seat">
          <PowerFlag power={copy.power} width={20} height={13} />
          <span>
            {copy.urgency === 'finished' ? 'You were' : 'You are'}{' '}
            {meta.shortName}
            {centers !== null &&
              ` · ${centers} ${centers === 1 ? 'center' : 'centers'}`}
          </span>
        </p>
        {live && (
          <p className={styles.line} data-testid="hero-progress">
            {due && (
              <>
                <Clock size={14} />
                <span>{due} · </span>
              </>
            )}
            <span>{finalizedLabel(game)}</span>
          </p>
        )}

        <div className={styles.actions}>
          <Button
            variant="primary"
            className={styles.enter}
            data-testid="hero-enter-btn"
            onClick={() => onEnterGame(game, copy.power)}
          >
            <Play size={15} />
            <span>{copy.enterLabel}</span>
          </Button>
          <GameActionsMenu
            gameName={game.name}
            leaveLabel={copy.leaveLabel}
            onLeave={() => onOpenSurrenderModal(game, copy.power)}
          />
        </div>
      </div>
    </section>
  );
};
