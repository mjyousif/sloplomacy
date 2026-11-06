import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { PhaseTimerWidget, PhaseTimerWidgetProps } from './PhaseTimerWidget';
import { PhaseTimer } from '../types/diplomacy';

const voting: PhaseTimer = {
  stage: 'voting',
  deadline: 0,
  minutes: null,
  players: ['FRANCE', 'ENGLAND', 'ITALY'],
  votes: { FRANCE: '20' },
  extend_requests: [],
  ready_powers: [],
  remaining_seconds: 42,
  extensions_needed: 3,
};
const running: PhaseTimer = { ...voting, stage: 'running', minutes: 15, remaining_seconds: 845 };
const paused: PhaseTimer = { ...voting, stage: 'paused', remaining_seconds: null, ready_powers: ['ENGLAND'] };

function render(props: Partial<PhaseTimerWidgetProps>): string {
  const noop = () => undefined;
  return renderToString(
    React.createElement(PhaseTimerWidget, {
      timer: null,
      seatPower: 'FRANCE',
      isHost: false,
      hypothetical: false,
      onStart: noop,
      onVote: noop,
      onExtend: noop,
      onReady: noop,
      ...props,
    })
  );
}

describe('PhaseTimerWidget', () => {
  it('offers the start button to the host only', () => {
    expect(render({ isHost: true })).toContain('Start First Vote');
    const guest = render({ isHost: false });
    expect(guest).not.toContain('Start First Vote');
    expect(guest).toContain('Waiting for the host');
  });

  it('shows the vote options and who has yet to vote', () => {
    const html = render({ timer: voting });
    for (const option of ['15 min', '20 min', '30 min', 'Pause']) {
      expect(html).toContain(option);
    }
    expect(html).toContain('0:42');
    expect(html).toContain('Yet to vote:');
    expect(html).toContain('England, Italy');
    expect(html).not.toContain('France, England');
  });

  it('counts down in minutes and seconds with the extend button under the clock', () => {
    const html = render({ timer: running });
    expect(html).toContain('14:05');
    expect(html.indexOf('14:05')).toBeLessThan(html.indexOf('5 Minutes'));
    expect(html.replace(/<!-- -->/g, '')).toContain('5 Minutes (0/3)');
  });

  it('shows who a paused game is waiting on', () => {
    const html = render({ timer: paused }).replace(/<!-- -->/g, '');
    expect(html).toContain('Game Paused');
    expect(html).toContain('Ready Up');
    expect(html).toContain('Ready 1/3');
    expect(html).toContain('Waiting on: France, Italy');
  });

  it('lets someone without a seat watch but not act', () => {
    const watching = render({ timer: running, seatPower: null });
    expect(watching).toContain('14:05');
    expect(watching).not.toContain('5 Minutes');
    expect(render({ timer: paused, seatPower: 'TURKEY' })).not.toContain('Ready Up');
    expect(render({ timer: voting, seatPower: null })).toContain('disabled');
  });

  it('warns that the real clock runs on behind Hypothetical Mode', () => {
    expect(render({ timer: running, hypothetical: true })).toContain('real clock is still running');
    expect(render({ timer: running })).not.toContain('real clock is still running');
  });
});
