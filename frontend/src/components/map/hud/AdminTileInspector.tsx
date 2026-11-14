import {
  Anchor,
  Crown,
  MoveRight,
  Pencil,
  PlusCircle,
  Shield,
  Swords,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import {
  type Order,
  type OrderType,
  POWER_METADATA,
  type Power,
  type ProvinceInfo,
  type Unit,
  type UnitType,
} from '../../../types/diplomacy';
import {
  canPlaceUnitTypeInProvince,
  getAvailableCoasts,
} from '../../../utils/adminHelpers';
import {
  IconSelectDropdown,
  type IconSelectOption,
} from './IconSelectDropdown';
import { PowerFlagDropdown } from './PowerFlagDropdown';

interface PendingSpawnChoice {
  unitType: UnitType;
  coast: string | null;
}

const ADMIN_ORDER_OPTIONS: IconSelectOption<OrderType>[] = [
  {
    value: 'HOLD',
    label: 'Hold',
    icon: (
      <Shield
        size={13}
        className="admin-order-icon"
        data-testid="admin-order-icon"
      />
    ),
    testId: 'admin-inspector-order-type-option-hold',
  },
  {
    value: 'MOVE',
    label: 'Move',
    icon: (
      <MoveRight
        size={13}
        className="admin-order-icon"
        data-testid="admin-order-icon"
      />
    ),
    testId: 'admin-inspector-order-type-option-move',
  },
  {
    value: 'DISBAND',
    label: 'Disband',
    icon: (
      <Trash2
        size={13}
        className="admin-order-icon"
        data-testid="admin-order-icon"
      />
    ),
    testId: 'admin-inspector-order-type-option-disband',
  },
];

export interface AdminTileInspectorProps {
  compact?: boolean;
  provinceId: string;
  provinces: Record<string, ProvinceInfo>;
  unit: Unit | null;
  order: Order | undefined;
  owner: Power | null;
  activePower: Power;
  isRelocating: boolean;
  onToggleRelocate: () => void;
  onStageRelocateUnit?: (
    unitId: string,
    targetProv: string,
    targetCoast?: string | null,
  ) => boolean;
  onStageSpawnOrUpdateUnit: (
    province: string,
    power: Power,
    unitType: UnitType,
    coast?: string | null,
  ) => boolean;
  onStageDestroyUnit: (unitId: string) => void;
  onStageOwnership: (province: string, power: Power | null) => void;
  onStageUnitOrder: (order: Order) => void;
  onClose: () => void;
}

export function AdminTileInspector({
  compact = false,
  provinceId,
  provinces,
  unit,
  order,
  owner,
  activePower: _activePower,
  isRelocating,
  onToggleRelocate,
  onStageSpawnOrUpdateUnit,
  onStageDestroyUnit,
  onStageOwnership,
  onStageUnitOrder,
  onClose,
}: AdminTileInspectorProps) {
  const provInfo = provinces[provinceId];
  const [pendingSpawn, setPendingSpawn] = useState<PendingSpawnChoice | null>(
    null,
  );

  if (!provInfo) return null;

  const canArmy = canPlaceUnitTypeInProvince('A', provInfo.type);
  const canFleet = canPlaceUnitTypeInProvince('F', provInfo.type);
  const fleetCoasts = getAvailableCoasts(provInfo, 'F');
  const unitTypeChoices: Array<{
    key: string;
    unitType: UnitType;
    coast: string | null;
    label: string;
    editTestId: string;
    spawnTestId: string;
  }> = [
    ...(canArmy
      ? [
          {
            key: 'A',
            unitType: 'A' as const,
            coast: null,
            label: 'Army',
            editTestId: 'admin-inspector-type-A',
            spawnTestId: 'admin-inspector-spawn-army',
          },
        ]
      : []),
    ...(canFleet
      ? fleetCoasts.length > 0
        ? fleetCoasts.map((cst) => ({
            key: `F-${cst}`,
            unitType: 'F' as const,
            coast: cst,
            label: `F (${cst})`,
            editTestId: `admin-inspector-coast-${cst}`,
            spawnTestId: `admin-inspector-spawn-fleet-${cst}`,
          }))
        : [
            {
              key: 'F',
              unitType: 'F' as const,
              coast: null,
              label: 'Fleet',
              editTestId: 'admin-inspector-type-F',
              spawnTestId: 'admin-inspector-spawn-fleet',
            },
          ]
      : []),
  ];

  const compatibleMoveProvinces = unit
    ? Object.values(provinces)
        .filter(
          (p) =>
            p.id !== provinceId &&
            canPlaceUnitTypeInProvince(unit.unit_type, p.type),
        )
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  return (
    <div
      className="admin-tile-inspector admin-sidebar-inspector"
      data-testid="admin-tile-inspector"
    >
      <div className="admin-inspector-card-header">
        <div className="floating-unit-title">
          {owner && (
            <span
              className="tactical-power-dot"
              data-testid="admin-inspector-owner-dot"
              style={{
                backgroundColor: POWER_METADATA[owner].color,
              }}
            />
          )}
          <strong>{provInfo.name}</strong>
        </div>
        <button
          type="button"
          className="floating-close-btn"
          data-testid="admin-inspector-close"
          onClick={onClose}
          title="Deselect territory"
        >
          <X size={14} />
          {compact && <span>Close</span>}
        </button>
      </div>

      <div className="admin-inspector-body">
        {/* 1. Territory / Supply Center Ownership (All non-sea, non-impassable territories) */}
        {provInfo.type !== 'SEA' && provInfo.type !== 'IMPASSABLE' && (
          <>
            <div className="admin-inspector-section">
              <label
                className="admin-inspector-label"
                htmlFor="admin-inspector-ownership-select"
              >
                <Crown size={12} /> Province Owner
              </label>
              <PowerFlagDropdown
                id="admin-inspector-ownership-select"
                testId="admin-inspector-ownership-select"
                value={owner}
                includeNeutral
                neutralLabel="Neutral (Unowned)"
                onChange={(selectedPower) =>
                  onStageOwnership(provinceId, selectedPower)
                }
              />
            </div>
            <hr
              className="admin-inspector-divider"
              data-testid="admin-inspector-divider"
            />
          </>
        )}

        {/* 2. Unit Controls (Edit existing unit OR Spawn new unit) */}
        {provInfo.type === 'IMPASSABLE' ? (
          <div className="floating-menu-hint">
            Impassable terrain — units cannot be placed here.
          </div>
        ) : unit ? (
          <div className="admin-inspector-section">
            <div
              className="admin-inspector-unit-header"
              data-testid="admin-inspector-unit-header"
            >
              <span
                className="admin-inspector-label"
                data-testid="admin-unit-settings-label"
              >
                <Pencil size={12} /> Unit Settings
              </span>
              <div
                className="admin-inspector-unit-actions-row"
                data-testid="admin-inspector-unit-actions-row"
              >
                <button
                  type="button"
                  data-testid="admin-inspector-relocate-btn"
                  data-active={isRelocating ? 'true' : undefined}
                  className={`tactical-mode-btn ${isRelocating ? 'active' : ''}`}
                  onClick={onToggleRelocate}
                  title="Click any compatible province on the map to relocate this unit"
                >
                  <MoveRight size={12} />
                  {isRelocating ? 'Click Map Tile…' : 'Move Now'}
                </button>
                <button
                  type="button"
                  className="admin-inspector-destroy-btn"
                  data-testid="admin-inspector-destroy-btn"
                  onClick={() => {
                    setPendingSpawn(null);
                    onStageDestroyUnit(unit.id);
                  }}
                  title="Delete this unit"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </div>

            <div className="admin-inspector-controls-grid">
              <div className="admin-inspector-field">
                <span className="admin-inspector-sublabel">Unit Type</span>
                <div className="floating-menu-buttons">
                  {unitTypeChoices.map((choice) => {
                    const isActive =
                      unit.unit_type === choice.unitType &&
                      (choice.coast === null
                        ? !unit.coast
                        : unit.coast === choice.coast);
                    return (
                      <button
                        key={choice.key}
                        type="button"
                        data-testid={choice.editTestId}
                        className={`tactical-mode-btn ${isActive ? 'active-hold' : ''}`}
                        onClick={() =>
                          onStageSpawnOrUpdateUnit(
                            provinceId,
                            unit.power,
                            choice.unitType,
                            choice.coast,
                          )
                        }
                      >
                        {choice.unitType === 'A' ? (
                          <Swords size={13} />
                        ) : (
                          <Anchor size={13} />
                        )}{' '}
                        {choice.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="admin-inspector-field">
                <label
                  className="admin-inspector-sublabel"
                  htmlFor="admin-inspector-unit-power"
                >
                  Owner
                </label>
                <PowerFlagDropdown
                  id="admin-inspector-unit-power"
                  testId="admin-inspector-unit-power"
                  value={unit.power}
                  onChange={(selectedPower) => {
                    if (selectedPower) {
                      onStageSpawnOrUpdateUnit(
                        provinceId,
                        selectedPower,
                        unit.unit_type,
                        unit.coast,
                      );
                    }
                  }}
                />
              </div>

              {/* Phase Order Override */}
              <div className="admin-inspector-field">
                <label
                  className="admin-inspector-sublabel"
                  htmlFor="admin-inspector-order-type"
                >
                  Order
                </label>
                <IconSelectDropdown<OrderType>
                  id="admin-inspector-order-type"
                  testId="admin-inspector-order-type"
                  value={order?.order_type ?? 'HOLD'}
                  options={ADMIN_ORDER_OPTIONS}
                  onChange={(nextType) => {
                    if (!nextType) return;
                    onStageUnitOrder({
                      unit_id: unit.id,
                      power: unit.power,
                      unit_type: unit.unit_type,
                      origin: unit.province,
                      origin_coast: unit.coast ?? null,
                      order_type: nextType,
                      target:
                        nextType === 'MOVE' ? (order?.target ?? null) : null,
                      via_convoy: false,
                      is_explicit: true,
                    });
                  }}
                />
                {order?.order_type === 'MOVE' && (
                  <IconSelectDropdown
                    id="admin-inspector-order-target"
                    testId="admin-inspector-order-target"
                    value={order.target ?? null}
                    options={compatibleMoveProvinces.map((p) => ({
                      value: p.id,
                      label: `${p.name} (${p.id})`,
                      testId: `admin-inspector-order-target-option-${p.id.toLowerCase()}`,
                    }))}
                    emptyOption={{
                      label: 'Target…',
                      testId: 'admin-inspector-order-target-option-empty',
                    }}
                    onChange={(nextTarget) => {
                      onStageUnitOrder({
                        ...order,
                        target: nextTarget,
                        is_explicit: true,
                      });
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="admin-inspector-section">
            <div className="admin-inspector-row">
              <span className="admin-inspector-label">
                <PlusCircle size={12} /> Spawn Unit
              </span>
            </div>

            <div className="admin-inspector-controls-grid">
              <div className="admin-inspector-field">
                <span className="admin-inspector-sublabel">Unit Type</span>
                <div className="floating-menu-buttons">
                  {unitTypeChoices.map((choice) => {
                    const isSelected =
                      pendingSpawn?.unitType === choice.unitType &&
                      pendingSpawn?.coast === choice.coast;
                    return (
                      <button
                        key={choice.key}
                        type="button"
                        data-testid={choice.spawnTestId}
                        className={`tactical-mode-btn ${isSelected ? 'active-hold' : ''}`}
                        onClick={() =>
                          setPendingSpawn((prev) =>
                            prev?.unitType === choice.unitType &&
                            prev?.coast === choice.coast
                              ? null
                              : {
                                  unitType: choice.unitType,
                                  coast: choice.coast,
                                },
                          )
                        }
                      >
                        {choice.unitType === 'A' ? (
                          <Swords size={13} />
                        ) : (
                          <Anchor size={13} />
                        )}{' '}
                        {choice.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="admin-inspector-field">
                <label
                  className="admin-inspector-sublabel"
                  htmlFor="admin-inspector-spawn-power"
                >
                  Owner
                </label>
                <PowerFlagDropdown
                  id="admin-inspector-spawn-power"
                  testId="admin-inspector-spawn-power"
                  value={null}
                  disabled={!pendingSpawn}
                  placeholder="Select Owner…"
                  onChange={(selectedPower) => {
                    if (selectedPower && pendingSpawn) {
                      onStageSpawnOrUpdateUnit(
                        provinceId,
                        selectedPower,
                        pendingSpawn.unitType,
                        pendingSpawn.coast,
                      );
                      setPendingSpawn(null);
                    }
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
