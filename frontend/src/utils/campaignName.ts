/**
 * Default campaign names, used when a host leaves the "Campaign Name" box
 * blank. The name reads "<Player's Name>'s <Adjective> Campaign".
 */
export const CAMPAIGN_ADJECTIVES: readonly string[] = [
  'Ruthless',
  'Gilded',
  'Cunning',
  'Restless',
  'Imperial',
  'Stormy',
  'Treacherous',
  'Grand',
  'Scheming',
  'Daring',
  'Iron',
  'Sleepless',
  'Reckless',
  'Glorious',
  'Shadowy',
  'Relentless',
  'Fateful',
  'Bloodless',
  'Audacious',
  'Cold',
];

/**
 * Build a default campaign name for `displayName`. `rng` returns a number in
 * [0, 1) and is injectable so tests can pick the adjective.
 */
export function defaultCampaignName(
  displayName: string,
  rng: () => number = Math.random,
): string {
  const index = Math.min(
    CAMPAIGN_ADJECTIVES.length - 1,
    Math.floor(rng() * CAMPAIGN_ADJECTIVES.length),
  );
  return `${displayName}'s ${CAMPAIGN_ADJECTIVES[index]} Campaign`;
}
