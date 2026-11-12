// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  SandboxToolsSection,
  type SandboxToolsSectionProps,
} from './SandboxToolsSection';

const props = (
  extra: Partial<SandboxToolsSectionProps> = {},
): SandboxToolsSectionProps => ({
  sandboxMode: false,
  onToggleSandboxMode: vi.fn(),
  onClearForeignPreMoves: vi.fn(),
  foreignModifiedOrdersCount: 0,
  onLoadScenario: vi.fn(),
  ...extra,
});

describe('SandboxToolsSection: the mode switch', () => {
  it('offers to enter, then to exit, Hypothetical Mode', async () => {
    const onToggleSandboxMode = vi.fn();
    const { rerender } = render(
      <SandboxToolsSection {...props({ onToggleSandboxMode })} />,
    );
    const toggle = screen.getByTestId('btn-toggle-sandbox');
    expect(toggle).toHaveTextContent('Enter Hypothetical Mode');
    expect(toggle).not.toHaveClass('active');
    expect(screen.queryByText('ACTIVE')).toBeNull();
    expect(
      screen.getByText(/Enter Hypothetical Mode to guess enemy moves/),
    ).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(onToggleSandboxMode).toHaveBeenCalledTimes(1);

    rerender(
      <SandboxToolsSection
        {...props({ onToggleSandboxMode, sandboxMode: true })}
      />,
    );
    expect(toggle).toHaveTextContent('Exit Mode (Discard Guesses)');
    expect(toggle).toHaveClass('active');
    expect(screen.getByText('ACTIVE')).toHaveClass('sandbox-live-pill');
    expect(screen.getByText(/Hypothetical Mode active/)).toBeInTheDocument();
  });
});

describe('SandboxToolsSection: General Staff AI', () => {
  it('needs a handler to show', () => {
    render(<SandboxToolsSection {...props()} />);
    expect(screen.queryByText('Tactical General Staff AI')).toBeNull();
  });

  it('plans opponents, all seven, and steps the turn in a solo game', async () => {
    const onGenerateAIMoves = vi.fn();
    const onAIStepTurn = vi.fn();
    render(
      <SandboxToolsSection {...props({ onGenerateAIMoves, onAIStepTurn })} />,
    );
    await userEvent.click(screen.getByText('Plan Opponents'));
    expect(onGenerateAIMoves).toHaveBeenLastCalledWith(undefined, false);
    await userEvent.click(screen.getByText('Plan All 7'));
    expect(onGenerateAIMoves).toHaveBeenLastCalledWith(undefined, true);
    await userEvent.click(screen.getByText('AI Step Turn'));
    expect(onAIStepTurn).toHaveBeenCalledTimes(1);
    expect(onGenerateAIMoves).toHaveBeenCalledTimes(2);
  });

  it('has no step button without a handler', () => {
    render(<SandboxToolsSection {...props({ onGenerateAIMoves: vi.fn() })} />);
    expect(screen.queryByText('AI Step Turn')).toBeNull();
  });

  it('hides the AI in a multiplayer match until Hypothetical Mode, and then has no step', () => {
    const shared = {
      isMultiplayer: true,
      onGenerateAIMoves: vi.fn(),
      onAIStepTurn: vi.fn(),
    };
    const { rerender } = render(<SandboxToolsSection {...props(shared)} />);
    expect(screen.queryByText('Plan Opponents')).toBeNull();
    rerender(
      <SandboxToolsSection {...props({ ...shared, sandboxMode: true })} />,
    );
    expect(screen.getByText('Plan Opponents')).toBeInTheDocument();
    expect(screen.getByText('Plan All 7')).toBeInTheDocument();
    expect(screen.queryByText('AI Step Turn')).toBeNull();
  });
});

describe('SandboxToolsSection: foreign moves', () => {
  it('counts the plotted foreign moves and clears them, in Hypothetical Mode only', async () => {
    const onClearForeignPreMoves = vi.fn();
    const { rerender } = render(
      <SandboxToolsSection
        {...props({ onClearForeignPreMoves, foreignModifiedOrdersCount: 3 })}
      />,
    );
    expect(screen.queryByText('3 foreign moves plotted')).toBeNull();
    rerender(
      <SandboxToolsSection
        {...props({
          onClearForeignPreMoves,
          foreignModifiedOrdersCount: 3,
          sandboxMode: true,
        })}
      />,
    );
    expect(screen.getByText('3 foreign moves plotted')).toBeInTheDocument();
    await userEvent.click(screen.getByTitle('Discard all foreign pre-moves'));
    expect(onClearForeignPreMoves).toHaveBeenCalledTimes(1);
    rerender(
      <SandboxToolsSection
        {...props({ foreignModifiedOrdersCount: 0, sandboxMode: true })}
      />,
    );
    expect(screen.queryByText(/foreign moves plotted/)).toBeNull();
  });
});

describe('SandboxToolsSection: scenario', () => {
  it('resets to the 1901 start and saves, in a solo sandbox', async () => {
    const onLoadScenario = vi.fn();
    const onSaveSandboxClick = vi.fn();
    render(
      <SandboxToolsSection
        {...props({ onLoadScenario, onSaveSandboxClick })}
      />,
    );
    await userEvent.click(screen.getByTestId('btn-reset-scenario'));
    expect(onLoadScenario).toHaveBeenCalledExactlyOnceWith('standard_1901');
    await userEvent.click(screen.getByTestId('btn-save-sandbox'));
    expect(onSaveSandboxClick).toHaveBeenCalledTimes(1);
  });

  it('has no save without a handler', () => {
    render(<SandboxToolsSection {...props()} />);
    expect(screen.getByTestId('btn-reset-scenario')).toBeInTheDocument();
    expect(screen.queryByTestId('btn-save-sandbox')).toBeNull();
  });

  it('offers neither in a multiplayer match', () => {
    render(
      <SandboxToolsSection
        {...props({ isMultiplayer: true, onSaveSandboxClick: vi.fn() })}
      />,
    );
    expect(screen.queryByTestId('btn-reset-scenario')).toBeNull();
    expect(screen.queryByTestId('btn-save-sandbox')).toBeNull();
  });
});
