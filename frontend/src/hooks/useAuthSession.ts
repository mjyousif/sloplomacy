import { useEffect, useRef, useState } from 'react';
import { getInitialAuthUser, subscribeToAuthChanges } from '../lib/supabase';
import type { AuthUser } from '../types/diplomacy';

export type AuthModalTab = 'signin' | 'signup';

/**
 * Who is signed in, the sign-in modal, and the account settings modal. The user is read
 * once on mount and then follows every sign-in and sign-out, from this tab or (through
 * Supabase) another one.
 */
export function useAuthSession() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authModalReason, setAuthModalReason] = useState<string | null>(null);
  const [authModalTab, setAuthModalTab] = useState<AuthModalTab>('signin');
  const [accountModalOpen, setAccountModalOpen] = useState<boolean>(false);
  const [accountModalOnboarding, setAccountModalOnboarding] =
    useState<boolean>(false);
  const promptedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const handleUser = (u: AuthUser | null) => {
      setAuthUser(u);
      if (u?.needsUsernameSetup && promptedUserIdRef.current !== u.id) {
        promptedUserIdRef.current = u.id;
        setAccountModalOnboarding(true);
        setAccountModalOpen(true);
      } else if (!u) {
        promptedUserIdRef.current = null;
        setAccountModalOpen(false);
        setAccountModalOnboarding(false);
      }
    };

    getInitialAuthUser().then(handleUser);
    const unsub = subscribeToAuthChanges(handleUser);
    return () => unsub();
  }, []);

  /** Opens the sign-in modal, with a banner saying why when an action needs an account. */
  const openAuthPrompt = (reason?: string, tab: AuthModalTab = 'signin') => {
    setAuthModalReason(reason || null);
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  };

  /** Opens the account settings modal (for viewing email or editing public username). */
  const openAccountModal = (onboarding = false) => {
    setAccountModalOnboarding(onboarding);
    setAccountModalOpen(true);
  };

  return {
    authUser,
    setAuthUser,
    authModalOpen,
    setAuthModalOpen,
    authModalReason,
    authModalTab,
    openAuthPrompt,
    accountModalOpen,
    setAccountModalOpen,
    accountModalOnboarding,
    openAccountModal,
  };
}
