import { Megaphone, VenetianMask } from 'lucide-react';
import type React from 'react';
import type { Power } from '../../../types/diplomacy';
import type { PressChannel } from '../../../utils/pressHelpers';
import { PowerFlag } from '../../ui/PowerFlag';
import styles from '../PressSection.module.css';
import { channelLabel, listPowers } from './pressLabels';

export interface PressChannelTabsProps {
  channels: PressChannel[];
  activeKey: string;
  viewer: Power;
  onSelect: (key: string) => void;
}

/** One chip per conversation: the public box and each private thread. */
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
      const title = channel.kind === 'thread' ? listPowers(shown) : label;
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
          title={title}
          onClick={() => onSelect(channel.key)}
        >
          {channel.kind === 'public' && (
            <>
              <Megaphone size={11} aria-hidden="true" />
              <span>Public</span>
            </>
          )}
          {channel.kind === 'backchannel' && (
            <>
              <VenetianMask size={11} aria-hidden="true" />
              <span>Backchannel</span>
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
