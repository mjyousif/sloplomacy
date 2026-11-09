import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { AuthUser } from '../types/diplomacy';
import {
  fetchAccountDisplayPrefs,
  getAuthHeaders,
  getInitialAuthUser,
  saveAccountDisplayPrefs,
  signInWithEmailPassword,
  signOutUser,
  signUpWithEmailPassword,
  subscribeToAuthChanges,
} from './supabase';

const supabaseAuth = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: supabaseAuth }),
}));

describe('supabase auth & local fallback helper', () => {
  beforeAll(() => {
    const store: Record<string, string> = {};
    globalThis.localStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        Object.keys(store).forEach((k) => delete store[k]);
      },
      key: () => null,
      length: 0,
    } as any;
  });

  beforeEach(async () => {
    await signOutUser();
  });

  it('validates email format and password length', async () => {
    const invalidEmail = await signInWithEmailPassword(
      'invalid-email',
      '123456',
    );
    expect(invalidEmail.error).toBe('Please enter a valid email address.');
    expect(invalidEmail.user).toBeNull();

    const shortPassword = await signInWithEmailPassword(
      'test@diplomacy.eu',
      '123',
    );
    expect(shortPassword.error).toBe('Password must be at least 6 characters.');
    expect(shortPassword.user).toBeNull();
  });

  it('handles local dev fallback guest sign-in when Supabase is not configured', async () => {
    const res = await signInWithEmailPassword(
      'churchill@uk.gov',
      'password123',
    );
    expect(res.error).toBeNull();
    expect(res.user?.email).toBe('churchill@uk.gov');
    expect(res.user?.isLocalDemo).toBe(true);

    const initial = await getInitialAuthUser();
    expect(initial?.email).toBe('churchill@uk.gov');

    await signOutUser();
    const afterSignOut = await getInitialAuthUser();
    expect(afterSignOut).toBeNull();
  });

  it('supports sign-up with custom display name in local mode', async () => {
    const res = await signUpWithEmailPassword(
      'bismarck@germany.gov',
      'securepass123',
      'Otto von Bismarck',
    );
    expect(res.error).toBeNull();
    expect(res.user?.displayName).toBe('Otto von Bismarck');
  });

  it('notifies subscribers on auth state transitions', async () => {
    const received: (AuthUser | null)[] = [];
    const unsubscribe = subscribeToAuthChanges((u) => {
      received.push(u);
    });

    await signInWithEmailPassword('clemenceau@france.gov', 'password123');
    await signOutUser();
    unsubscribe();

    expect(received.length).toBeGreaterThanOrEqual(2);
    expect(received[0]?.email).toBe('clemenceau@france.gov');
    expect(received[1]).toBeNull();
  });

  it('returns empty headers when unauthenticated and bearer token when signed in', async () => {
    const unauthHeaders = await getAuthHeaders();
    expect(unauthHeaders).toEqual({});

    await signInWithEmailPassword('napoleon@france.gov', 'password123');
    const authHeaders = await getAuthHeaders();
    expect(authHeaders.Authorization).toBeDefined();
    expect(authHeaders.Authorization.startsWith('Bearer ')).toBe(true);

    await signOutUser();
    const afterSignOut = await getAuthHeaders();
    expect(afterSignOut).toEqual({});
  });
});

describe('display preferences on an account', () => {
  const prefs = { pieceStyle: 'flags', unitMark: 'vehicles' };
  const demoUser = (id: string): AuthUser => ({
    id,
    email: `${id}@local.test`,
    displayName: id,
    isLocalDemo: true,
  });

  describe('local demo accounts', () => {
    it("keeps each account's choice separate", async () => {
      await saveAccountDisplayPrefs(demoUser('one'), prefs);

      expect((await fetchAccountDisplayPrefs(demoUser('one'))).prefs).toEqual(
        prefs,
      );
      expect(
        (await fetchAccountDisplayPrefs(demoUser('two'))).prefs,
      ).toBeNull();
    });
  });

  describe('real accounts', () => {
    const account = demoUser('real');
    let api: typeof import('./supabase');

    beforeEach(async () => {
      supabaseAuth.getUser.mockReset();
      supabaseAuth.updateUser.mockReset();
      vi.resetModules();
      vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
      api = await import('./supabase');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('reads the saved value from the server', async () => {
      supabaseAuth.getUser.mockResolvedValue({
        data: { user: { user_metadata: { display_prefs: prefs } } },
        error: null,
      });

      expect(await api.fetchAccountDisplayPrefs(account)).toEqual({
        prefs,
        error: null,
      });
    });

    it('reports an account with nothing saved as empty, not as a failure', async () => {
      supabaseAuth.getUser.mockResolvedValue({
        data: { user: { user_metadata: { display_name: 'Churchill' } } },
        error: null,
      });

      expect(await api.fetchAccountDisplayPrefs(account)).toEqual({
        prefs: null,
        error: null,
      });
    });

    it('reports a failed read as an error, so it can never pass for an empty account', async () => {
      supabaseAuth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'offline' },
      });
      expect((await api.fetchAccountDisplayPrefs(account)).error).toBe(
        'offline',
      );

      supabaseAuth.getUser.mockRejectedValue(new Error('network down'));
      expect((await api.fetchAccountDisplayPrefs(account)).error).toBe(
        'network down',
      );
    });

    it('saves into user metadata', async () => {
      supabaseAuth.updateUser.mockResolvedValue({ error: null });

      expect(await api.saveAccountDisplayPrefs(account, prefs)).toEqual({
        error: null,
      });
      expect(supabaseAuth.updateUser).toHaveBeenCalledWith({
        data: { display_prefs: prefs },
      });
    });

    it('reports a failed save', async () => {
      supabaseAuth.updateUser.mockResolvedValue({
        error: { message: 'rejected' },
      });
      expect((await api.saveAccountDisplayPrefs(account, prefs)).error).toBe(
        'rejected',
      );

      supabaseAuth.updateUser.mockRejectedValue(new Error('network down'));
      expect((await api.saveAccountDisplayPrefs(account, prefs)).error).toBe(
        'network down',
      );
    });
  });
});
