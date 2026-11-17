// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { unitAt } from '../test/mapFixtures';
import { ToolsSidebar, type ToolsSidebarProps } from './ToolsSidebar';

const props = (extra: Partial<ToolsSidebarProps> = {}): ToolsSidebarProps => ({
  collapsed: false,
  onToggleCollapse: vi.fn(),
  activePower: 'FRANCE',
  onSelectPower: vi.fn(),
  ownership: { PAR: 'FRANCE', LON: 'ENGLAND' },
  units: [unitAt('FRANCE', 'A', 'PAR')],
  finalizedPowers: [],
  issues: [],
  sandboxMode: false,
  onToggleSandboxMode: vi.fn(),
  onClearForeignPreMoves: vi.fn(),
  foreignModifiedOrdersCount: 0,
  onLoadScenario: vi.fn(),
  ...extra,
});

describe('ToolsSidebar panel', () => {
  it('stacks the sections in order without map camera controls', () => {
    render(<ToolsSidebar {...props()} />);
    const text = document.body.textContent ?? '';
    const order = [
      'CHANCELLERY TOOLS',
      'COMMAND NATION (SELECT)',
      'HYPOTHETICAL MODE & PRE-MOVES',
    ].map((t) => text.indexOf(t));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(screen.queryByText('MAP VIEW & CAMERA')).toBeNull();
    expect(screen.queryByTestId('tools-drawer')).toBeNull();
    expect(
      screen.getByLabelText('Chancellery Tools & Intel'),
    ).not.toHaveAttribute('role');
    expect(screen.queryByText('CREATOR ADMIN TOOLS')).toBeNull();
    expect(screen.queryByText('TACTICAL MAP LEGEND')).toBeNull();
    expect(screen.queryByText('Intel, Camera & War Room')).toBeNull();
  });

  it('collapses with its header button and folds to the rail', async () => {
    const onToggleCollapse = vi.fn();
    const { rerender } = render(
      <ToolsSidebar {...props({ onToggleCollapse })} />,
    );
    await userEvent.click(screen.getByTestId('tools-sidebar-collapse-btn'));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
    rerender(
      <ToolsSidebar {...props({ onToggleCollapse, collapsed: true })} />,
    );
    expect(
      screen.getByLabelText('Tools Sidebar Collapsed'),
    ).toBeInTheDocument();
    expect(screen.queryByText('CHANCELLERY TOOLS')).toBeNull();
  });

  it('does not render any creator admin section in the left sidebar', () => {
    render(<ToolsSidebar {...props({ adminOverrideActive: true })} />);
    expect(screen.queryByText('CREATOR ADMIN TOOLS')).toBeNull();
    expect(screen.queryByTestId('btn-open-admin-console')).toBeNull();
  });

  it('hands each section what it reads', async () => {
    const p = props({
      isMultiplayer: true,
      sandboxMode: true,
      surrenderedPowers: ['ENGLAND'],
      showAllMoves: true,
      onChangeShowAllMoves: vi.fn(),
      foreignModifiedOrdersCount: 2,
    });
    render(<ToolsSidebar {...p} />);
    expect(screen.getByText('DIPLOMATIC STANDING')).toBeInTheDocument();
    expect(screen.getByTestId('standings-moves-all')).toBeInTheDocument();
    expect(screen.getByTestId('standings-moves-selected')).toBeInTheDocument();
    expect(screen.getByTitle('Civil Disorder')).toBeInTheDocument();
    expect(screen.getByText('2 foreign moves plotted')).toBeInTheDocument();
    expect(screen.queryByText('Plan All 7')).toBeNull();
    await userEvent.click(screen.getByTestId('btn-toggle-sandbox'));
    expect(p.onToggleSandboxMode).toHaveBeenCalledTimes(1);
  });

  it('passes the direct-edit override down', () => {
    const issue = {
      id: 'i',
      severity: 'error',
      code: 'X',
      title: 't',
      message: 'm',
      unit_ids: [],
      provinces: [],
      power: 'ENGLAND',
    } as unknown as ToolsSidebarProps['issues'][number];
    const { rerender } = render(
      <ToolsSidebar
        {...props({
          issues: [issue],
        })}
      />,
    );
    // England's issue is hidden from France's player...
    expect(screen.queryByTitle('1 issues')).toBeNull();
    // ...until the host's direct-edit override is on
    rerender(
      <ToolsSidebar
        {...props({ issues: [issue], adminOverrideActive: true })}
      />,
    );
    expect(screen.getByTitle('1 issues')).toBeInTheDocument();
  });

  it('pins the history footer below the sections', () => {
    render(
      <ToolsSidebar {...props({ historyFooter: <footer>turns</footer> })} />,
    );
    const aside = screen.getByLabelText('Chancellery Tools & Intel');
    expect(aside.lastElementChild).toHaveTextContent('turns');
  });

  it('does not show its footer on the collapsed rail', () => {
    render(
      <ToolsSidebar
        {...props({ collapsed: true, historyFooter: <footer>turns</footer> })}
      />,
    );
    expect(screen.queryByText('turns')).toBeNull();
  });
});

/** Every callback is its own spy, so a swapped pair of same-typed handlers shows up here. */
function spies() {
  return {
    onToggleCollapse: vi.fn(),
    onSelectPower: vi.fn(),
    onChangeShowAllMoves: vi.fn(),
    onToggleSandboxMode: vi.fn(),
    onClearForeignPreMoves: vi.fn(),
    onLoadScenario: vi.fn(),
    onSaveSandboxClick: vi.fn(),
    onClose: vi.fn(),
  };
}

/** Presses `press`, and requires that only the named spy was called, once. */
async function expectOnly(
  s: ReturnType<typeof spies>,
  name: keyof ReturnType<typeof spies>,
  press: () => Promise<void>,
) {
  await press();
  for (const [key, spy] of Object.entries(s)) {
    expect(spy, `${key} after pressing for ${name}`).toHaveBeenCalledTimes(
      key === name ? 1 : 0,
    );
  }
}

describe('ToolsSidebar wiring', () => {
  const full = (s: ReturnType<typeof spies>) =>
    props({
      ...s,
      sandboxMode: true,
      showAllMoves: true,
      foreignModifiedOrdersCount: 2,
    });

  it('sends each panel button to its own callback', async () => {
    const buttons: [keyof ReturnType<typeof spies>, () => HTMLElement][] = [
      [
        'onToggleCollapse',
        () => screen.getByTestId('tools-sidebar-collapse-btn'),
      ],
      ['onSelectPower', () => screen.getAllByTestId('power-standing-card')[0]],
      [
        'onChangeShowAllMoves',
        () => screen.getByTestId('standings-moves-selected'),
      ],
      ['onToggleSandboxMode', () => screen.getByTestId('btn-toggle-sandbox')],
      [
        'onClearForeignPreMoves',
        () => screen.getByTitle('Discard all foreign pre-moves'),
      ],
    ];
    for (const [name, find] of buttons) {
      const s = spies();
      const { unmount } = render(<ToolsSidebar {...full(s)} />);
      await expectOnly(s, name, () => userEvent.click(find()));
      unmount();
    }
  });

  it('sends each rail button to its own callback', async () => {
    const buttons: [keyof ReturnType<typeof spies>, () => HTMLElement][] = [
      [
        'onToggleCollapse',
        () => screen.getByTestId('tools-sidebar-expand-btn'),
      ],
      ['onToggleSandboxMode', () => screen.getByTitle(/Hypothetical Mode/)],
    ];
    for (const [name, find] of buttons) {
      const s = spies();
      const { unmount } = render(
        <ToolsSidebar {...full(s)} collapsed adminOverrideActive={false} />,
      );
      await expectOnly(s, name, () => userEvent.click(find()));
      unmount();
    }
  });

  it('shows the panel state on the rail: sandbox glow', () => {
    const { rerender } = render(
      <ToolsSidebar {...props({ collapsed: true })} />,
    );
    expect(screen.getByTitle('Enter Hypothetical Mode')).not.toHaveAttribute(
      'data-active',
      'true',
    );
    expect(screen.queryByTitle('Creator Admin Console')).toBeNull();
    rerender(
      <ToolsSidebar
        {...props({
          collapsed: true,
          sandboxMode: true,
          adminOverrideActive: true,
        })}
      />,
    );
    expect(screen.getByTitle(/Hypothetical Mode ACTIVE/)).toHaveAttribute(
      'data-active',
      'true',
    );
    expect(screen.queryByTitle('Creator Admin Console')).toBeNull();
  });

  it('feeds the standings from the game state it is given', () => {
    render(
      <ToolsSidebar
        {...props({
          activePower: 'ENGLAND',
          finalizedPowers: ['ENGLAND'],
          units: [unitAt('FRANCE', 'A', 'PAR'), unitAt('FRANCE', 'F', 'BRE')],
          ownership: {
            PAR: 'FRANCE',
            BRE: 'FRANCE',
            MAR: 'FRANCE',
            LON: 'ENGLAND',
          },
        })}
      />,
    );
    const cards = screen.getAllByTestId('power-standing-card');
    const france = cards.find((c) => c.getAttribute('data-power') === 'FRANCE');
    const england = cards.find(
      (c) => c.getAttribute('data-power') === 'ENGLAND',
    );
    expect(france).toHaveTextContent('3 SC');
    expect(france).toHaveTextContent('2 Units');
    expect(england).toHaveAttribute('data-selected', 'true');
    expect(england?.querySelector('[title="Finalized"]')).not.toBeNull();
  });

  it('starts a drawer closed unless told it is open', () => {
    render(<ToolsSidebar {...props({ variant: 'drawer' })} />);
    expect(screen.getByTestId('tools-drawer-layer')).not.toHaveAttribute(
      'data-open',
      'true',
    );
  });

  it('shows the sandbox panel in the mode it is given without Reset 1901 or Save Sandbox buttons', () => {
    const { rerender } = render(
      <ToolsSidebar {...props({ isMultiplayer: true })} />,
    );
    expect(screen.getByTestId('btn-toggle-sandbox')).toBeInTheDocument();
    expect(screen.queryByTestId('standings-moves-all')).toBeNull();
    expect(screen.queryByTestId('btn-reset-scenario')).toBeNull();
    expect(screen.queryByTestId('btn-save-sandbox')).toBeNull();
    rerender(
      <ToolsSidebar
        {...props({
          showAllMoves: true,
          onChangeShowAllMoves: vi.fn(),
        })}
      />,
    );
    expect(screen.getByTestId('standings-moves-all')).toBeInTheDocument();
    expect(screen.queryByTestId('btn-reset-scenario')).toBeNull();
    expect(screen.queryByTestId('btn-save-sandbox')).toBeNull();
  });
});

describe('ToolsSidebar drawer', () => {
  const drawer = (extra: Partial<ToolsSidebarProps> = {}) =>
    props({ variant: 'drawer', open: true, onClose: vi.fn(), ...extra });

  it('is a modal dialog with no zoom section, and never folds to the rail', () => {
    render(<ToolsSidebar {...drawer({ collapsed: true })} />);
    const dialog = screen.getByTestId('tools-drawer');
    expect(dialog).toHaveAttribute('role', 'dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('data-drawer', 'true');
    expect(screen.queryByText('MAP VIEW & CAMERA')).toBeNull();
    expect(screen.queryByTestId('tools-sidebar-collapse-btn')).toBeNull();
    expect(screen.getByText('COMMAND NATION (SELECT)')).toBeInTheDocument();
    expect(screen.queryByText('TACTICAL MAP LEGEND')).toBeNull();
    expect(screen.queryByLabelText('Tools Sidebar Collapsed')).toBeNull();
  });

  it('stays mounted but inert while closed, and shows when open', () => {
    const { rerender } = render(<ToolsSidebar {...drawer({ open: false })} />);
    const layer = screen.getByTestId('tools-drawer-layer');
    expect(layer).not.toHaveAttribute('data-open', 'true');
    expect(layer).toHaveAttribute('inert');
    rerender(<ToolsSidebar {...drawer()} />);
    expect(layer).toHaveAttribute('data-open', 'true');
    expect(layer).not.toHaveAttribute('inert');
  });

  it('takes focus when it opens', () => {
    render(<ToolsSidebar {...drawer()} />);
    expect(screen.getByTestId('tools-drawer-close-btn')).toHaveFocus();
  });

  it('closes from the button, the backdrop and Escape, but only while open', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<ToolsSidebar {...drawer({ onClose })} />);
    await userEvent.click(screen.getByTestId('tools-drawer-close-btn'));
    await userEvent.click(screen.getByTestId('tools-drawer-backdrop'));
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
    rerender(<ToolsSidebar {...drawer({ onClose, open: false })} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('stops listening for Escape once unmounted', () => {
    const onClose = vi.fn();
    const { unmount } = render(<ToolsSidebar {...drawer({ onClose })} />);
    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
