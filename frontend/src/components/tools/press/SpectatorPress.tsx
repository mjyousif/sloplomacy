import { MessagesSquare } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePressState } from '../../../hooks/usePress';
import { useSuggestionState } from '../../../hooks/useSuggestion';
import { pressStore } from '../../../lib/pressStore';
import type { Unit } from '../../../types/diplomacy';
import { buildChannels, PUBLIC_CHANNEL } from '../../../utils/pressHelpers';
import { CollapsibleSection } from '../../ui/CollapsibleSection';
import type { PressSectionProps } from '../PressSection';
import styles from '../PressSection.module.css';
import { PressMessageList } from './PressMessageList';

/**
 * Press while watching a match without a seat: the public box alone, read-only. The server
 * sends a spectator nothing else (no private thread, no backchannel), and an anonymous public
 * author stays hidden until the game is over.
 */
export const SpectatorPress: React.FC<PressSectionProps> = ({
  gameId,
  provinces,
  units,
  participants,
  turn,
  suggestTurn,
  onHighlightProvinces,
  onProvincePicked,
  visible = true,
  variant = 'section',
}) => {
  const press = usePressState();
  const { viewing } = useSuggestionState();
  const [open, setOpen] = useState(true);
  const [onScreen, setOnScreen] = useState(true);
  const listRef = useRef<HTMLDivElement | null>(null);
  const ready = press.gameId === gameId && press.power === null;
  const unitsByProvince = useMemo(() => {
    const byProvince: Record<string, Unit> = {};
    for (const unit of units) {
      if (!unit.is_dislodged) byProvince[unit.province] = unit;
    }
    return byProvince;
  }, [units]);
  const channel = useMemo(
    () =>
      buildChannels(ready ? press.messages : [], null, press.lastRead).find(
        (c) => c.key === PUBLIC_CHANNEL,
      ),
    [ready, press.messages, press.lastRead],
  );
  const messages = channel?.messages ?? [];
  const unread = channel?.unread ?? 0;
  const lastSeq = channel?.lastSeq ?? 0;

  // As for a player: only what is really on screen counts as read.
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) =>
      setOnScreen(entry.isIntersecting),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [open]);
  useEffect(() => {
    if (ready && open && visible && onScreen && lastSeq > 0) {
      pressStore.markRead(PUBLIC_CHANNEL, lastSeq);
    }
  }, [ready, open, visible, onScreen, lastSeq]);

  const content = (
    <div
      className={styles.press}
      data-testid="press-section"
      data-spectating="true"
      data-press-sheet={variant === 'sheet' ? 'true' : undefined}
    >
      <p className={styles.channelCaption} data-testid="press-channel-caption">
        Public press
      </p>
      <PressMessageList
        listRef={listRef}
        messages={messages}
        viewer={null}
        provinces={provinces}
        participants={participants}
        emptyText={
          press.status === 'loading'
            ? 'Reading the dispatches…'
            : press.status === 'error'
              ? 'Press could not be loaded. It will be tried again.'
              : 'No public press yet.'
        }
        onHighlightProvinces={onHighlightProvinces}
        onProvincePicked={onProvincePicked}
        suggestions={{
          unitsByProvince,
          turn,
          boardFree: suggestTurn !== null,
          viewingId: viewing?.id ?? null,
        }}
      />
      <p
        className={styles.destination}
        data-testid="press-destination"
        data-blocked="true"
      >
        You are watching: only the players can send press.
      </p>
    </div>
  );

  if (variant === 'sheet') return content;

  return (
    <CollapsibleSection
      title="PRESS"
      icon={<MessagesSquare size={12} />}
      isOpen={open}
      onToggle={setOpen}
      badge={
        unread > 0 ? (
          <span
            className={styles.unreadBadge}
            data-testid="press-unread-total"
            title={`${unread} unread`}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        ) : undefined
      }
    >
      {content}
    </CollapsibleSection>
  );
};
