import { VenetianMask } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef } from 'react';
import {
  POWER_METADATA,
  type Power,
  type PressMessage,
  type ProvinceInfo,
} from '../../../types/diplomacy';
import { sameTurn, splitProvinceRefs } from '../../../utils/pressHelpers';
import { PowerFlag } from '../../PowerFlag';
import styles from '../PressSection.module.css';
import { listPowers, powerName } from './pressLabels';

export interface PressMessageListProps {
  messages: PressMessage[];
  viewer: Power;
  provinces: Record<string, ProvinceInfo>;
  /** Shown when the channel has no messages. */
  emptyText: string;
  /** Names each message's recipients: the notes list mixes notes to different powers. */
  showRecipients: boolean;
  onHighlightProvinces: (ids: string[]) => void;
  /** A province link was tapped or clicked (the phone closes its drawer to show the map). */
  onProvincePicked?: () => void;
  listRef?: React.Ref<HTMLDivElement>;
}

function timeOf(sentAt: string): string {
  const date = new Date(sentAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** A message's text, with each province it names linked to the map. */
const PressBody: React.FC<
  Pick<
    PressMessageListProps,
    'provinces' | 'onHighlightProvinces' | 'onProvincePicked'
  > & { body: string }
> = ({ body, provinces, onHighlightProvinces, onProvincePicked }) => {
  // A picked province stays lit after the pointer leaves, until another is hovered.
  const pinned = useRef(false);
  return (
    <p className={styles.messageBody}>
      {splitProvinceRefs(body, provinces).map((part, i) =>
        part.kind === 'text' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
          <span key={i}>{part.text}</span>
        ) : (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
            key={i}
            type="button"
            className={styles.provinceLink}
            data-testid="press-province-link"
            data-province={part.province}
            title={`Show ${provinces[part.province]?.name ?? part.province} on the map`}
            onPointerEnter={(e) => {
              if (e.pointerType === 'touch') return;
              pinned.current = false;
              onHighlightProvinces([part.province]);
            }}
            onPointerLeave={(e) => {
              if (e.pointerType === 'touch' || pinned.current) return;
              onHighlightProvinces([]);
            }}
            onClick={() => {
              pinned.current = true;
              onHighlightProvinces([part.province]);
              onProvincePicked?.();
            }}
          >
            {part.text}
          </button>
        ),
      )}
    </p>
  );
};

/** The messages of one channel, oldest first, with a divider wherever the turn changes. */
export const PressMessageList: React.FC<PressMessageListProps> = ({
  messages,
  viewer,
  provinces,
  emptyText,
  showRecipients,
  onHighlightProvinces,
  onProvincePicked,
  listRef,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastId = messages.length ? messages[messages.length - 1].id : null;

  // Follow the conversation: a new message, or another channel, shows its newest line.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && lastId !== null) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  return (
    <div
      className={styles.messageList}
      data-testid="press-messages"
      role="log"
      aria-live="polite"
      ref={(el) => {
        scrollRef.current = el;
        if (typeof listRef === 'function') listRef(el);
        else if (listRef) listRef.current = el;
      }}
    >
      {messages.length === 0 && <p className={styles.emptyText}>{emptyText}</p>}
      {messages.map((message, i) => {
        const previous = messages[i - 1];
        const mine = message.sender === viewer;
        const hidden = message.sender === null;
        const color = message.sender
          ? POWER_METADATA[message.sender]?.fillColor
          : undefined;
        return (
          <div key={message.id} className={styles.messageWrap}>
            {(!previous || !sameTurn(previous, message)) && (
              <div className={styles.turnDivider}>
                <span>
                  {message.season} {message.year} · {message.phase}
                </span>
              </div>
            )}
            <article
              className={styles.message}
              data-testid="press-message"
              data-mine={mine ? 'true' : undefined}
              data-anonymous={message.anonymous ? 'true' : undefined}
              style={color ? { borderLeftColor: color } : undefined}
            >
              <header className={styles.messageHeader}>
                <span className={styles.messageAuthor}>
                  {message.sender ? (
                    <PowerFlag
                      power={message.sender}
                      width={17}
                      height={12}
                      aria-hidden="true"
                    />
                  ) : (
                    <VenetianMask size={13} aria-hidden="true" />
                  )}
                  <span data-testid="press-author">
                    {hidden
                      ? 'Anonymous'
                      : mine
                        ? 'You'
                        : powerName(message.sender as Power)}
                  </span>
                  {message.anonymous && !hidden && (
                    <span
                      className={styles.anonymousTag}
                      title="Sent anonymously"
                    >
                      <VenetianMask size={11} aria-hidden="true" />
                      anonymously
                    </span>
                  )}
                </span>
                <time className={styles.messageTime} dateTime={message.sent_at}>
                  {timeOf(message.sent_at)}
                </time>
              </header>
              {showRecipients && message.recipients.length > 0 && (
                <div className={styles.messageRecipients}>
                  to{' '}
                  {listPowers(message.recipients.filter((p) => p !== viewer))}
                  {message.recipients.includes(viewer)
                    ? message.recipients.length > 1
                      ? ' and you'
                      : 'you'
                    : ''}
                </div>
              )}
              <PressBody
                body={message.body}
                provinces={provinces}
                onHighlightProvinces={onHighlightProvinces}
                onProvincePicked={onProvincePicked}
              />
            </article>
          </div>
        );
      })}
    </div>
  );
};
