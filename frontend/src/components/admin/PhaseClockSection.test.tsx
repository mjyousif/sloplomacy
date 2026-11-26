// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState, PhaseTimer } from '../../types/diplomacy';
import { PhaseClockSection } from './PhaseClockSection';

vi.mock('../../lib/supabase', () => ({
  authedFetch: (url: string, init?: RequestInit) => fetch(url, init),
}));

const RUNNING: PhaseTimer = {
  stage: 'running',
  deadline: 0,
  minutes: 15,
  players: ['FRANCE', 'ENGLAND'],
  votes: {},
  extend_requests: [],
  ready_powers: [],
  remaining_seconds: 600,
  extensions_needed: 2,
  vote_minutes: [15, 20, 30],
  host_paused: false,
};

function stateWith(timer: PhaseTimer | null): GameState {
  return {
    game_id: 'mp_1',
    season: 'Spring',
    year: 1901,
    phase: 'Movement',
    timer,
    timer_settings: {
      vote_minutes: [15, 20, 30],
      fixed_phase_minutes: 5,
      vote_window_seconds: 60,
    },
  } as unknown as GameState;
}

const calls: { url: string; method?: string; body?: unknown }[] = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method,
        body: init?.body ? JSON.parse(init.body as string) : undefined,
      });
      return new Response(JSON.stringify(stateWith(RUNNING)), { status: 200 });
    }),
  );
});

function renderSection(timer: PhaseTimer | null, onError = vi.fn()) {
  const onStateUpdated = vi.fn();
  render(
    <PhaseClockSection
      gameId="mp_1"
      gameState={stateWith(timer)}
      onStateUpdated={onStateUpdated}
      onToast={vi.fn()}
      onError={onError}
    />,
  );
  return { onStateUpdated, onError };
}

describe('PhaseClockSection', () => {
  it('shows Off and starts the clock from Running', async () => {
    renderSection(null);
    expect(screen.getByTestId('admin-clock-status')).toHaveTextContent(
      'untimed',
    );
    expect(screen.getByTestId('btn-admin-clock-off')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.queryByTestId('picker-admin-clock-time-left-amount'),
    ).toBeNull();
    await userEvent.click(screen.getByTestId('btn-admin-clock-off'));
    expect(calls).toHaveLength(0);
    await userEvent.click(screen.getByTestId('btn-admin-clock-running'));
    expect(calls[0].url).toBe('/api/games/mp_1/timer/start');
  });

  it('pauses a running clock and nudges its deadline', async () => {
    const { onStateUpdated } = renderSection(RUNNING);
    expect(screen.getByTestId('btn-admin-clock-running')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(screen.getByTestId('btn-admin-clock-paused'));
    expect(calls[0]).toMatchObject({
      url: '/api/games/mp_1/timer/pause',
      method: 'POST',
    });
    expect(onStateUpdated).toHaveBeenCalled();

    await userEvent.click(screen.getByTestId('btn-admin-clock-nudge-5'));
    expect(calls[1]).toMatchObject({
      url: '/api/games/mp_1/timer/deadline',
      body: { adjust_seconds: 300 },
    });
    await userEvent.click(screen.getByTestId('btn-admin-clock-nudge--1'));
    expect(calls[2].body).toEqual({ adjust_seconds: -60 });
  });

  it('ends a vote with a length in hours', async () => {
    renderSection({ ...RUNNING, stage: 'voting', minutes: null });
    expect(screen.queryByTestId('btn-admin-clock-nudge-5')).toBeNull();
    const amount = screen.getByTestId('picker-admin-clock-time-left-amount');
    await userEvent.clear(amount);
    await userEvent.type(amount, '36');
    await userEvent.selectOptions(
      screen.getByTestId('picker-admin-clock-time-left-unit'),
      'hours',
    );
    const set = screen.getByTestId('btn-admin-clock-set-left');
    expect(set).toHaveTextContent('End Vote & Set Time');
    await userEvent.click(set);
    expect(calls[0].body).toEqual({ seconds_left: 36 * 3600 });
  });

  it('refuses to set an empty time left', async () => {
    const onError = vi.fn();
    renderSection(RUNNING, onError);
    await userEvent.clear(
      screen.getByTestId('picker-admin-clock-time-left-amount'),
    );
    await userEvent.click(screen.getByTestId('btn-admin-clock-set-left'));
    expect(calls).toHaveLength(0);
    expect(onError).toHaveBeenCalled();
  });

  it('sends a wall-clock end time as Unix seconds', async () => {
    renderSection(RUNNING);
    const date = screen.getByTestId('input-admin-clock-end-date');
    const time = screen.getByTestId('input-admin-clock-end-time');
    fireEvent.change(date, { target: { value: '2030-01-02' } });
    fireEvent.change(time, { target: { value: '21:30' } });
    await userEvent.click(screen.getByTestId('btn-admin-clock-set-end'));
    expect(calls[0].body).toEqual({
      deadline: new Date('2030-01-02T21:30').getTime() / 1000,
    });
  });

  it('lets only the host resume a host pause', async () => {
    renderSection({
      ...RUNNING,
      stage: 'paused',
      host_paused: true,
      remaining_seconds: null,
    });
    expect(screen.getByTestId('admin-clock-status')).toHaveTextContent(
      'Only you can resume',
    );
    expect(screen.getByTestId('btn-admin-clock-paused')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText(/Running opens a new vote/)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('btn-admin-clock-running'));
    expect(calls[0].url).toBe('/api/games/mp_1/timer/resume');
  });

  it('asks before turning the clock off', async () => {
    renderSection(RUNNING);
    await userEvent.click(screen.getByTestId('btn-admin-clock-off'));
    expect(calls).toHaveLength(0);
    await userEvent.click(screen.getByTestId('btn-confirm-modal-confirm'));
    expect(calls[0].url).toBe('/api/games/mp_1/timer/stop');
  });

  it('saves the lengths, dropping empty vote options', async () => {
    renderSection(RUNNING);
    await userEvent.clear(
      screen.getByTestId('picker-admin-clock-vote-2-amount'),
    );
    const first = screen.getByTestId('picker-admin-clock-vote-0-amount');
    await userEvent.clear(first);
    await userEvent.type(first, '1');
    await userEvent.selectOptions(
      screen.getByTestId('picker-admin-clock-vote-0-unit'),
      'days',
    );
    const fixed = screen.getByTestId('picker-admin-clock-fixed-amount');
    await userEvent.clear(fixed);
    await userEvent.type(fixed, '60');
    await userEvent.click(screen.getByTestId('btn-admin-clock-save-lengths'));
    expect(calls[0]).toMatchObject({
      url: '/api/games/mp_1/timer/settings',
      method: 'PUT',
      body: {
        vote_minutes: [20, 1440],
        fixed_phase_minutes: 60,
        vote_window_seconds: 60,
      },
    });
  });

  it('refuses lengths the server would refuse, without calling it', async () => {
    const onError = vi.fn();
    renderSection(RUNNING, onError);
    const second = screen.getByTestId('picker-admin-clock-vote-1-amount');
    await userEvent.clear(second);
    await userEvent.type(second, '15');
    await userEvent.click(screen.getByTestId('btn-admin-clock-save-lengths'));
    expect(calls).toHaveLength(0);
    expect(onError).toHaveBeenCalledWith('Vote lengths must all be different.');
  });

  it('shows a saved length in its biggest whole unit', () => {
    render(
      <PhaseClockSection
        gameId="mp_1"
        gameState={{
          ...stateWith(RUNNING),
          timer_settings: {
            vote_minutes: [90, 2880],
            fixed_phase_minutes: 5,
            vote_window_seconds: 60,
          },
        }}
        onStateUpdated={vi.fn()}
        onToast={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByTestId('picker-admin-clock-vote-0-amount')).toHaveValue(
      '90',
    );
    expect(screen.getByTestId('picker-admin-clock-vote-0-unit')).toHaveValue(
      '1',
    );
    expect(screen.getByTestId('picker-admin-clock-vote-1-amount')).toHaveValue(
      '2',
    );
    expect(screen.getByTestId('picker-admin-clock-vote-1-unit')).toHaveValue(
      '1440',
    );
    expect(screen.getByTestId('picker-admin-clock-vote-2-amount')).toHaveValue(
      '',
    );
  });

  it('starts the time boxes afresh when the turn changes', async () => {
    const props = {
      gameId: 'mp_1',
      onStateUpdated: vi.fn(),
      onToast: vi.fn(),
      onError: vi.fn(),
    };
    const { rerender } = render(
      <PhaseClockSection {...props} gameState={stateWith(RUNNING)} />,
    );
    const left = screen.getByTestId('picker-admin-clock-time-left-amount');
    await userEvent.clear(left);
    await userEvent.type(left, '488');
    fireEvent.change(screen.getByTestId('input-admin-clock-end-date'), {
      target: { value: '2020-01-01' },
    });

    rerender(
      <PhaseClockSection
        {...props}
        gameState={{ ...stateWith(RUNNING), season: 'Fall' }}
      />,
    );
    expect(
      screen.getByTestId('picker-admin-clock-time-left-amount'),
    ).toHaveValue('15');
    expect(
      (screen.getByTestId('input-admin-clock-end-date') as HTMLInputElement)
        .value,
    ).not.toBe('2020-01-01');
  });

  it('keeps only the digits of what is typed or pasted', async () => {
    renderSection(RUNNING);
    const window = screen.getByTestId('input-admin-clock-window');
    await userEvent.clear(window);
    await userEvent.type(window, '-.0002e5');
    expect(window).toHaveValue('0002');
    fireEvent.change(window, { target: { value: '12.5' } });
    expect(window).toHaveValue('125');
    const amount = screen.getByTestId('picker-admin-clock-time-left-amount');
    fireEvent.change(amount, { target: { value: '1.5' } });
    expect(amount).toHaveValue('15');
  });
});
