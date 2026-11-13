// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  JoinWithCodeCard,
  type JoinWithCodeCardProps,
} from './JoinWithCodeCard';
import { ME } from './lobby.testkit';

function setup(over: Partial<JoinWithCodeCardProps> = {}) {
  const props: JoinWithCodeCardProps = {
    user: ME,
    joinCodeGameId: '',
    setJoinCodeGameId: vi.fn(),
    joinCodePasscode: '',
    setJoinCodePasscode: vi.fn(),
    joinCodePower: 'ENGLAND',
    setJoinCodePower: vi.fn(),
    joinCodeLoading: false,
    joinCodeError: null,
    handleJoinCodeSubmit: vi.fn((e) => e.preventDefault()),
    ...over,
  };
  const view = render(<JoinWithCodeCard {...props} />);
  return { props, view, user: userEvent.setup() };
}

describe('JoinWithCodeCard', () => {
  it('is the card with the 20px gap above it', () => {
    const { view } = setup();
    const card = view.container.firstElementChild as HTMLElement;
    expect(card.className).toBe('lobby-create-card join-card');
    expect(card.style.marginTop).toBe('20px');
    expect(
      screen.getByRole('heading', { name: 'Join Private Campaign' }),
    ).toBeInTheDocument();
  });

  it('explains what the card is for', () => {
    setup();
    expect(
      screen.getByText(/Have a Game ID and passcode from a host\?/),
    ).toBeInTheDocument();
  });

  it('shows the fields and reports each edit', async () => {
    const { props } = setup({ joinCodeGameId: 'mp_9', joinCodePasscode: 'pw' });
    expect(screen.getByLabelText('Game ID')).toHaveValue('mp_9');
    expect(screen.getByLabelText('Game ID')).toBeRequired();
    expect(screen.getByLabelText('Lobby Passcode')).toHaveValue('pw');
    expect(screen.getByLabelText('Lobby Passcode')).not.toBeRequired();
    fireEvent.change(screen.getByLabelText('Game ID'), {
      target: { value: 'mp_10' },
    });
    fireEvent.change(screen.getByLabelText('Lobby Passcode'), {
      target: { value: 'x' },
    });
    expect(props.setJoinCodeGameId).toHaveBeenCalledWith('mp_10');
    expect(props.setJoinCodePasscode).toHaveBeenCalledWith('x');
  });

  it('marks the nation being claimed, and hints at the id format', () => {
    setup({ joinCodePower: 'ITALY' });
    expect(screen.getByLabelText('Game ID')).toHaveAttribute(
      'placeholder',
      'e.g. mp_3d8f2b',
    );
    expect(screen.getByLabelText('Lobby Passcode')).toHaveAttribute(
      'placeholder',
      'Enter lobby passcode',
    );
    const marked = document.querySelectorAll('.create-power-option.selected');
    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveTextContent('Italy');
  });

  it('picks the nation and names it on the button', async () => {
    const { props, user } = setup({ joinCodePower: 'ENGLAND' });
    expect(
      screen.getByRole('button', { name: /Unlock & Claim England/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByText('Russia'));
    expect(props.setJoinCodePower).toHaveBeenCalledWith('RUSSIA');
  });

  it('submits through the form', () => {
    const { props } = setup({ joinCodeGameId: 'mp_9' });
    fireEvent.submit(
      screen
        .getByRole('button', { name: /Unlock & Claim/ })
        .closest('form') as Element,
    );
    expect(props.handleJoinCodeSubmit).toHaveBeenCalledTimes(1);
  });

  it('is disabled until a Game ID is typed, and while joining', () => {
    const empty = setup({ joinCodeGameId: '   ' });
    expect(
      screen.getByRole('button', { name: /Unlock & Claim/ }),
    ).toBeDisabled();
    empty.view.unmount();
    const ready = setup({ joinCodeGameId: 'mp_9' });
    expect(
      screen.getByRole('button', { name: /Unlock & Claim/ }),
    ).toBeEnabled();
    ready.view.unmount();
    setup({ joinCodeGameId: 'mp_9', joinCodeLoading: true });
    const busy = screen.getByRole('button', { name: 'Verifying & Joining...' });
    expect(busy).toBeDisabled();
  });

  it('asks a guest to sign in, and shows an error', () => {
    setup({ user: null, joinCodeError: 'Wrong passcode.' });
    expect(
      screen.getByRole('button', { name: 'Sign In to Join Campaign' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Wrong passcode.')).toBeInTheDocument();
  });

  it('shows no error box when there is none', () => {
    const { view } = setup();
    expect(screen.queryByTestId('join-code-error')).toBeNull();
  });
});
