// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SimulationBanner } from './SimulationBanner';

describe('SimulationBanner', () => {
  const props = {
    compact: false,
    sandboxMode: false,
    showSimulationOverlay: true,
    onAdjudicateTurn: vi.fn(),
    onClearSimulationOverlay: vi.fn(),
  };

  it('says the outcome is hypothetical, in one short line on a phone', () => {
    const { rerender } = render(<SimulationBanner {...props} />);
    expect(
      screen.getByText('HYPOTHETICAL PLANNING & OUTCOME PREVIEW'),
    ).toBeInTheDocument();
    rerender(<SimulationBanner {...props} compact />);
    expect(screen.getByText('HYPOTHETICAL')).toBeInTheDocument();
  });

  it('steps the turn and hides the preview', async () => {
    const onAdjudicateTurn = vi.fn();
    const onClearSimulationOverlay = vi.fn();
    render(
      <SimulationBanner
        {...props}
        onAdjudicateTurn={onAdjudicateTurn}
        onClearSimulationOverlay={onClearSimulationOverlay}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Step Turn Forward/ }));
    await user.click(screen.getByRole('button', { name: 'Hide Preview' }));
    expect(onAdjudicateTurn).toHaveBeenCalledOnce();
    expect(onClearSimulationOverlay).toHaveBeenCalledOnce();
  });

  it('has no Hide Preview in the sandbox, where the preview is always on', () => {
    render(<SimulationBanner {...props} sandboxMode />);
    expect(screen.queryByRole('button', { name: 'Hide Preview' })).toBeNull();
  });
});
