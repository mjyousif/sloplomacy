import { Anchor, GripHorizontal, PlusCircle, Swords, X } from 'lucide-react';
import type { Order, Power, ProvinceInfo } from '../../../types/diplomacy';
import { cx } from '../../../utils/cx';
import { buildOrder, waiveOrder } from '../../../utils/orderBuilders';
import type { UnitMenuPlacement } from '../hooks/useUnitMenuPlacement';
import floatingStyles from './FloatingMenu.module.css';

interface BuildMenuProps {
  compact: boolean;
  placement: Pick<
    UnitMenuPlacement,
    'menuRef' | 'docked' | 'floatingStyle' | 'dragHeaderProps'
  >;
  provinces: Record<string, ProvinceInfo>;
  /** The build slot's id, `BUILD_<POWER>_<HOME>`. */
  slotId: string;
  home: string;
  /** What the slot holds now, if anything. */
  order: Order | null | undefined;
  /** The power that would build here. */
  power: Power;
  onUpdateOrder: (order: Order) => void;
  onClose: () => void;
}

/** The winter build menu for one home centre: an army, a fleet (per coast), or waive. */
export function BuildMenu({
  compact,
  placement,
  provinces,
  slotId,
  home,
  order,
  power,
  onUpdateOrder,
  onClose,
}: BuildMenuProps) {
  const { menuRef, docked, floatingStyle, dragHeaderProps } = placement;
  return (
    <div
      ref={menuRef}
      className={cx(
        floatingStyles.unitFloatingMenu,
        docked && floatingStyles.dockedBar,
      )}
      data-docked={docked ? 'true' : undefined}
      data-testid={compact ? 'unit-docked-bar' : 'unit-floating-menu'}
      style={{
        ...floatingStyle,
        borderColor: '#22c55e',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={floatingStyles.floatingMenuHeader}
        data-testid="floating-menu-header"
        {...dragHeaderProps}
      >
        <div className={floatingStyles.floatingUnitTitle}>
          <GripHorizontal
            size={13}
            className={floatingStyles.floatingDragGrip}
          />
          <PlusCircle size={13} style={{ color: '#4ade80' }} />
          <strong>Build in {provinces[home]?.name}</strong>
        </div>
        <button
          className={floatingStyles.floatingCloseBtn}
          data-testid="floating-close-btn"
          onClick={onClose}
          title="Close (Esc)"
        >
          <X size={14} />
          {compact && <span>Cancel</span>}
        </button>
      </div>

      <div className={floatingStyles.floatingMenuButtons}>
        <button
          className={floatingStyles.tacticalModeBtn}
          data-state={
            order?.order_type === 'BUILD' && order?.unit_type === 'A'
              ? 'hold'
              : undefined
          }
          onClick={() => {
            onUpdateOrder(buildOrder(slotId, power, home, 'A', null));
            onClose();
          }}
        >
          <Swords size={13} />+ Army
        </button>

        {provinces[home]?.type === 'COAST' &&
          (provinces[home]?.coasts?.length > 0 ? (
            provinces[home].coasts.map((cst) => (
              <button
                key={cst}
                className={floatingStyles.tacticalModeBtn}
                data-state={
                  order?.order_type === 'BUILD' &&
                  order?.unit_type === 'F' &&
                  order?.origin_coast === cst
                    ? 'hold'
                    : undefined
                }
                onClick={() => {
                  onUpdateOrder(buildOrder(slotId, power, home, 'F', cst));
                  onClose();
                }}
              >
                <Anchor size={13} />+ F ({cst})
              </button>
            ))
          ) : (
            <button
              className={floatingStyles.tacticalModeBtn}
              data-state={
                order?.order_type === 'BUILD' && order?.unit_type === 'F'
                  ? 'hold'
                  : undefined
              }
              onClick={() => {
                onUpdateOrder(buildOrder(slotId, power, home, 'F', null));
                onClose();
              }}
            >
              <Anchor size={13} />+ Fleet
            </button>
          ))}

        <button
          className={floatingStyles.tacticalModeBtn}
          data-state={order?.order_type === 'WAIVE' ? 'active' : undefined}
          onClick={() => {
            onUpdateOrder(waiveOrder(slotId, power, home));
            onClose();
          }}
        >
          <X size={13} />
          Waive
        </button>
      </div>
      <div
        className={floatingStyles.floatingMenuHint}
        data-testid="floating-menu-hint"
      >
        Choose unit type to build in {provinces[home]?.name} or Waive
      </div>
    </div>
  );
}
