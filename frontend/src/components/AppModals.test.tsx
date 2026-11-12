// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AuthUser,
  GameState,
  MultiplayerGameSummary,
  ValidationIssue,
} from '../types/diplomacy';
import { AppModals, type AppModalsProps } from './AppModals';

const { seen, stub } = vi.hoisted(() => {
  const seen: Record<string, any> = {};
  const stub = (name: string) => (p: any) => {
    seen[name] = p;
    return <div data-modal={name} />;
  };
  return { seen, stub };
});
vi.mock('./SanityCheckModal', () => ({ SanityCheckModal: stub('sanity') }));
vi.mock('./SurrenderModal', () => ({ SurrenderModal: stub('surrender') }));
vi.mock('./SaveSandboxModal', () => ({ SaveSandboxModal: stub('save') }));
vi.mock('./AdminToolsModal', () => ({ AdminToolsModal: stub('admin') }));
vi.mock('./AuthModal', () => ({ AuthModal: stub('auth') }));

const STATE = { season: 'Fall', year: 1903 } as GameState;
const USER = { id: 'u1', displayName: 'Ada' } as AuthUser;
const GAME = { game_id: 'mp_1' } as MultiplayerGameSummary;

function props(over: Partial<AppModalsProps> = {}): AppModalsProps {
  return {
    gameState: STATE,
    provinces: {},
    activeGameId: 'mp_1',
    playerPower: 'FRANCE',
    sanityModalOpen: true,
    setSanityModalOpen: vi.fn(),
    sanityModalIssues: [],
    handleFinalizeClick: vi.fn(),
    setSelectedUnitId: vi.fn(),
    setHighlightedProvinces: vi.fn(),
    surrenderModalOpen: true,
    setSurrenderModalOpen: vi.fn(),
    surrenderModalGame: GAME,
    surrenderModalPower: 'FRANCE',
    handleSurrenderPower: vi.fn(),
    handleLeaveGame: vi.fn(),
    saveSandboxModalOpen: false,
    setSaveSandboxModalOpen: vi.fn(),
    savingSandbox: true,
    handleSaveSandboxToAccount: vi.fn(),
    isGameCreator: true,
    adminModalOpen: false,
    setAdminModalOpen: vi.fn(),
    adminOverrideActive: true,
    setAdminOverrideActive: vi.fn(),
    applyServerState: vi.fn(),
    fetchGamesList: vi.fn(async () => {}),
    handleLoadScenario: vi.fn(),
    triggerToast: vi.fn(),
    authUser: USER,
    setAuthUser: vi.fn(),
    authModalOpen: false,
    setAuthModalOpen: vi.fn(),
    authModalTab: 'signup',
    authModalReason: 'Why',
    confirmModal: <p>confirm here</p>,
    ...over,
  };
}

beforeEach(() => {
  for (const k of Object.keys(seen)) delete seen[k];
});

describe('AppModals', () => {
  it('renders every modal in order, then the confirm prompt', () => {
    const { container } = render(<AppModals {...props()} />);
    const order = [...container.children].map(
      (el) => el.getAttribute('data-modal') ?? el.textContent,
    );
    expect(order).toEqual([
      'sanity',
      'surrender',
      'save',
      'admin',
      'auth',
      'confirm here',
    ]);
  });

  it('wires the Sanity Check modal', () => {
    const p = props({ sanityModalIssues: [{} as ValidationIssue] });
    render(<AppModals {...p} />);
    const s = seen.sanity;
    expect(s.isOpen).toBe(true);
    expect(s.power).toBe('FRANCE');
    expect(s.issues).toBe(p.sanityModalIssues);
    s.onClose();
    expect(p.setSanityModalOpen).toHaveBeenCalledWith(false);
    s.onConfirmFinalizeAnyway();
    expect(p.handleFinalizeClick).toHaveBeenCalledWith(true);
  });

  it('inspecting an issue closes the check, selects its unit and lights its provinces', () => {
    const p = props();
    render(<AppModals {...p} />);
    seen.sanity.onInspectIssue({ unit_ids: ['U1', 'U2'], provinces: ['BUR'] });
    expect(p.setSanityModalOpen).toHaveBeenCalledWith(false);
    expect(p.setSelectedUnitId).toHaveBeenCalledWith('U1');
    expect(p.setHighlightedProvinces).toHaveBeenCalledWith(['BUR']);
    vi.mocked(p.setSelectedUnitId).mockClear();
    seen.sanity.onInspectIssue({ unit_ids: [], provinces: [] });
    expect(p.setSelectedUnitId).not.toHaveBeenCalled();
    expect(p.setHighlightedProvinces).toHaveBeenLastCalledWith([]);
  });

  it('wires the Surrender & Leave modal', () => {
    const p = props();
    render(<AppModals {...p} />);
    const s = seen.surrender;
    expect(s.isOpen).toBe(true);
    expect(s.game).toBe(GAME);
    expect(s.power).toBe('FRANCE');
    expect(s.onSurrender).toBe(p.handleSurrenderPower);
    expect(s.onLeave).toBe(p.handleLeaveGame);
    s.onClose();
    expect(p.setSurrenderModalOpen).toHaveBeenCalledWith(false);
  });

  it('names a saved sandbox after the player, the turn and their power', () => {
    const p = props();
    render(<AppModals {...p} />);
    const s = seen.save;
    expect(s.isOpen).toBe(false);
    expect(s.defaultName).toBe("Ada's Fall 1903 Study (France)");
    expect(s.saving).toBe(true);
    expect(s.onSave).toBe(p.handleSaveSandboxToAccount);
    s.onCancel();
    expect(p.setSaveSandboxModalOpen).toHaveBeenCalledWith(false);
    render(<AppModals {...props({ authUser: null })} />);
    expect(seen.save.defaultName).toBe('Tactical Sandbox Study');
    const blank = { season: '', year: 0 } as unknown as GameState;
    render(<AppModals {...props({ gameState: blank })} />);
    expect(seen.save.defaultName).toBe("Ada's Spring 1901 Study (France)");
  });

  it('gives the host the admin console', async () => {
    const p = props();
    render(<AppModals {...p} />);
    const a = seen.admin;
    expect(a.isOpen).toBe(false);
    expect(a.gameId).toBe('mp_1');
    expect(a.gameState).toBe(STATE);
    expect(a.provinces).toBe(p.provinces);
    expect(a.user).toBe(USER);
    expect(a.onToast).toBe(p.triggerToast);
    expect(a.adminOverrideActive).toBe(true);
    a.onClose();
    expect(p.setAdminModalOpen).toHaveBeenCalledWith(false);
    a.onStateUpdated(STATE);
    expect(p.applyServerState).toHaveBeenCalledWith(STATE);
    expect(p.fetchGamesList).toHaveBeenCalledTimes(1);
    a.onToggleAdminOverride();
    const flip = vi.mocked(p.setAdminOverrideActive).mock.calls[0][0] as (
      on: boolean,
    ) => boolean;
    expect(flip(true)).toBe(false);
    a.onResetScenario();
    expect(p.handleLoadScenario).toHaveBeenCalledWith('standard_1901');
  });

  it('shows no admin console to anyone else', () => {
    const { container } = render(
      <AppModals {...props({ isGameCreator: false })} />,
    );
    expect(seen.admin).toBeUndefined();
    expect(container.querySelector('[data-modal="admin"]')).toBeNull();
  });

  it('wires the sign-in modal', () => {
    const p = props();
    render(<AppModals {...p} />);
    const a = seen.auth;
    expect(a.isOpen).toBe(false);
    expect(a.initialTab).toBe('signup');
    expect(a.reasonBanner).toBe('Why');
    a.onClose();
    expect(p.setAuthModalOpen).toHaveBeenCalledWith(false);
    a.onSuccess(USER, 'Welcome');
    expect(p.setAuthUser).toHaveBeenCalledWith(USER);
    expect(p.triggerToast).toHaveBeenCalledWith('Welcome');
    expect(p.fetchGamesList).toHaveBeenCalledTimes(1);
    a.onSuccess(USER);
    expect(p.triggerToast).toHaveBeenCalledTimes(1);
    expect(p.fetchGamesList).toHaveBeenCalledTimes(2);
    expect(screen.getByText('confirm here')).toBeInTheDocument();
  });
});
