import { MessagesSquare } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { sendPress, usePressState } from '../../hooks/usePress';
import { finishedOrders, useSuggestionState } from '../../hooks/useSuggestion';
import { pressStore } from '../../lib/pressStore';
import { suggestionStore } from '../../lib/suggestionStore';
import type {
  GameParticipant,
  Power,
  ProvinceInfo,
  Unit,
} from '../../types/diplomacy';
import {
  BACKCHANNEL,
  buildChannels,
  destinationOf,
  PUBLIC_CHANNEL,
} from '../../utils/pressHelpers';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import styles from './PressSection.module.css';
import { PressChannelTabs } from './press/PressChannelTabs';
import { PressComposer } from './press/PressComposer';
import { PressMessageList } from './press/PressMessageList';
import { PressRecipientBar } from './press/PressRecipientBar';
import { PressSuggestionDraft } from './press/PressSuggestionDraft';
import { channelLabel, listPowers } from './press/pressLabels';
import { SpectatorPress } from './press/SpectatorPress';

export interface PressSectionProps {
  /** The match (never a private sandbox copy's id). */
  gameId: string;
  /** The seat the player writes from; null while watching, which shows the public box alone. */
  power: Power | null;
  /** The player surrendered this seat, so they can read but no longer write. */
  surrendered: boolean;
  provinces: Record<string, ProvinceInfo>;
  /** The units on the live board, which name the units a move suggestion is for. */
  units: Unit[];
  /** Match seats so the mobile recipient strip can disable unclaimed countries. */
  participants?: Record<string, GameParticipant>;
  /** The turn being played, e.g. "Spring 1901 Movement". */
  turn: string;
  /**
   * The same turn while moves can be suggested, shown and taken: a Movement phase of a game
   * still on, with the live board on screen. Null otherwise.
   */
  suggestTurn: string | null;
  onHighlightProvinces: (ids: string[]) => void;
  /** A province link was picked (the phone closes the drawer or sheet to show the map). */
  onProvincePicked?: () => void;
  /** False while the section cannot be seen (a closed drawer or sheet), so nothing is marked read. */
  visible?: boolean;
  /** 'section' sits inside the sidebar's collapsible box; 'sheet' fills the phone Press sheet. */
  variant?: 'section' | 'sheet';
}

const EMPTY_TEXT: Record<string, string> = {
  [PUBLIC_CHANNEL]:
    'No public press yet. Every player reads what is posted here.',
  [BACKCHANNEL]:
    'No anonymous backchannel messages yet. Incoming unsigned notes addressed to you appear here.',
};

/**
 * Press: the public box and private threads of a match. The letter buttons on the Diplomatic
 * Standing rows pick the conversation: none lit is the public box, lit countries are a private
 * thread with exactly those powers. The mask hides the author in whichever one is open;
 * incoming one-to-one anonymous notes land in the receive-only Backchannel inbox. The store
 * (`lib/pressStore`) holds the messages.
 * A signed private thread can also carry a move suggestion: the lamp button starts one, it is
 * written on the map (`lib/suggestionStore` holds the draft) and goes out with the next message.
 */
export const PressSection: React.FC<PressSectionProps> = (props) =>
  props.power === null ? (
    <SpectatorPress {...props} />
  ) : (
    <PlayerPressSection {...props} power={props.power} />
  );

const PlayerPressSection: React.FC<PressSectionProps & { power: Power }> = ({
  gameId,
  power,
  surrendered,
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
  const { draft, viewing } = useSuggestionState();
  const [open, setOpen] = useState(true);
  // A conversation picked from its chip that the recipients do not lead to: (after the game) a
  // thread the player was never in.
  const [browseKey, setBrowseKey] = useState<string | null>(null);
  const recipients = press.recipients;
  const [anonymous, setAnonymous] = useState(false);
  const [text, setText] = useState('');
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
  const activeKey = browseKey ?? destinationOf(recipients, power);
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
  const unreadByThread = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const channel of channels) {
      counts[channel.key] = channel.unread;
    }
    return counts;
  }, [channels]);
  const isSheet = variant === 'sheet';

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
  else if (active.kind === 'backchannel')
    blocked =
      'Select a power in Diplomatic Standing to send an anonymous message.';
  else if (!inOwnThread) blocked = 'You are not in this thread.';

  const sendAnonymous = anonymous;
  let destination = sendAnonymous
    ? 'To everyone, unsigned.'
    : 'To everyone, in the public box.';
  if (recipients.length === 1) {
    destination = sendAnonymous
      ? `Unsigned, to ${listPowers(recipients)} (one-way backchannel).`
      : `Private to ${listPowers(recipients)}.`;
  } else if (recipients.length > 1) {
    destination = sendAnonymous
      ? `Unsigned, to the thread with ${listPowers(recipients)}.`
      : `Private to ${listPowers(recipients)}.`;
  }

  const unitsByProvince = useMemo(() => {
    const byProvince: Record<string, Unit> = {};
    for (const unit of units) {
      if (!unit.is_dislodged) byProvince[unit.province] = unit;
    }
    return byProvince;
  }, [units]);

  // A suggestion is written for one channel (public, signed thread, or 1-to-1 anonymous).
  // Switching countries or toggling the mask into an anonymous group thread discards it.
  const draftIsHere =
    draft !== null &&
    Boolean(draft.anonymous) === sendAnonymous &&
    (!sendAnonymous || recipients.length <= 1) &&
    draft.members.length === recipients.length &&
    draft.members.every((p) => recipients.includes(p));
  useEffect(() => {
    if (draft && !draftIsHere) suggestionStore.clear();
  }, [draft, draftIsHere]);
  const draftOrders = draftIsHere && draft ? Object.values(draft.orders) : [];
  const sendable = finishedOrders(draftIsHere && draft ? draft.orders : {});
  const canSuggest =
    suggestTurn !== null &&
    !blocked &&
    (!sendAnonymous || recipients.length <= 1) &&
    (active.kind === 'public' ||
      (active.kind === 'thread' && recipients.length > 0));
  const startSuggestion = () => {
    if (!draftIsHere && suggestTurn) {
      suggestionStore.startDraft(recipients, suggestTurn, sendAnonymous);
    }
    onProvincePicked?.();
  };

  const handleSend = async () => {
    const body = text.trim();
    if ((!body && sendable.length === 0) || sending || blocked) return;
    setSending(true);
    setError(null);
    try {
      await sendPress(gameId, {
        power,
        recipients,
        anonymous: sendAnonymous,
        body,
        // A plain message is sent exactly as before.
        ...(sendable.length > 0 ? { orders: sendable } : {}),
      });
      if (draftIsHere) suggestionStore.clear();
      setText('');
    } catch (ex) {
      setError(
        ex instanceof Error ? ex.message : 'The message could not be sent.',
      );
    } finally {
      setSending(false);
    }
  };

  const pressContent = (
    <div
      className={styles.press}
      data-testid="press-section"
      data-press-sheet={isSheet ? 'true' : undefined}
    >
      {isSheet && !surrendered && (
        <PressRecipientBar
          viewer={power}
          recipients={recipients}
          participants={participants}
          unreadByThread={unreadByThread}
          onSelectPublic={() => selectChannel(PUBLIC_CHANNEL)}
          onTogglePower={(targetPower) =>
            pressStore.toggleRecipient(targetPower)
          }
        />
      )}
      <PressChannelTabs
        channels={channels}
        activeKey={active.key}
        viewer={power}
        onSelect={selectChannel}
      />
      <p className={styles.channelCaption} data-testid="press-channel-caption">
        {channelLabel(active, power)}
      </p>
      <PressMessageList
        listRef={listRef}
        messages={active.messages}
        viewer={power}
        provinces={provinces}
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
        suggestions={{
          unitsByProvince,
          turn,
          boardFree: suggestTurn !== null,
          viewingId: viewing?.id ?? null,
        }}
      />
      <PressComposer
        plainOnly={surrendered}
        draft={text}
        onDraftChange={setText}
        anonymous={sendAnonymous}
        onAnonymousChange={changeAnonymous}
        destination={destination}
        blocked={blocked}
        sending={sending}
        error={error}
        onSend={handleSend}
        suggest={
          canSuggest || draftIsHere
            ? {
                active: draftIsHere,
                count: sendable.length,
                incomplete: sendable.length < draftOrders.length,
                onStart: startSuggestion,
                attachment: (
                  <PressSuggestionDraft
                    orders={draftOrders}
                    viewer={power}
                    provinces={provinces}
                    unitsByProvince={unitsByProvince}
                    onRemove={suggestionStore.removeOrder}
                    onDiscard={suggestionStore.clear}
                  />
                ),
              }
            : undefined
        }
      />
    </div>
  );

  if (isSheet) return pressContent;

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
      {pressContent}
    </CollapsibleSection>
  );
};
