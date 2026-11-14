import { POWER_METADATA, type Power } from '../../../types/diplomacy';
import {
  NOTES_CHANNEL,
  type PressChannel,
  PUBLIC_CHANNEL,
} from '../../../utils/pressHelpers';

export function powerName(power: Power): string {
  return POWER_METADATA[power]?.shortName ?? power;
}

export function listPowers(powers: Power[]): string {
  return powers.map(powerName).join(', ');
}

/** A channel's name in words, for labels and tooltips. */
export function channelLabel(channel: PressChannel, viewer: Power): string {
  if (channel.key === PUBLIC_CHANNEL) return 'Public press';
  if (channel.key === NOTES_CHANNEL) return 'Anonymous notes';
  const others = channel.members.filter((p) => p !== viewer);
  // A thread the player is not in can only be one shown after the game.
  return channel.members.includes(viewer)
    ? `Private thread with ${listPowers(others)}`
    : `Private thread between ${listPowers(channel.members)}`;
}
