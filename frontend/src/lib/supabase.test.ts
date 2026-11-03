import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  isSupabaseConfigured,
  signInWithEmailPassword,
  signUpWithEmailPassword,
  signOutUser,
  getInitialAuthUser,
  subscribeToAuthChanges,
} from './supabase';
import { AuthUser } from '../types/diplomacy';

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
    const invalidEmail = await signInWithEmailPassword('invalid-email', '123456');
    expect(invalidEmail.error).toBe('Please enter a valid email address.');
    expect(invalidEmail.user).toBeNull();

    const shortPassword = await signInWithEmailPassword('test@diplomacy.eu', '123');
    expect(shortPassword.error).toBe('Password must be at least 6 characters.');
    expect(shortPassword.user).toBeNull();
  });

  it('handles local dev fallback guest sign-in when Supabase is not configured', async () => {
    const res = await signInWithEmailPassword('churchill@uk.gov', 'password123');
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
      'Otto von Bismarck'
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
});
