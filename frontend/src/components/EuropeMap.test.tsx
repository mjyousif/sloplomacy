// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FRANCE_PROVINCES, orderFor, unitAt } from '../test/mapFixtures';
import type { Order } from '../types/diplomacy';
import { EuropeMap, type EuropeMapProps } from './EuropeMap';

const PAR = unitAt('FRANCE', 'A', 'PAR');
const MAR = unitAt('FRANCE', 'A', 'MAR');

/** The map with its selection held the way App holds it. */
function MapWithSelection(props: Partial<EuropeMapProps>) {
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  return (
    <EuropeMap
      provinces={FRANCE_PROVINCES}
      units={[PAR, MAR]}
      orders={{}}
      ownership={{}}
      activePower="FRANCE"
      sandboxMode={false}
      selectedUnitId={selectedUnitId}
      hoveredUnitId={null}
      highlightedProvinces={[]}
      issues={[]}
      simulationResult={null}
      showSimulationOverlay={false}
      onSelectUnit={setSelectedUnitId}
      onHoverUnit={() => {}}
      onUpdateOrder={() => {}}
      onClearSimulationOverlay={() => {}}
      onAdjudicateTurn={() => {}}
      pieceStyle="classic"
      unitMark="letters"
      {...props}
    />
  );
}

const unitToken = (id: string) =>
  document.querySelector<SVGGElement>(
    `[data-testid="unit-token"][data-unit-id="${id}"]`,
  )!;
const menuButton = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name}$`) });

describe('EuropeMap unit menu', () => {
  it('shows a saved Hold on each newly selected unit, even after Move was pressed on the last one', () => {
    const orders: Record<string, Order> = {
      [PAR.id]: orderFor(PAR, 'HOLD'),
      [MAR.id]: orderFor(MAR, 'HOLD'),
    };
    render(<MapWithSelection orders={orders} />);

    fireEvent.click(unitToken(PAR.id));
    expect(menuButton('Hold')).toHaveClass('active-hold');
    fireEvent.click(menuButton('Move'));
    expect(menuButton('Move')).toHaveClass('active');
    expect(menuButton('Hold')).not.toHaveClass('active-hold');

    // Pressing Move belonged to Paris. Marseilles' saved Hold shows as it is.
    fireEvent.click(unitToken(MAR.id));
    expect(screen.getByText('Army Marseilles')).toBeInTheDocument();
    expect(menuButton('Hold')).toHaveClass('active-hold');
    expect(menuButton('Move')).not.toHaveClass('active');
  });

  it("opens the next unit's menu where it belongs, not where the last one was dragged", () => {
    const { container } = render(<MapWithSelection />);
    const menu = () =>
      container.querySelector<HTMLDivElement>('.unit-floating-menu')!;
    const position = () => ({ left: menu().style.left, top: menu().style.top });

    // Where Marseilles' menu opens when nothing has been dragged.
    fireEvent.click(unitToken(MAR.id));
    const marseillesHome = position();
    fireEvent.click(unitToken(MAR.id)); // deselect

    // Drag Paris' menu 120px right and 60px down by its header.
    fireEvent.click(unitToken(PAR.id));
    const header = menu().querySelector<HTMLDivElement>(
      '.floating-menu-header',
    )!;
    header.setPointerCapture = vi.fn();
    header.hasPointerCapture = vi.fn(() => true);
    fireEvent.pointerDown(header, { button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(header, { clientX: 320, clientY: 260 });
    fireEvent.lostPointerCapture(header);

    // Straight from Paris to Marseilles, without closing the menu first.
    fireEvent.click(unitToken(MAR.id));
    expect(screen.getByText('Army Marseilles')).toBeInTheDocument();
    expect(position()).toEqual(marseillesHome);
  });
});
