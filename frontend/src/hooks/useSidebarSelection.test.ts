// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useSidebarSelection } from './useSidebarSelection';

/** The selection lives in App; the hook sits beside it, as in GameWorkspace. */
function setup() {
  return renderHook(() => {
    const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
    const picks = useSidebarSelection(selectedUnitId, setSelectedUnitId);
    return { selectedUnitId, setSelectedUnitId, ...picks };
  });
}

describe('useSidebarSelection', () => {
  it('suppresses the map menu for a unit picked on the sidebar', () => {
    const { result } = setup();
    act(() => result.current.selectFromSidebar('FRA_A_PAR'));
    expect(result.current.selectedUnitId).toBe('FRA_A_PAR');
    expect(result.current.suppressUnitMenu).toBe(true);
  });

  it('shows the menu for a unit picked on the map', () => {
    const { result } = setup();
    act(() => result.current.selectFromMap('FRA_A_PAR'));
    expect(result.current.selectedUnitId).toBe('FRA_A_PAR');
    expect(result.current.suppressUnitMenu).toBe(false);
  });

  it('shows the menu when the map re-picks the unit the sidebar picked', () => {
    const { result } = setup();
    act(() => result.current.selectFromSidebar('FRA_A_PAR'));
    act(() => result.current.selectFromMap('FRA_A_PAR'));
    expect(result.current.suppressUnitMenu).toBe(false);
  });

  it('forgets the sidebar pick once another unit, or none, is selected', () => {
    const { result } = setup();
    act(() => result.current.selectFromSidebar('FRA_A_PAR'));
    act(() => result.current.selectFromMap('FRA_A_MAR'));
    expect(result.current.suppressUnitMenu).toBe(false);
    // Coming back to the first by some other route (an issue link, say) is not a sidebar pick.
    act(() => result.current.setSelectedUnitId('FRA_A_PAR'));
    expect(result.current.suppressUnitMenu).toBe(false);

    act(() => result.current.selectFromSidebar('FRA_A_PAR'));
    act(() => result.current.selectFromSidebar(null));
    act(() => result.current.setSelectedUnitId('FRA_A_PAR'));
    expect(result.current.suppressUnitMenu).toBe(false);
  });
});
