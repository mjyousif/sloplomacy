import { useEffect, useState } from 'react';
import { getInitialAuthUser, subscribeToAuthChanges } from '../lib/supabase';
import type { AuthUser } from '../types/diplomacy';

export type AuthModalTab = 'signin' | 'signup';

/**
 * Who is signed in, and the sign-in modal. The user is read once on mount and then follows
 * every sign-in and sign-out, from this tab or (through Supabase) another one.
 */
export function useAuthSession() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authModalReason, setAuthModalReason] = useState<string | null>(null);
  const [authModalTab, setAuthModalTab] = useState<AuthModalTab>('signin');

  useEffect(() => {
    getInitialAuthUser().then((u) => setAuthUser(u));
    const unsub = subscribeToAuthChanges((u) => setAuthUser(u));
    return () => unsub();
  }, []);

  /** Opens the sign-in modal, with a banner saying why when an action needs an account. */
  const openAuthPrompt = (reason?: string, tab: AuthModalTab = 'signin') => {
    setAuthModalReason(reason || null);
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  };

  return {
    authUser,
    setAuthUser,
    authModalOpen,
    setAuthModalOpen,
    authModalReason,
    authModalTab,
    openAuthPrompt,
  };
}
