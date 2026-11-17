import { FlaskConical, Play } from 'lucide-react';
import type React from 'react';
import type {
  AuthUser,
  MultiplayerGameSummary,
  Power,
} from '../../types/diplomacy';
import { describeMyGame } from '../../utils/heroGame';
import { PowerFlag } from '../ui/PowerFlag';
import { GameActionsMenu } from './GameActionsMenu';
import { MiniMap } from './MiniMap';
import styles from './OtherGamesStrip.module.css';

export interface OtherGamesStripProps {
  user: AuthUser;
  /** The player's games other than the hero's, already in `sortMyGames` order. */
  games: MultiplayerGameSummary[];
  nowMs?: number;
  onEnterGame: (game: MultiplayerGameSummary, power: Power) => void;
  onOpenSurrenderModal: (game: MultiplayerGameSummary, power: Power) => void;
  onEnterSandbox?: () => void;
}

/** The rest of a player's games under the hero: a small map, the status and a way back in. */
export const OtherGamesStrip: React.FC<OtherGamesStripProps> = ({
  user,
  games,
  nowMs = Date.now(),
  onEnterGame,
  onOpenSurrenderModal,
  onEnterSandbox,
}) => {
  if (games.length === 0 && !onEnterSandbox) return null;

  return (
    <section
      className={styles.strip}
      data-testid="other-games-strip"
      aria-label="Your other games"
    >
      <h2 className={styles.heading}>Your other games</h2>
      <div className={styles.cards}>
        {games.map((game) => {
          const copy = describeMyGame(game, user, nowMs);
          return (
            <article
              key={game.game_id}
              className={styles.card}
              data-testid="my-game-card"
              data-urgency={copy.urgency}
            >
              <div className={styles.thumb}>
                {game.is_sandbox && !game.board ? (
                  <FlaskConical size={28} aria-hidden="true" />
                ) : (
                  <MiniMap
                    board={game.board}
                    viewerPower={copy.power}
                    showUnits={false}
                    label={`Board of ${game.name}`}
                  />
                )}
              </div>
              <div className={styles.body}>
                <span
                  className={styles.status}
                  data-status={copy.urgency}
                  data-testid="my-game-status"
                >
                  {copy.status}
                </span>
                <h3 className={styles.name} data-testid="my-game-name">
                  {game.name}
                </h3>
                <p className={styles.meta}>
                  <PowerFlag power={copy.power} width={18} height={12} />
                  <span>{copy.turn}</span>
                </p>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.enter}
                  onClick={() => onEnterGame(game, copy.power)}
                >
                  <Play size={13} />
                  <span>{copy.enterLabel}</span>
                </button>
                <GameActionsMenu
                  gameName={game.name}
                  leaveLabel={copy.leaveLabel}
                  onLeave={() => onOpenSurrenderModal(game, copy.power)}
                />
              </div>
            </article>
          );
        })}
        {onEnterSandbox && (
          <button
            type="button"
            className={styles.sandboxOutline}
            data-testid="open-local-sandbox-card"
            onClick={onEnterSandbox}
          >
            <FlaskConical size={22} aria-hidden="true" />
            <span>Open local sandbox</span>
          </button>
        )}
      </div>
    </section>
  );
};
