import { Megaphone, VenetianMask } from 'lucide-react';
import type React from 'react';
import type { Power } from '../../../types/diplomacy';
import type { PressChannel } from '../../../utils/pressHelpers';
import { PowerFlag } from '../../PowerFlag';
import styles from '../PressSection.module.css';
import { channelLabel } from './pressLabels';

export interface PressChannelTabsProps {
  channels: PressChannel[];
  activeKey: string;
  viewer: Power;
  onSelect: (key: string) => void;
}

/** One chip per conversation: the public box, each private thread, and the anonymous notes. */
export const PressChannelTabs: React.FC<PressChannelTabsProps> = ({
  channels,
  activeKey,
  viewer,
  onSelect,
}) => (
  <div className={styles.channelTabs} role="tablist" aria-label="Conversations">
    {channels.map((channel) => {
      const label = channelLabel(channel, viewer);
      const shown = channel.members.includes(viewer)
        ? channel.members.filter((p) => p !== viewer)
        : channel.members;
      return (
        <button
          key={channel.key}
          type="button"
          role="tab"
          className={styles.channelTab}
          data-testid={`press-channel-${channel.key}`}
          data-active={channel.key === activeKey ? 'true' : undefined}
          data-kind={channel.kind}
          aria-selected={channel.key === activeKey}
          aria-label={
            channel.unread ? `${label}, ${channel.unread} unread` : label
          }
          title={label}
          onClick={() => onSelect(channel.key)}
        >
          {channel.kind === 'public' && (
            <>
              <Megaphone size={11} aria-hidden="true" />
              <span>Public</span>
            </>
          )}
          {channel.kind === 'notes' && (
            <>
              <VenetianMask size={12} aria-hidden="true" />
              <span>Notes</span>
            </>
          )}
          {channel.kind === 'thread' &&
            shown.map((power) => (
              <PowerFlag
                key={power}
                power={power}
                width={17}
                height={12}
                aria-hidden="true"
              />
            ))}
          {channel.unread > 0 && (
            <span className={styles.unreadBadge} data-testid="press-unread">
              {channel.unread > 99 ? '99+' : channel.unread}
            </span>
          )}
        </button>
      );
    })}
  </div>
);
