import {
  Anchor,
  Crosshair,
  GripHorizontal,
  MoveRight,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
import {
  type Order,
  POWER_METADATA,
  type ProvinceInfo,
  type Unit,
} from '../../../types/diplomacy';
import { disbandOrder, holdOrder } from '../../../utils/orderBuilders';
import { getActiveOrderButton } from '../../../utils/orderHelpers';
import type { MapInteraction } from '../hooks/useMapInteraction';
import type { UnitMenuPlacement } from '../hooks/useUnitMenuPlacement';

interface UnitMenuProps {
  compact: boolean;
  placement: Pick<
    UnitMenuPlacement,
    'menuRef' | 'menuClassName' | 'floatingStyle' | 'dragHeaderProps'
  >;
  provinces: Record<string, ProvinceInfo>;
  unit: Unit;
  /** The unit's current order, if it has one. */
  order: Order | undefined;
  isRetreatPhase: boolean;
  isAdjustmentPhase: boolean;
  interaction: Pick<
    MapInteraction,
    | 'interactionMode'
    | 'moveModeChosen'
    | 'pendingAuxOrigin'
    | 'clearSelection'
    | 'chooseMove'
    | 'chooseRetreat'
    | 'chooseSupport'
    | 'chooseConvoy'
  >;
  onUpdateOrder: (order: Order) => void;
}

/**
 * The selected unit's menu: Retreat or Disband in a retreat phase, Keep or Disband in a winter
 * adjustment, and Move, Hold, Support or Convoy otherwise, with a hint for the step the player
 * is on. It floats beside the unit, or docks at the bottom of a phone's map.
 */
export function UnitMenu({
  compact,
  placement,
  provinces,
  unit,
  order,
  isRetreatPhase,
  isAdjustmentPhase,
  interaction,
  onUpdateOrder,
}: UnitMenuProps) {
  const {
    menuRef,
    menuClassName: className,
    floatingStyle,
    dragHeaderProps,
  } = placement;
  const { interactionMode, pendingAuxOrigin, clearSelection } = interaction;
  const activeOrderButton = getActiveOrderButton(
    interactionMode,
    order,
    interaction.moveModeChosen,
  );
  const tap = compact ? 'Tap' : 'Click';
  const tapLower = tap.toLowerCase();
  return (
    <div
      ref={menuRef}
      className={className}
      data-testid={compact ? 'unit-docked-bar' : undefined}
      style={floatingStyle}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="floating-menu-header" {...dragHeaderProps}>
        <div className="floating-unit-title">
          <GripHorizontal size={13} className="floating-drag-grip" />
          <span
            className="tactical-power-dot"
            style={{
              backgroundColor: POWER_METADATA[unit.power].color,
            }}
          />
          <strong>
            {unit.is_dislodged ? 'Dislodged ' : ''}
            {unit.unit_type === 'A' ? 'Army' : 'Fleet'}{' '}
            {provinces[unit.province]?.name}
          </strong>
        </div>
        <button
          className="floating-close-btn"
          onClick={clearSelection}
          title="Close (Esc)"
        >
          <X size={14} />
          {compact && <span>Cancel</span>}
        </button>
      </div>

      {isRetreatPhase ? (
        <>
          <div
            className="floating-menu-buttons"
            style={{ gridTemplateColumns: '1fr 1fr' }}
          >
            <button
              className={`tactical-mode-btn ${
                order?.order_type === 'RETREAT' ? 'active' : ''
              }`}
              onClick={interaction.chooseRetreat}
            >
              <MoveRight size={13} />
              Retreat
            </button>
            <button
              className={`tactical-mode-btn ${
                order?.order_type === 'DISBAND' ? 'active' : ''
              }`}
              style={{ borderColor: '#ef4444', color: '#fca5a5' }}
              onClick={() => {
                onUpdateOrder(disbandOrder(unit));
                clearSelection();
              }}
            >
              <Trash2 size={13} />
              Disband
            </button>
          </div>
          <div className="floating-menu-hint">
            {`${tap} a green province on the map to Retreat, or ${tapLower} Disband`}
          </div>
        </>
      ) : isAdjustmentPhase ? (
        <>
          <div
            className="floating-menu-buttons"
            style={{ gridTemplateColumns: '1fr 1fr' }}
          >
            <button
              className={`tactical-mode-btn ${
                order?.order_type !== 'DISBAND' ? 'active-hold' : ''
              }`}
              onClick={() => {
                onUpdateOrder(holdOrder(unit));
                clearSelection();
              }}
            >
              <Shield size={13} />
              Keep Unit
            </button>
            <button
              className={`tactical-mode-btn ${
                order?.order_type === 'DISBAND' ? 'active' : ''
              }`}
              style={{ borderColor: '#ef4444', color: '#fca5a5' }}
              onClick={() => {
                onUpdateOrder(disbandOrder(unit));
                clearSelection();
              }}
            >
              <Trash2 size={13} />
              Disband
            </button>
          </div>
          <div className="floating-menu-hint">
            Choose whether to Keep or Disband this unit for Winter Adjustments
          </div>
        </>
      ) : (
        <>
          <div className="floating-menu-buttons">
            <button
              className={`tactical-mode-btn ${activeOrderButton === 'MOVE' ? 'active' : ''}`}
              onClick={interaction.chooseMove}
            >
              <MoveRight size={13} />
              Move
            </button>

            <button
              className={`tactical-mode-btn ${
                activeOrderButton === 'HOLD' ? 'active-hold' : ''
              }`}
              onClick={() => {
                onUpdateOrder(holdOrder(unit));
                clearSelection();
              }}
            >
              <Shield size={13} />
              Hold
            </button>

            <button
              className={`tactical-mode-btn ${
                activeOrderButton === 'SUPPORT' ? 'active' : ''
              }`}
              onClick={interaction.chooseSupport}
            >
              <Crosshair size={13} />
              Support
            </button>

            {unit.unit_type === 'F' &&
              provinces[unit.province]?.type === 'SEA' && (
                <button
                  className={`tactical-mode-btn ${
                    activeOrderButton === 'CONVOY' ? 'active' : ''
                  }`}
                  onClick={interaction.chooseConvoy}
                >
                  <Anchor size={13} />
                  Convoy
                </button>
              )}
          </div>

          <div className="floating-menu-hint">
            {interactionMode === 'MOVE' &&
              (compact
                ? 'Tap a green province to Move'
                : 'Click a green province to Move • Drag header to move')}
            {interactionMode === 'SUPPORT_PICK_UNIT' &&
              `Step 1/2: ${tap} unit to Support`}
            {interactionMode === 'SUPPORT_PICK_TARGET' &&
              `Step 2/2: ${tap} destination for ${pendingAuxOrigin} (or ${tapLower} ${pendingAuxOrigin} to Hold)`}
            {interactionMode === 'CONVOY_PICK_ARMY' &&
              `Step 1/2: ${tap} coastal Army to Convoy (green = adjacent shore, blue = via fleet chain)`}
            {interactionMode === 'CONVOY_PICK_TARGET' &&
              `Step 2/2: ${tap} destination coast (green = direct / ready, blue = multi-ship chain)`}
          </div>
        </>
      )}
    </div>
  );
}
