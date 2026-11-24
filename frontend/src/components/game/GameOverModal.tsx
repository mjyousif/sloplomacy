import { BarChart3, Crown, Eye, Handshake, Home, Table, X } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import {
  type AuthUser,
  type CampaignStatsResponse,
  type GameState,
  type MultiplayerGameSummary,
  POWER_METADATA,
  type Power,
  type ProvinceInfo,
} from '../../types/diplomacy';
import { cx } from '../../utils/cx';
import {
  getMyParticipant,
  getSupplyCenterCounts,
} from '../../utils/gameOverHelpers';
import { Modal, ModalCloseButton } from '../modal/Modal';
import { CampaignAwardsRow } from '../stats/CampaignAwardsRow';
import { DiplomaticSupportMatrix } from '../stats/DiplomaticSupportMatrix';
import { StatsOverviewTable } from '../stats/StatsOverviewTable';
import { SupplyCenterTimelineChart } from '../stats/SupplyCenterTimelineChart';
import { useCampaignStats } from '../stats/useCampaignStats';
import { Button } from '../ui/Button';
import { PowerFlag } from '../ui/PowerFlag';
import scrollbarStyles from '../ui/Scrollbars.module.css';
import { SegmentedControl } from '../ui/SegmentedControl';
import styles from './GameOverModal.module.css';

export interface GameOverModalProps {
  isOpen: boolean;
  gameState: GameState;
  provinces: Record<string, ProvinceInfo>;
  summary: MultiplayerGameSummary | null;
  authUser: AuthUser | null;
  viewMode: 'lobby' | 'sandbox' | 'multiplayer';
  onInspectBoard: () => void;
  onReturnToLobby: () => void;
  initialStats?: CampaignStatsResponse | null;
  passcode?: string | null;
}

type WarLedgerTab = 'overview' | 'timeline' | 'diplomacy';

export const GameOverModal: React.FC<GameOverModalProps> = ({
  isOpen,
  gameState,
  provinces,
  summary,
  authUser,
  viewMode,
  onInspectBoard,
  onReturnToLobby,
  initialStats = null,
  passcode = null,
}) => {
  const [activeTab, setActiveTab] = useState<WarLedgerTab>('overview');
  const winner = gameState.winner;
  const { stats, loading } = useCampaignStats(
    gameState,
    provinces,
    summary,
    isOpen && Boolean(winner),
    initialStats,
    passcode,
  );

  if (!isOpen || !winner) return null;

  const winnerMeta = POWER_METADATA[winner];
  const winnerPowerName = winnerMeta.shortName;
  const standings = getSupplyCenterCounts(gameState, provinces);
  const winnerScCount = standings.find((s) => s.power === winner)?.count ?? 18;

  const myParticipant =
    viewMode === 'multiplayer' ? getMyParticipant(summary, authUser) : null;
  const viewerPower: Power | null = myParticipant?.power ?? null;
  const displayName =
    myParticipant?.display_name || authUser?.displayName || 'Envoy';

  const isVictory = viewMode === 'multiplayer' && viewerPower === winner;
  const isParticipantDefeat =
    viewMode === 'multiplayer' &&
    viewerPower !== null &&
    viewerPower !== winner;

  const seasonYear = `${gameState.season} ${gameState.year}`;
  const badgeText = isVictory
    ? `HEGEMONY ACHIEVED · ${seasonYear.toUpperCase()}`
    : `CAMPAIGN CONCLUDED · ${seasonYear.toUpperCase()}`;

  const title = isVictory
    ? 'Continental Hegemony Secured'
    : isParticipantDefeat
      ? `The Chancellery Recognizes ${winnerPowerName}`
      : `${winnerPowerName} Claims Continental Hegemony`;

  const inspectLabel = isParticipantDefeat
    ? 'Review Final Map & History'
    : 'Inspect Final Board';

  return (
    <Modal
      scrim="raised"
      phone="scroll"
      onBackdropClick={onInspectBoard}
      onEscape={onInspectBoard}
      cardClassName={cx(styles.gameOverModalCard, scrollbarStyles.thin)}
      backdropProps={{ 'data-testid': 'game-over-modal-backdrop' }}
      cardProps={{
        'data-testid': 'game-over-modal',
        'data-victory': String(isVictory),
        role: 'dialog',
        'aria-modal': true,
        'aria-labelledby': 'game-over-modal-title',
      }}
    >
      <div className={styles.gameOverModalHeader}>
        <span className={styles.gameOverBadge}>
          <Crown size={14} />
          <span>{badgeText}</span>
        </span>
        <ModalCloseButton
          aria-label="Close Game Over modal"
          onClick={onInspectBoard}
        >
          <X size={18} />
        </ModalCloseButton>
      </div>

      <div className={styles.gameOverHero}>
        <div
          className={styles.gameOverCrest}
          style={{
            borderColor: winnerMeta.color,
            backgroundColor: winnerMeta.lightBg,
          }}
        >
          <PowerFlag power={winner} width={38} height={26} />
        </div>
        <h2 id="game-over-modal-title" className={styles.gameOverTitle}>
          {title}
        </h2>
      </div>

      <p className={styles.gameOverBody}>
        {isVictory ? (
          <>
            Congratulations, Envoy <strong>{displayName}</strong>. Under the
            banner of <strong>{winnerPowerName}</strong>, your General Staff has
            secured <strong>{winnerScCount} supply centers</strong> and
            established undisputed dominion across the European theatre. The
            Chancellery records this campaign in your honor.
          </>
        ) : isParticipantDefeat && viewerPower ? (
          <>
            Envoy <strong>{displayName}</strong>, the instruments of peace have
            been signed. <strong>{winnerPowerName}</strong> has secured{' '}
            <strong>{winnerScCount} supply centers</strong>, bringing the{' '}
            <strong>{seasonYear}</strong> campaign to a close. Though{' '}
            <strong>{POWER_METADATA[viewerPower].shortName}</strong> did not
            claim continental hegemony, your dispatches and maneuvers are
            preserved in the Chancellery archives.
          </>
        ) : (
          <>
            The campaign has concluded in <strong>{seasonYear}</strong>.{' '}
            <strong>{winnerPowerName}</strong> has secured{' '}
            <strong>{winnerScCount} supply centers</strong>, achieving the
            majority threshold required for victory.
          </>
        )}
      </p>

      <CampaignAwardsRow awards={stats.awards} />

      <div className={styles.gameOverLedger}>
        <div className={styles.gameOverLedgerHeader}>
          <SegmentedControl<WarLedgerTab>
            value={activeTab}
            onChange={setActiveTab}
            ariaLabel="Campaign War Ledger views"
            semantics="tabs"
            tone="gold"
            size="md"
            className={styles.gameOverTabs}
            options={[
              {
                value: 'overview',
                label: 'War Ledger & Standings',
                icon: <Table size={14} aria-hidden="true" />,
                testId: 'game-over-tab-overview',
              },
              {
                value: 'timeline',
                label: 'SC Timeline',
                icon: <BarChart3 size={14} aria-hidden="true" />,
                testId: 'game-over-tab-timeline',
              },
              {
                value: 'diplomacy',
                label: 'Diplomatic Matrix',
                icon: <Handshake size={14} aria-hidden="true" />,
                testId: 'game-over-tab-diplomacy',
              },
            ]}
          />
          <span className={styles.gameOverLedgerMeta}>
            {loading
              ? 'Compiling war ledger…'
              : `${stats.turns_resolved} resolved ${stats.turns_resolved === 1 ? 'phase' : 'phases'}`}
          </span>
        </div>

        <div role="tabpanel" aria-busy={loading}>
          {activeTab === 'overview' && (
            <StatsOverviewTable powers={stats.powers} winner={winner} />
          )}
          {activeTab === 'timeline' && (
            <SupplyCenterTimelineChart
              timeline={stats.sc_timeline}
              winner={winner}
            />
          )}
          {activeTab === 'diplomacy' && (
            <DiplomaticSupportMatrix
              powers={stats.powers}
              supportMatrix={stats.support_matrix}
              attackMatrix={stats.attack_matrix}
            />
          )}
        </div>
      </div>

      <div className={styles.gameOverActions}>
        <button
          type="button"
          className={styles.gameOverPrimaryBtn}
          data-testid="game-over-inspect-btn"
          onClick={onInspectBoard}
        >
          <Eye size={15} />
          <span>{inspectLabel}</span>
        </button>
        <Button
          variant="secondary"
          data-testid="game-over-lobby-btn"
          onClick={onReturnToLobby}
        >
          <Home size={15} />
          <span>Return to Chancellery</span>
        </Button>
      </div>
    </Modal>
  );
};
