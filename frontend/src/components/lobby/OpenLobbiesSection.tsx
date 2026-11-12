import { Globe, RefreshCw } from 'lucide-react';
import type React from 'react';
import type {
  AuthUser,
  MultiplayerGameSummary,
  Power,
} from '../../types/diplomacy';
import { GameRoomCard } from './GameRoomCard';

export interface OpenLobbiesSectionProps {
  user: AuthUser | null;
  /** The listed games that are not saved sandboxes, one card each. */
  multiplayerLobbies: MultiplayerGameSummary[];
  loadingGames: boolean;
  onRefreshGames: () => void;
  /** Where the Host form sits: "below" on a phone, "on the right" otherwise. */
  hostFormPlace: string;
  joiningKey: string | null;
  handlePowerSlotClick: (
    game: MultiplayerGameSummary,
    power: Power,
  ) => Promise<void>;
  onOpenSurrenderModal: (game: MultiplayerGameSummary, power: Power) => void;
}

/** The open lobbies, each a card where a player picks a country to claim. */
export const OpenLobbiesSection: React.FC<OpenLobbiesSectionProps> = ({
  user,
  multiplayerLobbies,
  loadingGames,
  onRefreshGames,
  hostFormPlace,
  joiningKey,
  handlePowerSlotClick,
  onOpenSurrenderModal,
}) => {
  return (
    <section className="lobby-section">
      <div className="lobby-section-header">
        <div className="lobby-section-title">
          <Globe size={18} />
          <h2>Multiplayer Lobbies — Pick Your Country</h2>
        </div>
        <button
          type="button"
          className="lobby-refresh-btn"
          onClick={onRefreshGames}
          disabled={loadingGames}
        >
          <RefreshCw size={14} className={loadingGames ? 'spin-icon' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="lobby-cards-stack">
        {multiplayerLobbies.length === 0 ? (
          <div className="lobby-empty-box no-lobbies">
            <Globe size={28} className="empty-globe-icon" />
            <div>
              <strong>No Active Campaigns Right Now</strong>
              <p>
                There are no active multiplayer lobbies yet. Host a new public
                or private match {hostFormPlace}, or join a friend&apos;s game
                using their Game ID and passcode!
              </p>
            </div>
          </div>
        ) : (
          multiplayerLobbies.map((game) => (
            <GameRoomCard
              key={game.game_id}
              game={game}
              user={user}
              joiningKey={joiningKey}
              onOpenSurrenderModal={onOpenSurrenderModal}
              handlePowerSlotClick={handlePowerSlotClick}
            />
          ))
        )}
      </div>
    </section>
  );
};
