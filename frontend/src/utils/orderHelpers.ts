import { GameParticipant, Order, POWER_METADATA, Power, ProvinceInfo, Unit } from '../types/diplomacy';

export function splitProvinceCode(code: string): { base: string; coast: string | null } {
  if (code.includes('/')) {
    const [base, coast] = code.split('/');
    return { base: base.toUpperCase(), coast: coast.toUpperCase() };
  }
  return { base: code.toUpperCase(), coast: null };
}

export function getReachableDestinations(
  unit: Unit,
  provinces: Record<string, ProvinceInfo>
): { province: string; coasts: string[] }[] {
  const orig = provinces[unit.province];
  if (!orig) return [];

  if (unit.unit_type === 'A') {
    return orig.army_adj.map((p) => ({ province: p, coasts: [] }));
  }

  // Fleet
  const coastKey = unit.coast || '';
  const adjEntries = orig.fleet_adj[coastKey] || [];
  const byBase: Record<string, string[]> = {};

  for (const entry of adjEntries) {
    const { base, coast } = splitProvinceCode(entry);
    if (!byBase[base]) byBase[base] = [];
    if (coast && !byBase[base].includes(coast)) {
      byBase[base].push(coast);
    }
  }

  return Object.entries(byBase).map(([province, coasts]) => ({
    province,
    coasts,
  }));
}

export function getValidRetreatDestinations(
  unit: Unit,
  retreats: Partial<Record<Power, Record<string, string[]>>> | null | undefined,
  provinces: Record<string, ProvinceInfo>
): { province: string; coasts: string[] }[] {
  if (!retreats) {
    return getReachableDestinations(unit, provinces);
  }
  const pwrRetreats = retreats[unit.power] || {};
  const locKey = unit.coast ? `${unit.province}/${unit.coast}` : unit.province;
  const fullKey = `${unit.unit_type} ${locKey}`;
  const fallbackKey = `${unit.unit_type} ${unit.province}`;
  const rawList = pwrRetreats[fullKey] || pwrRetreats[fallbackKey] || [];

  const byBase: Record<string, string[]> = {};
  for (const entry of rawList) {
    const { base, coast } = splitProvinceCode(entry);
    if (!byBase[base]) byBase[base] = [];
    if (coast && !byBase[base].includes(coast)) {
      byBase[base].push(coast);
    }
  }

  return Object.entries(byBase).map(([province, coasts]) => ({
    province,
    coasts,
  }));
}

export function canUnitSupportInto(
  unit: Unit,
  targetProvince: string,
  provinces: Record<string, ProvinceInfo>
): boolean {
  const reachable = getReachableDestinations(unit, provinces);
  return reachable.some((r) => r.province === targetProvince);
}

export type OrderMenuButton = 'MOVE' | 'HOLD' | 'SUPPORT' | 'CONVOY';

// Picks the one button a unit's menu lights up. A saved Hold shows when the menu opens, because
// Hold ends the selection and has no mode of its own, and gives way once the player picks a mode.
export function getActiveOrderButton(
  interactionMode: string,
  order: Order | undefined,
  moveModeChosen: boolean
): OrderMenuButton {
  if (interactionMode.startsWith('SUPPORT')) return 'SUPPORT';
  if (interactionMode.startsWith('CONVOY')) return 'CONVOY';
  if (!moveModeChosen && order?.order_type === 'HOLD' && order.is_explicit) return 'HOLD';
  return 'MOVE';
}

export function formatOrderSummary(
  order: Order | undefined,
  provinces: Record<string, ProvinceInfo>,
  unitsByProvince: Record<string, Unit>
): {
  verb: string;
  targetText: string;
  badgeColor: string;
  fullSymbolic: string;
} {
  const pName = (code?: string | null) =>
    code && provinces[code] ? provinces[code].name : code || '';

  if (!order || order.order_type === 'HOLD') {
    return {
      verb: 'HOLD',
      targetText: `Defending ${pName(order?.origin)}`,
      badgeColor: '#64748b',
      fullSymbolic: `${order?.unit_type || 'A'} ${order?.origin || ''} HOLD`,
    };
  }

  if (order.order_type === 'MOVE') {
    const coastSuffix = order.target_coast ? ` (${order.target_coast})` : '';
    const convoySuffix = order.via_convoy ? ' [via Convoy]' : '';
    return {
      verb: 'MOVE',
      targetText: `→ ${pName(order.target)}${coastSuffix}${convoySuffix}`,
      badgeColor: '#2563eb',
      fullSymbolic: `${order.unit_type} ${order.origin} ──► ${order.target || '?'}${coastSuffix}`,
    };
  }

  if (order.order_type === 'SUPPORT') {
    const supUnit = order.aux_unit_origin ? unitsByProvince[order.aux_unit_origin] : undefined;
    const uType = supUnit ? supUnit.unit_type : 'Unit';
    const isHoldSupport = order.aux_unit_origin === order.target;
    if (isHoldSupport) {
      return {
        verb: 'SUPPORT HOLD',
        targetText: `Supports ${uType} ${pName(order.aux_unit_origin)} (Hold)`,
        badgeColor: '#0d9488',
        fullSymbolic: `${order.unit_type} ${order.origin} S ${uType} ${order.aux_unit_origin} H`,
      };
    }
    return {
      verb: 'SUPPORT MOVE',
      targetText: `Supports ${uType} ${pName(order.aux_unit_origin)} → ${pName(order.target)}`,
      badgeColor: '#0d9488',
      fullSymbolic: `${order.unit_type} ${order.origin} S ${uType} ${order.aux_unit_origin} ──► ${order.target}`,
    };
  }

  if (order.order_type === 'CONVOY') {
    return {
      verb: 'CONVOY',
      targetText: `Convoys A ${pName(order.aux_unit_origin)} → ${pName(order.target)}`,
      badgeColor: '#7c3aed',
      fullSymbolic: `F ${order.origin} C A ${order.aux_unit_origin} ──► ${order.target}`,
    };
  }

  if (order.order_type === 'BUILD') {
    const cst = order.origin_coast || order.target_coast;
    const coastSuffix = order.unit_type === 'F' && cst ? ` (${cst})` : '';
    return {
      verb: 'BUILD',
      targetText: `Build ${order.unit_type === 'A' ? 'Army' : 'Fleet'} in ${pName(order.origin)}${coastSuffix}`,
      badgeColor: '#16a34a',
      fullSymbolic: `+ ${order.unit_type} ${order.origin}${coastSuffix} BUILD`,
    };
  }

  if (order.order_type === 'DISBAND') {
    return {
      verb: 'DISBAND',
      targetText: `Disband ${order.unit_type === 'A' ? 'Army' : 'Fleet'} in ${pName(order.origin)}`,
      badgeColor: '#dc2626',
      fullSymbolic: `- ${order.unit_type} ${order.origin} DISBAND`,
    };
  }

  if (order.order_type === 'WAIVE') {
    return {
      verb: 'WAIVE',
      targetText: `Waive build in ${pName(order.origin)}`,
      badgeColor: '#64748b',
      fullSymbolic: `WAIVE ${order.origin}`,
    };
  }

  if (order.order_type === 'RETREAT') {
    const coastSuffix = order.target_coast ? ` (${order.target_coast})` : '';
    return {
      verb: 'RETREAT',
      targetText: `Retreat → ${pName(order.target)}${coastSuffix}`,
      badgeColor: '#ea580c',
      fullSymbolic: `RETREAT ${order.unit_type} ${order.origin} ──► ${order.target}${coastSuffix}`,
    };
  }

  return {
    verb: 'HOLD',
    targetText: 'Holding',
    badgeColor: '#64748b',
    fullSymbolic: 'HOLD',
  };
}


export interface ConsensusStatusInfo {
  isWaitingForPlayers: boolean;
  title: string;
  description: string;
  buttonLabel: string;
  buttonTitle: string;
  isSoloAdvanceReady: boolean;
}

export function getConsensusStatusInfo({
  isMultiplayer,
  lobbyStatus,
  participants,
  surrenderedPowers = [],
  requiredPowers,
  finalizedPowers,
  isGameCreator,
  gameOver,
}: {
  isMultiplayer: boolean;
  lobbyStatus?: string;
  participants?: Record<string, GameParticipant>;
  surrenderedPowers?: Power[];
  requiredPowers: Power[];
  finalizedPowers: Power[];
  isGameCreator: boolean;
  gameOver: boolean;
}): ConsensusStatusInfo {
  const activeEnvoys = participants
    ? Object.values(participants).filter(
        (p) => !p.surrendered && !surrenderedPowers.includes(p.power)
      )
    : [];

  const isWaitingForPlayers =
    isMultiplayer && (lobbyStatus === 'waiting' || activeEnvoys.length < 2);

  const totalRequiredCount = requiredPowers.length;
  const finalizedCount = requiredPowers.filter((p) =>
    finalizedPowers.includes(p)
  ).length;
  const missingPowers = requiredPowers.filter(
    (p) => !finalizedPowers.includes(p)
  );

  if (gameOver) {
    return {
      isWaitingForPlayers,
      title: 'Campaign Finished',
      description: 'Hostilities concluded.',
      buttonLabel: 'Game Over',
      buttonTitle: 'Campaign Finished',
      isSoloAdvanceReady: false,
    };
  }

  if (totalRequiredCount === 0) {
    return {
      isWaitingForPlayers,
      title: 'Waiting for Players',
      description: 'No active envoys have claimed powers with active units yet.',
      buttonLabel: isWaitingForPlayers
        ? 'Advance Phase Solo (Host Override)'
        : 'Force Adjudicate Phase (Host Override)',
      buttonTitle: isWaitingForPlayers
        ? 'Host Admin Override: Advance immediately solo without waiting for other players to join'
        : 'Host Admin Override: Force advance to the next season immediately',
      isSoloAdvanceReady: false,
    };
  }

  if (isWaitingForPlayers) {
    const isReady = missingPowers.length === 0;
    const title = isReady
      ? 'Orders Locked • Waiting for Players (1/2 min)'
      : `Lobby: Waiting for Players (${totalRequiredCount}/2 min)`;
    const description = !isReady
      ? 'Multiplayer campaigns require at least 2 players to auto-resolve turns. Orders can be prepared and finalized while waiting for opponents.'
      : isGameCreator
      ? 'Your orders are locked. Auto-resolution begins once 2+ players join. As host, you can click "Advance Phase Solo" below to resolve now without waiting.'
      : 'Your orders are locked. Auto-resolution begins once 2+ players join. Waiting for opponents to join or the host to advance.';

    return {
      isWaitingForPlayers: true,
      title,
      description,
      buttonLabel: 'Advance Phase Solo (Host Override)',
      buttonTitle:
        'Host Admin Override: Advance immediately solo without waiting for other players to join',
      isSoloAdvanceReady: isReady,
    };
  }

  // Active multiplayer match (2+ players)
  if (missingPowers.length > 0) {
    return {
      isWaitingForPlayers: false,
      title: `Resolution Progress: ${finalizedCount}/${totalRequiredCount} Ready`,
      description: `Waiting on: ${missingPowers
        .map((p) => POWER_METADATA[p]?.shortName || p)
        .join(', ')}`,
      buttonLabel: 'Force Adjudicate Phase (Host Override)',
      buttonTitle:
        'Host Admin Override: Force advance to the next season immediately',
      isSoloAdvanceReady: false,
    };
  }

  return {
    isWaitingForPlayers: false,
    title: `Consensus Reached (${totalRequiredCount}/${totalRequiredCount})`,
    description: 'All required powers finalized! Resolving phase...',
    buttonLabel: 'Force Adjudicate Phase (Host Override)',
    buttonTitle:
      'Host Admin Override: Force advance to the next season immediately',
    isSoloAdvanceReady: false,
  };
}
