import { Order, ProvinceInfo, Unit } from '../types/diplomacy';

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

export function canUnitSupportInto(
  unit: Unit,
  targetProvince: string,
  provinces: Record<string, ProvinceInfo>
): boolean {
  const reachable = getReachableDestinations(unit, provinces);
  return reachable.some((r) => r.province === targetProvince);
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
    const coastSuffix = order.target_coast ? ` (${order.target_coast})` : '';
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
      targetText: `Disband ${order.unit_type} ${pName(order.origin)}`,
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
      targetText: `Retreat to ${pName(order.target)}${coastSuffix}`,
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
