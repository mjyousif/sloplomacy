import type {
  GameParticipant,
  Order,
  Power,
  ProvinceInfo,
  Unit,
  ValidationIssue,
} from '../types/diplomacy';

type BuildsByPower = Record<Power, { count: number; homes: string[] }>;
type RetreatsByPower = Record<Power, Record<string, string[]>>;

/**
 * The powers a multiplayer match is waiting on this phase: those whose player has not
 * surrendered and who have a decision to make (builds or disbands in winter, a dislodged unit in
 * a retreat phase, any unit otherwise). Empty outside multiplayer.
 */
export function getRequiredPowers({
  isMultiplayer,
  participants,
  surrenderedPowers,
  isAdjustmentPhase,
  isRetreatPhase,
  builds,
  retreats,
  units,
}: {
  isMultiplayer: boolean;
  participants: Record<string, GameParticipant> | undefined;
  surrenderedPowers: Power[];
  isAdjustmentPhase: boolean;
  isRetreatPhase: boolean;
  builds: BuildsByPower | null;
  retreats: RetreatsByPower | null;
  units: Unit[];
}): Power[] {
  if (!isMultiplayer || !participants) return [];
  const activeParticipants = Object.values(participants).filter(
    (p) => !p.surrendered && !surrenderedPowers.includes(p.power),
  );
  if (activeParticipants.length === 0) return [];

  if (isAdjustmentPhase) {
    if (!builds) return activeParticipants.map((p) => p.power);
    return activeParticipants
      .filter((p) => {
        const b = builds[p.power];
        // A power owed builds with every home center occupied has no decision to make.
        return (
          b &&
          typeof b === 'object' &&
          (b.count < 0 || (b.count > 0 && b.homes.length > 0))
        );
      })
      .map((p) => p.power);
  }

  if (isRetreatPhase) {
    const dislodgedPowers = new Set(
      units.filter((u) => u.is_dislodged).map((u) => u.power),
    );
    if (retreats) {
      Object.keys(retreats).forEach((pStr) => {
        if (
          retreats[pStr as Power] &&
          Object.keys(retreats[pStr as Power]).length > 0
        ) {
          dislodgedPowers.add(pStr as Power);
        }
      });
    }
    return activeParticipants
      .filter((p) => dislodgedPowers.has(p.power))
      .map((p) => p.power);
  }

  const powersWithUnits = new Set(units.map((u) => u.power));
  return activeParticipants
    .filter((p) => powersWithUnits.has(p.power))
    .map((p) => p.power);
}

/** What the order panel shows about one power's orders this phase. */
export interface OrderProgress {
  /** Every non-dislodged unit by province. */
  unitsByProv: Record<string, Unit>;
  /** The power's units, dislodged ones first in a retreat phase. */
  myUnits: Unit[];
  myDislodgedUnits: Unit[];
  myActiveFieldUnits: Unit[];
  myIssues: ValidationIssue[];
  /** The issues that are not just information. */
  myBlockingIssues: ValidationIssue[];
  issuesByUnit: Record<string, ValidationIssue[]>;
  scCountByPower: Record<Power, number>;
  /** Positive: builds owed. Negative: disbands owed. */
  buildCount: number;
  buildHomes: string[];
  maxAllowedBuilds: number;
  assignedBuildsCount: number;
  neededDisbands: number;
  assignedDisbandsCount: number;
  /** Orders the player has to confirm this phase, how many are confirmed, and the rest. */
  totalActionableCount: number;
  confirmedCount: number;
  unconfirmedCount: number;
}

export function computeOrderProgress({
  units,
  orders,
  ownership,
  provinces,
  activePower,
  issues,
  builds,
  isAdjustmentPhase,
  isRetreatPhase,
}: {
  units: Unit[];
  orders: Record<string, Order>;
  ownership: Record<string, Power>;
  provinces: Record<string, ProvinceInfo>;
  activePower: Power;
  issues: ValidationIssue[];
  builds: BuildsByPower | null;
  isAdjustmentPhase: boolean;
  isRetreatPhase: boolean;
}): OrderProgress {
  const unitsByProv: Record<string, Unit> = {};
  for (const u of units) {
    if (!u.is_dislodged) {
      unitsByProv[u.province] = u;
    }
  }

  const rawMyUnits = units.filter((u) => u.power === activePower);
  const myUnits = isRetreatPhase
    ? [...rawMyUnits].sort(
        (a, b) =>
          Number(Boolean(b.is_dislodged)) - Number(Boolean(a.is_dislodged)),
      )
    : rawMyUnits;
  const myDislodgedUnits = myUnits.filter((u) => u.is_dislodged);
  const myActiveFieldUnits = myUnits.filter((u) => !u.is_dislodged);

  const myIssues = issues.filter((i) => i.power === activePower);
  const myBlockingIssues = myIssues.filter((i) => i.severity !== 'info');

  // Supply center count per power
  const scCountByPower: Record<Power, number> = {
    AUSTRIA: 0,
    ENGLAND: 0,
    FRANCE: 0,
    GERMANY: 0,
    ITALY: 0,
    RUSSIA: 0,
    TURKEY: 0,
  };
  for (const [prov, pwr] of Object.entries(ownership)) {
    if (provinces[prov] && !provinces[prov].is_supply_center) continue;
    if (scCountByPower[pwr] !== undefined) scCountByPower[pwr]++;
  }

  const myBuildInfo = builds ? builds[activePower] : undefined;
  const buildCount =
    myBuildInfo !== undefined
      ? myBuildInfo.count
      : scCountByPower[activePower] - myActiveFieldUnits.length;
  const buildHomes =
    myBuildInfo !== undefined
      ? myBuildInfo.homes
      : Object.values(provinces)
          .filter(
            (p) =>
              p.home_power === activePower &&
              p.is_supply_center &&
              ownership[p.id] === activePower &&
              !unitsByProv[p.id],
          )
          .map((p) => p.id);

  const maxAllowedBuilds =
    buildCount > 0 ? Math.min(buildCount, buildHomes.length) : 0;
  const assignedBuildsCount = buildHomes.filter(
    (h) => orders[`BUILD_${activePower}_${h}`]?.order_type === 'BUILD',
  ).length;
  const neededDisbands = buildCount < 0 ? Math.abs(buildCount) : 0;
  const assignedDisbandsCount = myUnits.filter(
    (u) => orders[u.id]?.order_type === 'DISBAND',
  ).length;

  const issuesByUnit: Record<string, ValidationIssue[]> = {};
  for (const iss of myIssues) {
    for (const uid of iss.unit_ids) {
      if (!issuesByUnit[uid]) issuesByUnit[uid] = [];
      issuesByUnit[uid].push(iss);
    }
  }

  // Compute confirmed / total actionable orders depending on current phase
  let totalActionableCount = myUnits.length;
  let confirmedCount = myUnits.filter((u) => orders[u.id]?.is_explicit).length;

  if (isRetreatPhase) {
    totalActionableCount = myDislodgedUnits.length;
    confirmedCount = myDislodgedUnits.filter(
      (u) => orders[u.id]?.is_explicit,
    ).length;
  } else if (isAdjustmentPhase) {
    if (buildCount > 0 && buildHomes.length > 0) {
      totalActionableCount = maxAllowedBuilds;
      const explicitBuilds = buildHomes.filter(
        (h) => orders[`BUILD_${activePower}_${h}`]?.is_explicit,
      ).length;
      confirmedCount = Math.min(maxAllowedBuilds, explicitBuilds);
    } else if (buildCount < 0) {
      totalActionableCount = neededDisbands;
      confirmedCount = Math.min(neededDisbands, assignedDisbandsCount);
    } else {
      totalActionableCount = 0;
      confirmedCount = 0;
    }
  }

  const unconfirmedCount = Math.max(0, totalActionableCount - confirmedCount);

  return {
    unitsByProv,
    myUnits,
    myDislodgedUnits,
    myActiveFieldUnits,
    myIssues,
    myBlockingIssues,
    issuesByUnit,
    scCountByPower,
    buildCount,
    buildHomes,
    maxAllowedBuilds,
    assignedBuildsCount,
    neededDisbands,
    assignedDisbandsCount,
    totalActionableCount,
    confirmedCount,
    unconfirmedCount,
  };
}
