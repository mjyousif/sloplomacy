import type { Power } from '../types/diplomacy';

/**
 * Spring 1901 openings, gathered from the Opening Strategy articles of the UK Diplomacy Zine
 * Archive (https://diplomacyzines.co.uk/?page_id=1771) and the Library of Diplomacy Openings
 * (https://diplom.org/Online/Openings/textversion/). Where the two name an opening differently,
 * the zine name is used. The names are the hobby's own (mostly Richard Sharp's); the strengths and weaknesses are short summaries in our own words, and each
 * opening links the articles it came from, as the archive asks.
 *
 * Orders are written the way the adjudicator writes them (`A VEN - TYR`, `F STP/SC - BOT`,
 * `A MAR S A PAR - BUR`, `A VEN H`). `utils/openings.ts` turns them into real orders for the
 * units on the board. An opening may leave a unit out when its article does.
 *
 * `popularity` is the share of recorded games that used it: UK postal games as the zine articles
 * quote them, or the Library's online games for an opening only it lists; null where neither gives one.
 */

export interface OpeningSource {
  title: string;
  author: string;
  url: string;
}

/**
 * How an opening plays, one of a small fixed set so every tag covers several openings:
 * the common, unremarkable line (`standard`); one that guards home first (`defensive`); one
 * that keeps choices open or shows little (`flexible`); one that strikes at a neighbour
 * (`aggressive`); and one that gives something up or takes a big risk for position (`gambit`).
 */
export type OpeningApproach =
  | 'standard'
  | 'defensive'
  | 'flexible'
  | 'aggressive'
  | 'gambit';

export const OPENING_APPROACHES: OpeningApproach[] = [
  'standard',
  'defensive',
  'flexible',
  'aggressive',
  'gambit',
];

/** A power the opening is aimed against, or works with. */
export interface OpeningRelation {
  kind: 'against' | 'with';
  power: Power;
}

export interface Opening {
  id: string;
  power: Power;
  name: string;
  orders: string[];
  approach: OpeningApproach;
  relations: OpeningRelation[];
  popularity: number | null;
  strengths: string[];
  weaknesses: string[];
  /** What the opening does in the autumn, when its spring is the same as another's. */
  followUp?: string;
  sources: OpeningSource[];
}

const ARCHIVE = 'https://diplomacyzines.co.uk/?page_id=';
const src = (id: number, title: string, author: string): OpeningSource => ({
  title,
  author,
  url: `${ARCHIVE}${id}`,
});

const SHARP_NAMES = src(2205, 'Naming the Openings', 'Richard Sharp');
/** A country's page of the Library of Diplomacy Openings (The Diplomatic Pouch). */
const diplomLibrary = (country: string): OpeningSource => ({
  title: `Library of Diplomacy Openings: ${country}`,
  author: 'The Diplomatic Pouch',
  url: `https://diplom.org/Online/Openings/textversion/${country}.html`,
});
const AGAR_ENGLAND = src(2136, 'English Opening Strategy', 'Stephen Agar');
const AGAR_ENGLAND_VIEW = src(
  2133,
  'England – A Personal View on Opening Strategy',
  'Stephen Agar',
);
const HUCKNALL_ENGLAND = src(
  2165,
  'An Introduction to English Opening Strategy',
  'Richard Hucknall',
);
const HUCKNALL_FRANCE = src(
  2167,
  'An Introduction to French Opening Strategy',
  'Richard Hucknall',
);
const HUCKNALL_GERMANY = src(
  2170,
  'An Introduction to German Opening Strategy',
  'Richard Hucknall',
);
const HUCKNALL_ITALY = src(
  2173,
  'An Introduction to Italian Opening Strategy',
  'Richard Hucknall',
);
const HUCKNALL_AUSTRIA = src(
  2163,
  'An Introduction to Austrian Opening Strategy',
  'Richard Hucknall',
);
const HUCKNALL_TURKEY = src(
  2179,
  'An Introduction to Turkish Opening Strategy',
  'Richard Hucknall',
);
const IBERIAN_GAMBIT = src(2154, 'The Iberian Gambit', 'Chris Warren');
const BURGUNDY_1901 = src(2131, 'Burgundy, 1901', 'Bruce Linsey');
const AGAR_GERMANY = src(
  2144,
  'Germany – A Personal View on Opening Strategy',
  'Stephen Agar',
);
const AGAR_ITALY = src(
  2185,
  'Italy – A Personal View On Opening Strategy',
  'Stephen Agar',
);
const ALPINE_CHICKEN = src(
  2124,
  'Is The Alpine Chicken A Tasty Bird?',
  'Stephen Agar',
);
const ITALIAN_ATTACK_FRANCE = src(
  2182,
  'The Italian Attack Against France',
  'Michael Adams',
);
const HEDGEHOG = src(2147, 'The Hedgehog', 'Richard Sharp');
const HEDGEHOG_HUCKNALL = src(
  2149,
  'The Hedgehog: An Asset or a Liability for Austria?',
  'Richard Hucknall',
);
const AGAR_RUSSIA = src(
  2212,
  'Russia – A Personal View on Opening Strategy',
  'Stephen Agar',
);
const BLACK_SEA = src(1721, 'Black Sea Strategy', 'Stephen Agar');
const OCTOPUS = src(2207, 'The Octopus', 'Richard Sharp');
const BULGARIAN_GAMBIT = src(2127, 'The Bulgarian Gambit', 'Doug Beyerlein');
const TURKISH_HEDGEHOG = src(2224, 'The Turkish Hedgehog', 'Nicholas Whyte');

export const OPENINGS: Opening[] = [
  // ENGLAND
  {
    id: 'eng-northern-yorkshire',
    power: 'ENGLAND',
    name: 'Northern Opening, Yorkshire Variation',
    orders: ['F LON - NTH', 'F EDI - NWG', 'A LVP - YOR'],
    approach: 'standard',
    relations: [],
    popularity: 39.1,
    strengths: [
      'The only English start that guarantees a build: Norway falls with support whatever Russia does',
      'The army in Yorkshire can still cover London if France slips into the Channel',
      'Holds both northern seas and commits to no one, buying time to choose an ally',
    ],
    weaknesses: [
      'Passive: France gets the Channel and Mid-Atlantic for free, and England can stall at four or five centres',
      'Settles nothing in Scandinavia; expect to bargain with Germany and Russia from 1902',
    ],
    sources: [AGAR_ENGLAND, SHARP_NAMES, HUCKNALL_ENGLAND],
  },
  {
    id: 'eng-belgian-yorkshire',
    power: 'ENGLAND',
    name: 'Belgian Opening, Yorkshire Variation',
    orders: ['F LON - ENG', 'F EDI - NTH', 'A LVP - YOR'],
    approach: 'flexible',
    relations: [],
    popularity: 23.5,
    strengths: [
      'Claims the Channel early, the key to any later move on France or the Mid-Atlantic',
      'In the fall the two fleets can take Belgium together, or the North Sea fleet can take Norway alone',
      'The army stays in Yorkshire, so no convoy threatens France: less hostile than it looks',
    ],
    weaknesses: [
      'Any fleet next to Brest makes France nervous, whatever you tell them',
      'A bounce in the Channel is the worst case: London’s fleet stays home and Norway goes unsupported',
    ],
    sources: [AGAR_ENGLAND, SHARP_NAMES],
  },
  {
    id: 'eng-northern-edinburgh',
    power: 'ENGLAND',
    name: 'Northern Opening, Edinburgh Variation',
    orders: ['F LON - NTH', 'F EDI - NWG', 'A LVP - EDI'],
    approach: 'aggressive',
    relations: [{ kind: 'against', power: 'RUSSIA' }],
    popularity: 22.6,
    strengths: [
      'Norway can be taken by an army through convoy, freeing the North Sea fleet for Belgium or Denmark',
      'An army in Norway is the start of a real campaign against St Petersburg',
    ],
    weaknesses: [
      'Reads as the most anti-Russian English opening',
      'London has no cover if France takes the Channel',
    ],
    sources: [AGAR_ENGLAND, SHARP_NAMES],
  },
  {
    id: 'eng-french-attack',
    power: 'ENGLAND',
    name: 'French Attack',
    orders: ['F LON - ENG', 'F EDI - NTH', 'A LVP - WAL'],
    approach: 'aggressive',
    relations: [{ kind: 'against', power: 'FRANCE' }],
    popularity: 7.0,
    strengths: [
      'England’s most committed opening against France: a landing in Brest or Picardy is on in fall',
      'Gets an army onto the continent early, which England has to do eventually to win',
    ],
    weaknesses: [
      'A guess: if France keeps Brest covered, the convoy fails and France builds another fleet',
      'Needs Germany on side, or the North Sea is exposed once the fleet heads for Norway',
    ],
    sources: [AGAR_ENGLAND_VIEW, AGAR_ENGLAND, SHARP_NAMES],
  },
  {
    id: 'eng-splits',
    power: 'ENGLAND',
    name: 'The Splits, Edinburgh Variation',
    orders: ['F EDI - NWG', 'F LON - ENG', 'A LVP - EDI'],
    approach: 'flexible',
    relations: [],
    popularity: 1.3,
    strengths: [
      'Guards against France in the Channel and keeps the northern approach in the Norwegian Sea',
      'The army can still be convoyed to Norway',
    ],
    weaknesses: [
      'Leaves the North Sea, England’s most important water, open to Germany',
      'Spreads three units thin with no supported move anywhere',
    ],
    sources: [SHARP_NAMES],
  },

  // FRANCE
  {
    id: 'fra-maginot',
    power: 'FRANCE',
    name: 'Maginot Opening',
    orders: ['F BRE - MAO', 'A PAR - BUR', 'A MAR S A PAR - BUR'],
    approach: 'defensive',
    relations: [{ kind: 'against', power: 'GERMANY' }],
    popularity: 23.1,
    strengths: [
      'Burgundy cannot be taken from you: Germany gets nowhere near Paris or Marseilles',
      'From Burgundy, France leans on Munich and Belgium at the same time',
    ],
    weaknesses: [
      'Spain waits for the fall, and Marseilles empties just as Italy might arrive',
      'Germany sees a supported move next to Munich as a declaration',
    ],
    sources: [SHARP_NAMES, IBERIAN_GAMBIT, BURGUNDY_1901],
  },
  {
    id: 'fra-burgundy',
    power: 'FRANCE',
    name: 'Burgundy Opening',
    orders: ['F BRE - MAO', 'A PAR - BUR', 'A MAR - SPA'],
    approach: 'standard',
    relations: [],
    popularity: 13.4,
    strengths: [
      'Shuts the door on a German stab and still takes Spain in spring',
      'Both Iberian centres are routine in the fall',
    ],
    weaknesses: [
      'If Germany also tries Burgundy, the bounce leaves Paris stuck and Burgundy contested again',
      'Marseilles is empty if Italy goes to Piedmont',
    ],
    sources: [SHARP_NAMES, IBERIAN_GAMBIT, BURGUNDY_1901],
  },
  {
    id: 'fra-picardy',
    power: 'FRANCE',
    name: 'Picardy Opening',
    orders: ['F BRE - MAO', 'A PAR - PIC', 'A MAR - SPA'],
    approach: 'flexible',
    relations: [{ kind: 'with', power: 'GERMANY' }],
    popularity: 13.4,
    strengths: [
      'A quiet offer to Germany: Burgundy stays empty, but Picardy keeps a say in Belgium',
      'Both Iberian centres stay in reach',
      'Fits a Franco-German alliance, which tends to hold up well once England is gone',
    ],
    weaknesses: [
      'Trusts Germany completely: Paris and Marseilles are empty and A MUN-BUR walks in',
      'Often forces France to declare its hand over Belgium in the fall',
    ],
    sources: [SHARP_NAMES, IBERIAN_GAMBIT],
  },
  {
    id: 'fra-english-attack',
    power: 'FRANCE',
    name: 'English Attack',
    orders: ['F BRE - ENG', 'A PAR - PIC', 'A MAR - SPA'],
    approach: 'aggressive',
    relations: [{ kind: 'against', power: 'ENGLAND' }],
    popularity: 7.2,
    strengths: [
      'Takes the Channel before England can and threatens a landing in London or Wales',
      'Strongest when Germany is also moving against England',
    ],
    weaknesses: [
      'Telegraphs the attack; England will look for allies at once',
      'The fleet is away from Iberia, so Portugal waits until 1902',
    ],
    sources: [
      SHARP_NAMES,
      src(2217, 'Sacrifice Openings in Diplomacy', 'Nicky Palmer'),
    ],
  },
  {
    id: 'fra-belgian-gambit',
    power: 'FRANCE',
    name: 'Belgian Gambit',
    orders: ['F BRE - MAO', 'A PAR - PIC', 'A MAR - BUR'],
    approach: 'gambit',
    relations: [],
    popularity: 5.9,
    strengths: [
      'If Marseilles reaches Burgundy, two armies border Belgium and France is the favourite to take it',
      'If Germany also moves to Burgundy, the bounce keeps its army in Munich, the usual point of an agreed stand-off',
    ],
    weaknesses: [
      'Risks ending 1901 with a single build for a contested prize',
      'Paris and Marseilles are both empty, so an Italian army in Piedmont is a real problem',
    ],
    sources: [SHARP_NAMES, HUCKNALL_FRANCE],
  },
  {
    id: 'fra-gascony',
    power: 'FRANCE',
    name: 'Gascony Opening (Iberian Gambit)',
    orders: ['F BRE - MAO', 'A PAR - GAS', 'A MAR - SPA'],
    approach: 'flexible',
    relations: [],
    popularity: null,
    strengths: [
      'Gascony touches all three home centres, so one army can cover whichever is threatened',
      'The armies take Iberia, leaving the fleet free to turn on England or Italy in 1902',
      'Threatens no one in spring and keeps every alliance open',
    ],
    weaknesses: [
      'Leaves Burgundy open, so it only works with a friendly Germany',
      'Both armies spend 1902 in Iberia, a tempting moment for Germany',
    ],
    followUp:
      'The Lisbon Leapfrog plays the same spring, then convoys A GAS to Portugal in the autumn.',
    sources: [
      IBERIAN_GAMBIT,
      src(2157, 'The Iberian Indecision', 'Gregory M. Ellis'),
      src(2199, 'The Lisbon Leapfrog', 'Mark Berch'),
    ],
  },

  {
    id: 'fra-picardy-marseilles-holds',
    power: 'FRANCE',
    name: 'Picardy Opening, Marseilles Holds',
    orders: ['F BRE - MAO', 'A PAR - PIC', 'A MAR H'],
    approach: 'defensive',
    relations: [],
    popularity: 6.2,
    strengths: [
      'Marseilles stays occupied, so an Italian army in Piedmont gets nothing',
      'Picardy keeps a say in Belgium and can fall back to cover Paris or Brest',
    ],
    weaknesses: [
      'Only one Iberian centre is in reach this year, for the fleet',
      'Burgundy is open to Germany and Paris is empty',
    ],
    sources: [diplomLibrary('France')],
  },
  // GERMANY
  {
    id: 'ger-blitz-danish',
    power: 'GERMANY',
    name: 'Blitzkrieg Opening, Danish Variation',
    orders: ['F KIE - DEN', 'A BER - KIE', 'A MUN - RUH'],
    approach: 'standard',
    relations: [],
    popularity: 34.9,
    strengths: [
      'Denmark and Holland are near-certain, and the Danish fleet decides whether Russia gets Sweden',
      'Ruhr gives a voice in Belgium without threatening France',
    ],
    weaknesses: [
      'Munich is empty; a French army in Burgundy is one move from it',
      'So standard that it gains nothing extra; the real decisions come in the fall',
    ],
    sources: [SHARP_NAMES, AGAR_GERMANY, HUCKNALL_GERMANY],
  },
  {
    id: 'ger-jutland',
    power: 'GERMANY',
    name: 'Jutland Gambit',
    orders: ['F KIE - DEN', 'A BER - KIE', 'A MUN - RUH'],
    approach: 'gambit',
    relations: [],
    popularity: null,
    strengths: [
      'Looks entirely standard in spring, then turns north in the fall',
      'Keeps England and Russia guessing which of them is the target, and can be sold to each as aimed at the other',
    ],
    weaknesses: [
      'Deliberately passes up a third build',
      'Only safe while France is quiet: the west is lightly held',
    ],
    followUp:
      'In the autumn: F DEN - SKA, A KIE - DEN, A RUH - HOL, then build F KIE.',
    sources: [
      src(2188, 'The Jutland Gambit', 'Edi Birsan'),
      src(2142, 'German Variations', 'Geoff Challinger'),
    ],
  },
  {
    id: 'ger-danish-burgundy',
    power: 'GERMANY',
    name: 'Burgundy Opening, Danish Variation',
    orders: ['F KIE - DEN', 'A BER - KIE', 'A MUN - BUR'],
    approach: 'standard',
    relations: [{ kind: 'with', power: 'FRANCE' }],
    popularity: 19.3,
    strengths: [
      'Agreed with France, the bounce keeps Munich and Paris safe and builds trust between them',
      'Denmark and Holland still fall in autumn, to the fleet and the Kiel army',
    ],
    weaknesses: [
      'France has to believe the move is only meant to bounce',
      'After the bounce, the Munich army has no route to Belgium',
    ],
    sources: [SHARP_NAMES, AGAR_GERMANY],
  },
  {
    id: 'ger-blitz-dutch',
    power: 'GERMANY',
    name: 'Blitzkrieg Opening, Dutch Variation',
    orders: ['F KIE - HOL', 'A BER - KIE', 'A MUN - RUH'],
    approach: 'aggressive',
    relations: [],
    popularity: 15.0,
    strengths: [
      'The Dutch fleet supports Ruhr into Belgium: a serious try for three builds',
      'Holland is secured in spring, leaving the fall free for Belgium and Denmark',
    ],
    weaknesses: [
      'England can bounce Denmark from the North Sea',
      'Three builds in 1901 tends to unite England and France against Germany',
      'No German unit near Sweden, so Russia takes it freely',
    ],
    sources: [SHARP_NAMES, AGAR_GERMANY, HUCKNALL_GERMANY],
  },
  {
    id: 'ger-burgundy',
    power: 'GERMANY',
    name: 'Burgundy Opening',
    orders: ['F KIE - HOL', 'A BER - KIE', 'A MUN - BUR'],
    approach: 'aggressive',
    relations: [{ kind: 'against', power: 'FRANCE' }],
    popularity: 7.7,
    strengths: [
      'If it gets in, Burgundy is the keyhole into France: Paris, Marseilles and Belgium are all within reach',
      'Holland and Burgundy together make Belgium hard to deny',
    ],
    weaknesses: [
      'Embarrassing if France bounces you, and it shows your hand early',
      'Denmark is left to a fall move that England can block',
    ],
    sources: [
      SHARP_NAMES,
      AGAR_GERMANY,
      src(2220, 'Safe Openings', 'Dick Schultz'),
    ],
  },
  {
    id: 'ger-tyrolian',
    power: 'GERMANY',
    name: 'Tyrolian Opening (Danish)',
    orders: ['F KIE - DEN', 'A BER - KIE', 'A MUN - TYR'],
    approach: 'defensive',
    relations: [{ kind: 'with', power: 'AUSTRIA' }],
    popularity: 4.8,
    strengths: [
      'Shields Austria from an Italian strike through Tyrolia',
      'A healthy Austria is Germany’s best buffer against a growing Russia',
    ],
    weaknesses: [
      'Munich is empty, one step from a French army in Burgundy',
      'Gives up any say in Belgium',
    ],
    sources: [
      SHARP_NAMES,
      AGAR_GERMANY,
      src(2191, 'The Koniggratz Freakout', 'Edi Birsan'),
    ],
  },
  {
    id: 'ger-barbarossa',
    power: 'GERMANY',
    name: 'Barbarossa Attack',
    orders: ['F KIE - DEN', 'A BER - PRU', 'A MUN - SIL'],
    approach: 'aggressive',
    relations: [{ kind: 'against', power: 'RUSSIA' }],
    popularity: 0.6,
    strengths: [
      'A supported attack on Warsaw before Russia is organised',
      'Complete surprise: Russia rarely plans for it',
    ],
    weaknesses: [
      'Picks a fight on a slow front while the Low Countries go to others',
      'Kiel, Berlin and Munich are all empty, and Holland is out of reach this year',
    ],
    sources: [
      SHARP_NAMES,
      AGAR_GERMANY,
      src(2139, 'The German Attack', 'John Dennett'),
    ],
  },

  {
    id: 'ger-anschluss',
    power: 'GERMANY',
    name: 'Anschluss',
    orders: ['F KIE - DEN', 'A BER - KIE', 'A MUN H'],
    approach: 'defensive',
    relations: [{ kind: 'with', power: 'AUSTRIA' }],
    popularity: 7.5,
    strengths: [
      'Keeps Austria alive: the Munich army is held back to help it against Italy or Russia',
      'The fleet in Denmark can stand Russia out of Sweden, a threat that discourages a Russian move on Austria',
      'Munich stays covered against any French move through Burgundy',
    ],
    weaknesses: [
      'No unit in Ruhr, so Germany has little say over Belgium',
      'Only works if Italy and Russia believe the threats',
    ],
    sources: [
      src(1715, 'Anschluss', 'Richard Sharp'),
      SHARP_NAMES,
      diplomLibrary('Germany'),
    ],
  },
  // ITALY
  {
    id: 'ita-tyrolian-attack',
    power: 'ITALY',
    name: 'Tyrolian Attack',
    orders: ['F NAP - ION', 'A VEN - TYR', 'A ROM - VEN'],
    approach: 'aggressive',
    relations: [{ kind: 'against', power: 'AUSTRIA' }],
    popularity: 22.3,
    strengths: [
      'Italy’s most direct attack on Austria: a supported move on Trieste in the fall',
      'Devastating alongside a Russian army in Galicia',
    ],
    weaknesses: [
      'An Austrian A VIE-TYR stops both Italian armies dead',
      'Fighting Austria early tends to hand Greece to Turkey, which then builds a fleet',
    ],
    sources: [SHARP_NAMES, AGAR_ITALY, HUCKNALL_ITALY],
  },
  {
    id: 'ita-lepanto',
    power: 'ITALY',
    name: 'Lepanto Opening',
    orders: ['F NAP - ION', 'A ROM - APU', 'A VEN H'],
    approach: 'standard',
    relations: [
      { kind: 'with', power: 'AUSTRIA' },
      { kind: 'against', power: 'TURKEY' },
    ],
    popularity: 15.1,
    strengths: [
      'The classic Austro-Italian plan against Turkey: Tunis now, an army behind Turkish lines in 1902',
      'Calm in spring: Venice held and backed from Apulia, nobody threatened',
    ],
    weaknesses: [
      'Dead if Turkey opens F ANK-CON and reaches the Aegean first',
      'France gets a free hand in the western Mediterranean while Italy is busy in the east',
    ],
    followUp:
      'In the autumn: F ION convoys A APU to Tunis; build F NAP; then F ION - EAS, F NAP - ION.',
    sources: [
      src(1734, 'The Lepanto Opening', 'Edi Birsan'),
      SHARP_NAMES,
      HUCKNALL_ITALY,
      AGAR_ITALY,
    ],
  },
  {
    id: 'ita-alpine-chicken',
    power: 'ITALY',
    name: 'Alpine Chicken',
    orders: ['F NAP - ION', 'A VEN - PIE', 'A ROM - VEN'],
    approach: 'flexible',
    relations: [],
    popularity: 11.6,
    strengths: [
      'Piedmont points at France and Tyrolia at once, and neighbours can’t tell which',
      'Can be sold to France as a feint on Austria, and to Austria as a feint on France',
    ],
    weaknesses: [
      'As the name suggests, it threatens Austria without committing to the attack',
      'Neither front feels real pressure in 1901: Trieste is two moves away and France can simply keep Marseilles occupied',
    ],
    sources: [ALPINE_CHICKEN, AGAR_ITALY],
  },
  {
    id: 'ita-key-lepanto',
    power: 'ITALY',
    name: 'Key Lepanto',
    orders: ['F NAP - ION', 'A ROM - APU', 'A VEN - TRI'],
    approach: 'gambit',
    relations: [
      { kind: 'with', power: 'AUSTRIA' },
      { kind: 'against', power: 'TURKEY' },
    ],
    popularity: 11.4,
    strengths: [
      'Looks like a stab on Austria, which can mislead Turkey and Russia',
      'The army in Trieste joins the Balkan push in the fall',
    ],
    weaknesses: [
      'Boom or bust: it only works if Austria trusts Italy with a home centre',
      'Venice is empty while the army is away',
    ],
    sources: [
      SHARP_NAMES,
      HUCKNALL_ITALY,
      src(
        1765,
        'Playing the Key Lepanto (and living to tell the tale)',
        'Tony Swinnerton',
      ),
    ],
  },
  {
    id: 'ita-stab-lepanto',
    power: 'ITALY',
    name: 'Stab Lepanto',
    orders: ['F NAP - ION', 'A VEN - TRI', 'A ROM - VEN'],
    approach: 'aggressive',
    relations: [{ kind: 'against', power: 'AUSTRIA' }],
    popularity: 6.7,
    strengths: [
      'Takes Trieste outright if Austria leaves it open',
      'Venice stays covered behind the attack',
    ],
    weaknesses: [
      'Fails against most Austrian defences of Trieste',
      'Makes Austria an enemy for the rest of the game',
    ],
    sources: [SHARP_NAMES, AGAR_ITALY],
  },
  {
    id: 'ita-french-attack',
    power: 'ITALY',
    name: 'French Attack',
    orders: ['F NAP - TYS', 'A VEN - PIE', 'A ROM - VEN'],
    approach: 'aggressive',
    relations: [{ kind: 'against', power: 'FRANCE' }],
    popularity: 2.9,
    strengths: [
      'Sets up a supported attack on Marseilles in 1902',
      'Pays off when England or Germany is pressing France from the north',
    ],
    weaknesses: [
      'Telegraphs the plan a year ahead, so France covers Marseilles',
      'The Tyrrhenian fleet is no use against Austria or Turkey',
    ],
    sources: [SHARP_NAMES, ALPINE_CHICKEN, ITALIAN_ATTACK_FRANCE],
  },
  {
    id: 'ita-quiet-tyrrhenian',
    power: 'ITALY',
    name: 'Quiet Tyrrhenian',
    orders: ['F NAP - TYS', 'A ROM H', 'A VEN H'],
    approach: 'flexible',
    relations: [{ kind: 'against', power: 'FRANCE' }],
    popularity: null,
    strengths: [
      'No army moves, so Austria sees nothing to fear',
      'Sets up a surprise move on Marseilles in 1902',
    ],
    weaknesses: [
      'An alert France will read the Tyrrhenian fleet and cover Marseilles',
      'No influence over Greece this year',
    ],
    followUp:
      'In the autumn: F TYS convoys A ROM to Tunis; build F NAP; then A VEN - PIE, F TYS - LYO.',
    sources: [ITALIAN_ATTACK_FRANCE],
  },
  {
    id: 'ita-anti-tunis',
    power: 'ITALY',
    name: 'Anti-Tunis Sacrifice',
    orders: ['F NAP - ION', 'A VEN - TYR', 'A ROM - VEN'],
    approach: 'gambit',
    relations: [{ kind: 'against', power: 'AUSTRIA' }],
    popularity: null,
    strengths: [
      'Gives up Tunis to bring a third unit against Trieste in 1902',
      'Others tend to underrate an Italy that skips the obvious build',
    ],
    weaknesses: [
      'No build in 1901',
      'A gamble: if Austria guesses right, Italy is stuck on three centres',
    ],
    followUp:
      'Same spring as the Tyrolian Attack; in the autumn F ION - ADR instead of taking Tunis.',
    sources: [src(2217, 'Sacrifice Openings in Diplomacy', 'Nicky Palmer')],
  },

  {
    id: 'ita-lepanto-tyrolian',
    power: 'ITALY',
    name: 'Lepanto, Tyrolian Variation',
    orders: ['F NAP - ION', 'A ROM - APU', 'A VEN - TYR'],
    approach: 'standard',
    relations: [
      { kind: 'with', power: 'AUSTRIA' },
      { kind: 'against', power: 'TURKEY' },
    ],
    popularity: 10.9,
    strengths: [
      'The Lepanto convoy to Tunis goes ahead as usual',
      'From Tyrolia the army can turn on Munich, or come home to cover Venice',
    ],
    weaknesses: [
      'Austria may read Tyrolia as a threat to Vienna and Trieste, souring the alliance the Lepanto depends on',
      'Venice is empty until the army comes back',
    ],
    sources: [diplomLibrary('Italy'), SHARP_NAMES, AGAR_ITALY],
  },
  {
    id: 'ita-lepanto-piedmont',
    power: 'ITALY',
    name: 'Lepanto, Piedmont Variation',
    orders: ['F NAP - ION', 'A ROM - APU', 'A VEN - PIE'],
    approach: 'flexible',
    relations: [
      { kind: 'with', power: 'AUSTRIA' },
      { kind: 'against', power: 'TURKEY' },
    ],
    popularity: 5.6,
    strengths: [
      'Runs the Lepanto convoy to Tunis while Piedmont keeps an eye on France',
      'From Piedmont the army can return to Venice or threaten Marseilles',
    ],
    weaknesses: [
      'Piedmont irritates France, and Venice is empty against Austria',
      'Splits Italy’s attention between east and west in the first year',
    ],
    sources: [diplomLibrary('Italy'), SHARP_NAMES, AGAR_ITALY],
  },
  {
    id: 'ita-western-lepanto',
    power: 'ITALY',
    name: 'Western Lepanto',
    orders: ['F NAP - TYS', 'A ROM - TUS', 'A VEN - PIE'],
    approach: 'aggressive',
    relations: [{ kind: 'against', power: 'FRANCE' }],
    popularity: 5.3,
    strengths: [
      'A Lepanto aimed west: Tunis by convoy from Tuscany, with an army already on the French border',
      'Forces France to guess between keeping Spain and covering Marseilles',
      'A fleet built in Rome can join the attack in 1902 through Tuscany',
    ],
    weaknesses: [
      'Openly anti-French from the first move',
      'Nothing faces Austria or Turkey, and Venice and Rome are empty',
    ],
    sources: [diplomLibrary('Italy'), AGAR_ITALY],
  },
  // AUSTRIA
  {
    id: 'aus-balkan-trieste',
    power: 'AUSTRIA',
    name: 'Balkan Gambit, Trieste Variation',
    orders: ['F TRI - ALB', 'A BUD - SER', 'A VIE - TRI'],
    approach: 'standard',
    relations: [],
    popularity: 31.9,
    strengths: [
      'The standard Balkan grab: Serbia in spring, Greece in the fall',
      'Covers Trieste against an Italian strike',
    ],
    weaknesses: [
      'Does nothing against an Italian move to Tyrolia, which then borders an empty Vienna',
      'Galicia is open to Russia',
    ],
    sources: [SHARP_NAMES, HUCKNALL_AUSTRIA, HEDGEHOG],
  },
  {
    id: 'aus-balkan-galician',
    power: 'AUSTRIA',
    name: 'Balkan Gambit, Galician Variation',
    orders: ['F TRI - ALB', 'A BUD - SER', 'A VIE - GAL'],
    approach: 'aggressive',
    relations: [{ kind: 'against', power: 'RUSSIA' }],
    popularity: 18.5,
    strengths: [
      'Two Balkan builds while keeping Russia out of Galicia',
      'A bounce in Galicia costs nothing',
    ],
    weaknesses: [
      'Trieste is open to Italy',
      'Russia may read an army in Galicia as hostile',
    ],
    sources: [SHARP_NAMES, HEDGEHOG],
  },
  {
    id: 'aus-balkan-budapest',
    power: 'AUSTRIA',
    name: 'Balkan Gambit, Budapest Variation',
    orders: ['F TRI - ALB', 'A BUD - SER', 'A VIE - BUD'],
    approach: 'standard',
    relations: [],
    popularity: 14.7,
    strengths: [
      'Two builds and a quiet back line: Budapest backs up Serbia',
      'Threatens no one',
    ],
    weaknesses: [
      'Only safe when Italy and Russia are both friendly',
      'Trieste, Vienna and Galicia are all uncovered',
    ],
    sources: [SHARP_NAMES, HUCKNALL_AUSTRIA],
  },
  {
    id: 'aus-balkan-tyrolian',
    power: 'AUSTRIA',
    name: 'Balkan Gambit, Tyrolian Variation',
    orders: ['F TRI - ALB', 'A BUD - SER', 'A VIE - TYR'],
    approach: 'defensive',
    relations: [{ kind: 'against', power: 'ITALY' }],
    popularity: 5.5,
    strengths: [
      'Stops the Tyrolian Attack dead if you guess right',
      'Still takes Serbia and Greece',
    ],
    weaknesses: [
      'A guess: if Italy goes for Trieste instead, it walks in',
      'Galicia is open to Russia',
    ],
    sources: [SHARP_NAMES, HUCKNALL_AUSTRIA],
  },
  {
    id: 'aus-southern-hedgehog',
    power: 'AUSTRIA',
    name: 'Southern Hedgehog',
    orders: ['F TRI - VEN', 'A BUD - SER', 'A VIE - GAL'],
    approach: 'defensive',
    relations: [],
    popularity: 2.8,
    strengths: [
      'Built for the worst case: blocks Italy at Venice and Russia in Galicia at once',
      'Serbia is a guaranteed build whatever anyone does',
    ],
    weaknesses: [
      'Looks violent, and can provoke the attack it guards against',
      'Gives up Greece for 1901',
    ],
    sources: [HEDGEHOG, HEDGEHOG_HUCKNALL, SHARP_NAMES],
  },
  {
    id: 'aus-houseboat',
    power: 'AUSTRIA',
    name: 'Houseboat Southern Hedgehog',
    orders: ['F TRI H', 'A BUD - SER', 'A VIE - GAL'],
    approach: 'defensive',
    relations: [],
    popularity: 2.5,
    strengths: [
      'Holds Trieste without moving on Italy',
      'Blocks Galicia, and Serbia is certain',
    ],
    weaknesses: [
      'With the fleet at home, Greece is out of reach in 1901',
      'Vienna is empty against a move through Tyrolia',
    ],
    sources: [SHARP_NAMES],
  },
  {
    id: 'aus-hedgehog',
    power: 'AUSTRIA',
    name: 'Hedgehog',
    orders: ['F TRI - VEN', 'A BUD - RUM', 'A VIE - GAL'],
    approach: 'defensive',
    relations: [],
    popularity: 1.7,
    strengths: [
      'Splits an Italian attack and blocks Russia in Galicia',
      'The move on Rumania can stir up trouble between Russia and Turkey',
    ],
    weaknesses: [
      'If Rumania bounces and Turkey reaches Serbia, Austria builds nothing',
      'Gives Greece away',
    ],
    sources: [HEDGEHOG, HEDGEHOG_HUCKNALL, SHARP_NAMES],
  },

  // RUSSIA
  {
    id: 'rus-southern-defence',
    power: 'RUSSIA',
    name: 'Southern Defence',
    orders: ['F STP/SC - BOT', 'A WAR - GAL', 'A MOS - UKR', 'F SEV - BLA'],
    approach: 'standard',
    relations: [],
    popularity: 22.0,
    strengths: [
      'Covers both danger points, Galicia and the Black Sea',
      'Ukraine backs a fall move on Rumania, while the northern fleet takes Sweden',
    ],
    weaknesses: [
      'Concedes Norway to England',
      'Austria may take the move to Galicia badly',
    ],
    sources: [SHARP_NAMES, AGAR_RUSSIA],
  },
  {
    id: 'rus-austrian-attack',
    power: 'RUSSIA',
    name: 'Austrian Attack',
    orders: ['F STP/SC - BOT', 'A WAR - GAL', 'A MOS - UKR', 'F SEV - RUM'],
    approach: 'aggressive',
    relations: [
      { kind: 'against', power: 'AUSTRIA' },
      { kind: 'with', power: 'TURKEY' },
    ],
    popularity: 18.0,
    strengths: [
      'Rumania in spring and pressure on Vienna and Budapest',
      'The natural start of a Russo-Turkish alliance against Austria',
    ],
    weaknesses: [
      'Leaves the Black Sea empty, trusting Turkey not to enter it while Sevastopol is unguarded',
      'If Austria holds firm, Rumania is the only southern gain',
    ],
    sources: [SHARP_NAMES, AGAR_RUSSIA, BULGARIAN_GAMBIT],
  },
  {
    id: 'rus-turkish-attack',
    power: 'RUSSIA',
    name: 'Turkish Attack',
    orders: ['F STP/SC - BOT', 'F SEV - BLA', 'A MOS - SEV', 'A WAR - UKR'],
    approach: 'aggressive',
    relations: [{ kind: 'against', power: 'TURKEY' }],
    popularity: 9.0,
    strengths: [
      'If the Black Sea falls, Rumania and Armenia are both under supported attack',
      'Sevastopol stays covered',
    ],
    weaknesses: [
      'Only for when Turkey is weak and Austria is with you: a bounce leaves the south stalled',
      'Galicia is open and Warsaw is empty',
    ],
    sources: [SHARP_NAMES, BLACK_SEA],
  },
  {
    id: 'rus-octopus',
    power: 'RUSSIA',
    name: 'Octopus',
    orders: ['F STP/SC - BOT', 'A MOS - STP', 'A WAR - GAL', 'F SEV - BLA'],
    approach: 'flexible',
    relations: [],
    popularity: null,
    strengths: [
      'Every unit heads for a gain, keeping all options open until allies are clear',
      'Galicia wins Italy’s trust and the Black Sea blunts a Turkish attack',
      'The army in St Petersburg can reassure Germany while pressing Norway',
    ],
    weaknesses: [
      'Upsets England over Norway',
      'Moscow is empty and the south is thin',
    ],
    sources: [OCTOPUS, SHARP_NAMES],
  },
  {
    id: 'rus-rumanian',
    power: 'RUSSIA',
    name: 'Rumanian Opening',
    orders: ['F STP/SC - BOT', 'F SEV - RUM', 'A MOS - SEV', 'A WAR - UKR'],
    approach: 'standard',
    relations: [{ kind: 'with', power: 'TURKEY' }],
    popularity: 7.4,
    strengths: [
      'Rumania in spring, backed by both armies',
      'Leaving the Black Sea empty is a peace offering to Turkey',
    ],
    weaknesses: [
      'At most two builds: Rumania and Sweden',
      'Galicia is open, and Moscow and Warsaw are empty',
    ],
    sources: [SHARP_NAMES, OCTOPUS],
  },
  {
    id: 'rus-northern-offensive',
    power: 'RUSSIA',
    name: 'Northern Offensive (Livonian System)',
    orders: ['F STP/SC - BOT', 'A MOS - STP', 'A WAR - LVN'],
    approach: 'aggressive',
    relations: [{ kind: 'against', power: 'ENGLAND' }],
    popularity: 6.3,
    strengths: [
      'Commits to Scandinavia: four units there by 1902, with Norway in reach',
      'The real prize is a later push into Germany from the north',
    ],
    weaknesses: [
      'Abandons the south: nothing covers Galicia or Ukraine',
      'Needs Germany to let Russia into Sweden',
    ],
    followUp:
      'In the autumn: A STP - FIN, F BOT convoys A LVN to Sweden; build F STP/NC. F SEV has no set order.',
    sources: [
      src(2214, 'Russia’s Northern Offensive', 'Rod Walker'),
      SHARP_NAMES,
    ],
  },
  {
    id: 'rus-lapland-lurch',
    power: 'RUSSIA',
    name: 'Lapland Lurch',
    orders: ['F STP/SC - FIN', 'A WAR - GAL', 'A MOS - UKR', 'F SEV - BLA'],
    approach: 'flexible',
    relations: [],
    popularity: 2.4,
    strengths: [
      'Finland guards both Finland and Sweden against an Anglo-German squeeze',
      'Shows Germany you have no designs on the Baltic',
    ],
    weaknesses: [
      'Sweden is a single unsupported move that a German fleet in Denmark can bounce',
      'Rarely worth it unless England and Germany are working together',
    ],
    sources: [src(2196, 'The Lapland Lurch', 'Mark Berch')],
  },
  {
    id: 'rus-german-attack',
    power: 'RUSSIA',
    name: 'German Attack',
    orders: ['F STP/SC - BOT', 'A WAR - SIL', 'A MOS - UKR', 'F SEV - BLA'],
    approach: 'aggressive',
    relations: [{ kind: 'against', power: 'GERMANY' }],
    popularity: 2.1,
    strengths: [
      'Silesia is a surprise, and pins German armies at home',
      'Puts off the choice between Austria and Turkey',
    ],
    weaknesses: [
      'Takes a unit away from the fight for Rumania',
      'Germany will likely deny Russia Sweden in return',
    ],
    sources: [src(2139, 'The German Attack', 'John Dennett')],
  },

  {
    id: 'rus-squid',
    power: 'RUSSIA',
    name: 'Squid',
    orders: ['F STP/SC - BOT', 'A MOS - STP', 'A WAR - UKR', 'F SEV - BLA'],
    approach: 'flexible',
    relations: [],
    popularity: 8.2,
    strengths: [
      'The Octopus with a lighter touch: Ukraine instead of Galicia avoids alarming Austria',
      'Covers the Black Sea and pressures Norway at the same time',
    ],
    weaknesses: [
      'Moscow and Warsaw are both empty',
      'England reads the army in St Petersburg as a threat to Norway',
    ],
    sources: [SHARP_NAMES, diplomLibrary('Russia')],
  },
  {
    id: 'rus-northern-ukraine',
    power: 'RUSSIA',
    name: 'Northern Opening, Ukraine Variation',
    orders: ['F STP/SC - BOT', 'A MOS - STP', 'A WAR - UKR', 'F SEV - RUM'],
    approach: 'flexible',
    relations: [{ kind: 'with', power: 'TURKEY' }],
    popularity: 5.8,
    strengths: [
      'Rumania in spring with Ukraine behind it, and an army in the north for Norway or Sweden',
      'Keeping out of the Black Sea, a peace offering to Turkey, frees Russia to look north',
    ],
    weaknesses: [
      'Sevastopol, Moscow and Warsaw are all empty',
      'Depends on Turkey staying out of the Black Sea and Sevastopol',
    ],
    sources: [SHARP_NAMES, diplomLibrary('Russia')],
  },
  // TURKEY
  {
    id: 'tur-russian-attack',
    power: 'TURKEY',
    name: 'Russian Attack',
    orders: ['F ANK - BLA', 'A CON - BUL', 'A SMY - ARM'],
    approach: 'aggressive',
    relations: [{ kind: 'against', power: 'RUSSIA' }],
    popularity: 32.1,
    strengths: [
      'Turkey’s most active line: pressure on Sevastopol from Armenia and the Black Sea',
      'Armenia can cut Russian support even if the Black Sea bounces',
    ],
    weaknesses: [
      'Shows your hand at once',
      'Gives Greece to Austria and leaves Constantinople and Smyrna empty',
    ],
    sources: [SHARP_NAMES, HUCKNALL_TURKEY, BLACK_SEA, OCTOPUS],
  },
  {
    id: 'tur-western',
    power: 'TURKEY',
    name: 'Western Opening, Ankara Variation',
    orders: ['F ANK - CON', 'A CON - BUL', 'A SMY - ANK'],
    approach: 'standard',
    relations: [{ kind: 'with', power: 'RUSSIA' }],
    popularity: 31.8,
    strengths: [
      'The Juggernaut start: Turkey stays out of the Black Sea and turns its fleet toward the Aegean',
      'A SMY-ANK keeps Ankara covered if Russia’s fleet comes into the Black Sea after all',
    ],
    weaknesses: [
      'Relies on Russia keeping its fleet out of the Black Sea, next to Ankara and Constantinople',
      'Exposed to the Bulgarian Gambit, which can leave Turkey without a build',
    ],
    sources: [SHARP_NAMES, TURKISH_HEDGEHOG, BULGARIAN_GAMBIT],
  },
  {
    id: 'tur-russian-defence',
    power: 'TURKEY',
    name: 'Russian Defence',
    orders: ['F ANK - BLA', 'A CON - BUL', 'A SMY - CON'],
    approach: 'standard',
    relations: [],
    popularity: 29.3,
    strengths: [
      'Backs up Bulgaria for a second build in Greece or Rumania',
      'Contests the Black Sea and keeps Russia guessing into the fall',
    ],
    weaknesses: [
      'Usually ends in a Black Sea bounce',
      'Puts no pressure on Russia’s centres',
    ],
    sources: [
      SHARP_NAMES,
      HUCKNALL_TURKEY,
      src(2222, 'Turkey – A Personal View on Opening Strategy', 'Stephen Agar'),
    ],
  },
  {
    id: 'tur-hedgehog',
    power: 'TURKEY',
    name: 'Turkish Hedgehog',
    orders: ['F ANK - CON', 'A CON - BUL', 'A SMY - ARM'],
    approach: 'defensive',
    relations: [],
    popularity: null,
    strengths: [
      'Stays out of the Black Sea but takes Armenia, which a sensible Russia accepts as a fair exchange',
      'Armenia and Constantinople both border Ankara, so it is covered if Russia’s fleet comes into the Black Sea',
      'The fleet heads for the Aegean',
    ],
    weaknesses: [
      'If Russia does enter the Black Sea, Turkey starts on the defensive',
      'Smyrna is empty',
    ],
    sources: [TURKISH_HEDGEHOG],
  },
  {
    id: 'tur-western-smyrna',
    power: 'TURKEY',
    name: 'Western Opening, Smyrna Variation',
    orders: ['F ANK - CON', 'A CON - BUL', 'A SMY H'],
    approach: 'standard',
    relations: [{ kind: 'with', power: 'RUSSIA' }],
    popularity: 24.1,
    strengths: [
      'Stays out of the Black Sea and points the fleet at the Aegean for a push west',
      'If Russia’s fleet comes into the Black Sea anyway, a self-bounce on Ankara covers it and keeps it free for a fleet build',
    ],
    weaknesses: [
      'The army in Smyrna spends the spring doing nothing',
      'Relies on Russia keeping its fleet out of the Black Sea, next to Ankara and Constantinople',
    ],
    sources: [SHARP_NAMES, diplomLibrary('Turkey')],
  },
];
