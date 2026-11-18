// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ActionFilterChips,
  PowerFilterChips,
  powerCode,
} from './TurnHistorySelector';

describe('powerCode', () => {
  it('abbreviates power names to three-letter uppercase codes', () => {
    expect(powerCode('FRANCE')).toBe('FRA');
    expect(powerCode('AUSTRIA')).toBe('AUS');
    expect(powerCode('TURKEY')).toBe('TUR');
  });
});

describe('PowerFilterChips', () => {
  it('renders all 7 powers and toggles selections or resets with All', () => {
    const onSelectPowers = vi.fn();
    render(
      <PowerFilterChips
        powers={['FRANCE']}
        disabled={false}
        onSelectPowers={onSelectPowers}
      />,
    );

    const chips = screen.getAllByTestId('turn-history-power');
    expect(chips).toHaveLength(8);
    expect(chips[0]).toHaveAttribute('data-power', 'ALL');

    const germanyChip = chips.find(
      (el) => el.getAttribute('data-power') === 'GERMANY',
    )!;
    fireEvent.click(germanyChip);
    expect(onSelectPowers).toHaveBeenCalledWith(['FRANCE', 'GERMANY']);

    fireEvent.click(chips[0]);
    expect(onSelectPowers).toHaveBeenCalledWith([]);
  });

  it('can omit the leading All chip and respect disabled state', () => {
    const onSelectPowers = vi.fn();
    render(
      <PowerFilterChips
        powers={[]}
        disabled={true}
        showAllChip={false}
        onSelectPowers={onSelectPowers}
      />,
    );

    const chips = screen.getAllByTestId('turn-history-power');
    expect(chips).toHaveLength(7);
    expect(screen.getByRole('group', { name: 'Nations shown' })).toBeDisabled();
  });
});

describe('ActionFilterChips', () => {
  it('renders Movement and Adjustments action chips and toggles selected actions', () => {
    const onSelectActions = vi.fn();
    const { rerender } = render(
      <ActionFilterChips
        actions={['HOLD']}
        onSelectActions={onSelectActions}
      />,
    );

    const moveChips = screen.getAllByTestId('turn-history-action');
    expect(moveChips).toHaveLength(4);
    expect(moveChips.map((el) => el.getAttribute('data-action'))).toEqual([
      'HOLD',
      'SUPPORT',
      'CONVOY',
      'MOVE',
    ]);

    const moveChip = moveChips.find(
      (el) => el.getAttribute('data-action') === 'MOVE',
    )!;
    fireEvent.click(moveChip);
    expect(onSelectActions).toHaveBeenCalledWith(['HOLD', 'MOVE']);

    rerender(
      <ActionFilterChips
        actions={[]}
        availableActions={['BUILD', 'DISBAND', 'WAIVE']}
        onSelectActions={onSelectActions}
      />,
    );
    expect(
      screen
        .getAllByTestId('turn-history-action')
        .map((el) => el.getAttribute('data-action')),
    ).toEqual(['BUILD', 'DISBAND', 'WAIVE']);
  });
});
