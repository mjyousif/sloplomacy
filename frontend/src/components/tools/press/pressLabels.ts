import type { Power } from '../../../types/diplomacy';
import { formatPowerList } from '../../../utils/powerHelpers';
import {
  BACKCHANNEL,
  type PressChannel,
  PUBLIC_CHANNEL,
} from '../../../utils/pressHelpers';

/** A channel's name in words, for labels and tooltips. */
export function channelLabel(channel: PressChannel, viewer: Power): string {
  if (channel.key === PUBLIC_CHANNEL) return 'Public press';
  if (channel.key === BACKCHANNEL) return 'Anonymous backchannel';
  const others = channel.members.filter((p) => p !== viewer);
  // A thread the player is not in can only be one shown after the game.
  return channel.members.includes(viewer)
    ? `Private thread with ${formatPowerList(others)}`
    : `Private thread between ${formatPowerList(channel.members)}`;
}
