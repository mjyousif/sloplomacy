// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  CreateCampaignPanel,
  type CreateCampaignPanelProps,
} from './CreateCampaignPanel';
import { ME } from './lobby.testkit';

function setup(over: Partial<CreateCampaignPanelProps> = {}) {
  const props: CreateCampaignPanelProps = {
    user: ME,
    newGameName: '',
    setNewGameName: vi.fn(),
    isPrivate: false,
    setIsPrivate: vi.fn(),
    passcode: '',
    setPasscode: vi.fn(),
    selectedCreatePower: 'FRANCE',
    setSelectedCreatePower: vi.fn(),
    createError: null,
    creating: false,
    handleCreateMatch: vi.fn((e) => e.preventDefault()),
    ...over,
  };
  const view = render(<CreateCampaignPanel {...props} />);
  return { props, view, user: userEvent.setup() };
}

describe('CreateCampaignPanel', () => {
  it('is only the Host card, with no Join card beside it', () => {
    const { view } = setup();
    expect(view.container.children).toHaveLength(1);
    expect(view.container.firstElementChild).toHaveClass('lobby-create-card');
    expect(screen.queryByText('Join Private Campaign')).not.toBeInTheDocument();
  });

  it('reports the name, and public or private', async () => {
    const { props, user } = setup({ isPrivate: true });
    fireEvent.change(screen.getByLabelText('Campaign Name'), {
      target: { value: 'Vienna' },
    });
    expect(props.setNewGameName).toHaveBeenCalledWith('Vienna');
    await user.click(screen.getByRole('button', { name: /Public Lobby/ }));
    expect(props.setIsPrivate).toHaveBeenCalledWith(false);
    expect(props.setPasscode).toHaveBeenCalledWith('');
    await user.click(
      screen.getByRole('button', { name: /Private \(Passcode\)/ }),
    );
    expect(props.setIsPrivate).toHaveBeenLastCalledWith(true);
    expect(props.setPasscode).toHaveBeenCalledTimes(1);
  });

  it('asks for a passcode only when private', () => {
    const pub = setup();
    expect(
      screen.queryByLabelText('Campaign Passcode / PIN'),
    ).not.toBeInTheDocument();
    pub.view.unmount();
    const { props } = setup({ isPrivate: true, passcode: 'v1' });
    const input = screen.getByLabelText('Campaign Passcode / PIN');
    expect(input).toHaveValue('v1');
    expect(input).toBeRequired();
    fireEvent.change(input, { target: { value: 'v2' } });
    expect(props.setPasscode).toHaveBeenCalledWith('v2');
  });

  it('picks a country and names it on the submit button', async () => {
    const { props, user } = setup({ isPrivate: true });
    expect(
      screen.getByRole('button', { name: 'Create Private & Play as France' }),
    ).toBeInTheDocument();
    await user.click(screen.getByText('Germany'));
    expect(props.setSelectedCreatePower).toHaveBeenCalledWith('GERMANY');
  });

  it('submits, shows its busy state, a guest prompt and an error', () => {
    const a = setup();
    fireEvent.submit(
      screen
        .getByRole('button', { name: /Create & Play as France/ })
        .closest('form') as Element,
    );
    expect(a.props.handleCreateMatch).toHaveBeenCalledTimes(1);
    a.view.unmount();
    const b = setup({ creating: true });
    expect(
      screen.getByRole('button', { name: 'Creating Campaign...' }),
    ).toBeDisabled();
    b.view.unmount();
    setup({ user: null, createError: 'Name taken' });
    expect(
      screen.getByRole('button', { name: 'Sign In to Host Campaign' }),
    ).toBeEnabled();
    expect(screen.getByText('Name taken')).toBeInTheDocument();
  });
});
