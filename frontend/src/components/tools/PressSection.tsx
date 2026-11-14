import { MessagesSquare } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { sendPress, usePressState } from '../../hooks/usePress';
import { pressStore } from '../../lib/pressStore';
import type { Power, ProvinceInfo } from '../../types/diplomacy';
import {
  buildChannels,
  destinationOf,
  NOTES_CHANNEL,
  PUBLIC_CHANNEL,
} from '../../utils/pressHelpers';
import { CollapsibleSection } from '../CollapsibleSection';
import styles from './PressSection.module.css';
import { PressChannelTabs } from './press/PressChannelTabs';
import { PressComposer } from './press/PressComposer';
import { PressMessageList } from './press/PressMessageList';
import { channelLabel, listPowers } from './press/pressLabels';

export interface PressSectionProps {
  /** The match (never a private sandbox copy's id). */
  gameId: string;
  /** The seat the player writes from. */
  power: Power;
  /** The game is over: all press is shown and only the public box stays open. */
  gameOver: boolean;
  /** The player surrendered this seat, so they can read but no longer write. */
  surrendered: boolean;
  provinces: Record<string, ProvinceInfo>;
  onHighlightProvinces: (ids: string[]) => void;
  /** A province link was picked (the phone closes the drawer to show the map). */
  onProvincePicked?: () => void;
  /** False while the section cannot be seen (a closed drawer), so nothing is marked read. */
  visible?: boolean;
}

const EMPTY_TEXT: Record<string, string> = {
  [PUBLIC_CHANNEL]:
    'No public press yet. Every player reads what is posted here.',
  [NOTES_CHANNEL]:
    'Anonymous notes you send or receive appear here. A note cannot be answered.',
};

/**
 * Press: the public box, private threads and anonymous notes of a match. The letter buttons on
 * the Diplomatic Standing rows pick the conversation: none lit is the public box, lit countries
 * are a private thread with exactly those powers, and "anonymously" hides the author (a private
 * anonymous message is a one-way note). The store (`lib/pressStore`) holds the messages.
 */
export const PressSection: React.FC<PressSectionProps> = ({
  gameId,
  power,
  gameOver,
  surrendered,
  provinces,
  onHighlightProvinces,
  onProvincePicked,
  visible = true,
}) => {
  const press = usePressState();
  const [open, setOpen] = useState(true);
  // A conversation picked from its chip that the recipients do not lead to: the notes with
  // nobody picked yet, or (after the game) a thread the player was never in.
  const [browseKey, setBrowseKey] = useState<string | null>(null);
  const recipients = press.recipients;
  const [anonymous, setAnonymous] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onScreen, setOnScreen] = useState(true);
  const listRef = useRef<HTMLDivElement | null>(null);

  const ready = press.gameId === gameId && press.power === power;
  // Picking a country on the standings leads to its conversation, and opens the section.
  // Reset during render, so the list never shows the old conversation for a frame.
  const [seenRecipients, setSeenRecipients] = useState(recipients);
  if (seenRecipients !== recipients) {
    setSeenRecipients(recipients);
    setBrowseKey(null);
    if (recipients.length > 0) setOpen(true);
  }
  const activeKey = browseKey ?? destinationOf(recipients, anonymous, power);
  const channels = useMemo(
    () =>
      buildChannels(
        ready ? press.messages : [],
        power,
        press.lastRead,
        activeKey,
      ),
    [ready, press.messages, press.lastRead, power, activeKey],
  );
  const active = channels.find((c) => c.key === activeKey) ?? channels[0];
  const unread = channels.reduce((sum, c) => sum + c.unread, 0);

  // Only what the player can actually see counts as read: the list may be scrolled out of
  // the sidebar's view, and the section or the drawer may be closed.
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
    if (ready && open && visible && onScreen && active.lastSeq > 0) {
      pressStore.markRead(active.key, active.lastSeq);
    }
  }, [ready, open, visible, onScreen, active.key, active.lastSeq]);

  const selectChannel = (key: string) => {
    const channel = channels.find((c) => c.key === key);
    const mine = channel?.kind === 'thread' && channel.members.includes(power);
    setAnonymous(key === NOTES_CHANNEL);
    pressStore.setRecipients(
      mine ? (channel?.members ?? []).filter((p) => p !== power) : [],
    );
    // Set after the recipients, whose change clears it.
    setSeenRecipients(pressStore.getState().recipients);
    setBrowseKey(mine || key === PUBLIC_CHANNEL ? null : key);
    setError(null);
  };
  const changeAnonymous = (next: boolean) => {
    setAnonymous(next);
    setBrowseKey(null);
    setError(null);
  };

  const inOwnThread =
    active.kind !== 'thread' || active.members.includes(power);
  let blocked: string | null = null;
  if (surrendered)
    blocked = 'You surrendered, so you can read press but not send it.';
  else if (gameOver && active.key !== PUBLIC_CHANNEL)
    blocked =
      'The game is over. Private press is closed and shown to everyone.';
  else if (!inOwnThread) blocked = 'You are not in this thread.';
  else if (active.key === NOTES_CHANNEL && recipients.length === 0)
    blocked = 'Pick who receives the anonymous note on the standings above.';

  let destination = anonymous
    ? 'To everyone, unsigned.'
    : 'To everyone, in the public box.';
  if (recipients.length > 0) {
    destination = anonymous
      ? `Anonymous note to ${listPowers(recipients)}. They cannot reply.`
      : `Private to ${listPowers(recipients)}.`;
  }

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending || blocked) return;
    setSending(true);
    setError(null);
    try {
      await sendPress(gameId, { power, recipients, anonymous, body });
      setDraft('');
    } catch (ex) {
      setError(
        ex instanceof Error ? ex.message : 'The message could not be sent.',
      );
    } finally {
      setSending(false);
    }
  };

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
      <div className={styles.press} data-testid="press-section">
        <PressChannelTabs
          channels={channels}
          activeKey={active.key}
          viewer={power}
          onSelect={selectChannel}
        />
        <p
          className={styles.channelCaption}
          data-testid="press-channel-caption"
        >
          {channelLabel(active, power)}
          {gameOver && active.key !== PUBLIC_CHANNEL && ' (revealed)'}
        </p>
        <PressMessageList
          listRef={listRef}
          messages={active.messages}
          viewer={power}
          provinces={provinces}
          showRecipients={active.key === NOTES_CHANNEL}
          emptyText={
            press.status === 'loading'
              ? 'Reading the dispatches…'
              : press.status === 'error'
                ? 'Press could not be loaded. It will be tried again.'
                : (EMPTY_TEXT[active.key] ??
                  'No messages yet. Only the powers in this thread read it.')
          }
          onHighlightProvinces={onHighlightProvinces}
          onProvincePicked={onProvincePicked}
        />
        <PressComposer
          plainOnly={gameOver || surrendered}
          draft={draft}
          onDraftChange={setDraft}
          anonymous={anonymous}
          onAnonymousChange={changeAnonymous}
          destination={destination}
          blocked={blocked}
          sending={sending}
          error={error}
          onSend={handleSend}
        />
      </div>
    </CollapsibleSection>
  );
};
