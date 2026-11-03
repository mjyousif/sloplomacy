import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AuthUser } from '../types/diplomacy';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseConfigured =
  Boolean(supabaseUrl) &&
  Boolean(supabaseAnonKey) &&
  !supabaseUrl.includes('your-project-ref');

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const LOCAL_AUTH_STORAGE_KEY = 'diplomacy_1901_local_auth_user';
type AuthListener = (user: AuthUser | null) => void;
const localListeners = new Set<AuthListener>();

function notifyLocalListeners(user: AuthUser | null) {
  localListeners.forEach((cb) => cb(user));
}

function getLocalStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(LOCAL_AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function setLocalStoredUser(user: AuthUser | null) {
  try {
    if (user) {
      localStorage.setItem(LOCAL_AUTH_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(LOCAL_AUTH_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
  notifyLocalListeners(user);
}

function mapSupabaseUser(sbUser: any): AuthUser {
  const email = sbUser.email || 'commander@diplomacy.eu';
  const displayName =
    sbUser.user_metadata?.display_name ||
    sbUser.user_metadata?.full_name ||
    email.split('@')[0];
  return {
    id: sbUser.id,
    email,
    displayName,
    isLocalDemo: false,
  };
}

export async function getInitialAuthUser(): Promise<AuthUser | null> {
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      return mapSupabaseUser(data.session.user);
    }
    return null;
  }
  return getLocalStoredUser();
}

export function subscribeToAuthChanges(callback: AuthListener): () => void {
  if (supabase) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        callback(mapSupabaseUser(session.user));
      } else {
        callback(null);
      }
    });
    return () => data.subscription.unsubscribe();
  }

  localListeners.add(callback);
  return () => {
    localListeners.delete(callback);
  };
}

export async function signInWithEmailPassword(
  email: string,
  password: string
): Promise<{ user: AuthUser | null; error: string | null }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { user: null, error: 'Please enter a valid email address.' };
  }
  if (!password || password.length < 6) {
    return { user: null, error: 'Password must be at least 6 characters.' };
  }

  if (supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    if (error) return { user: null, error: error.message };
    if (data.user) return { user: mapSupabaseUser(data.user), error: null };
    return { user: null, error: 'Unable to sign in.' };
  }

  // Local dev mode fallback when Supabase .env credentials are not configured yet
  const demoUser: AuthUser = {
    id: `local_${cleanEmail.replace(/[^a-z0-9]/g, '_')}`,
    email: cleanEmail,
    displayName: cleanEmail.split('@')[0],
    isLocalDemo: true,
  };
  setLocalStoredUser(demoUser);
  return { user: demoUser, error: null };
}

export async function signUpWithEmailPassword(
  email: string,
  password: string,
  displayName?: string
): Promise<{ user: AuthUser | null; error: string | null; message?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { user: null, error: 'Please enter a valid email address.' };
  }
  if (!password || password.length < 6) {
    return { user: null, error: 'Password must be at least 6 characters.' };
  }

  const chosenName = (displayName || '').trim() || cleanEmail.split('@')[0];

  if (supabase) {
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          display_name: chosenName,
        },
      },
    });
    if (error) return { user: null, error: error.message };
    if (data.user) {
      const mapped = mapSupabaseUser(data.user);
      return {
        user: mapped,
        error: null,
        message: data.session
          ? undefined
          : 'Check your email inbox to confirm your account.',
      };
    }
    return { user: null, error: 'Account creation failed.' };
  }

  // Local dev mode fallback
  const demoUser: AuthUser = {
    id: `local_${cleanEmail.replace(/[^a-z0-9]/g, '_')}`,
    email: cleanEmail,
    displayName: chosenName,
    isLocalDemo: true,
  };
  setLocalStoredUser(demoUser);
  return { user: demoUser, error: null };
}

export async function sendMagicLink(
  email: string
): Promise<{ error: string | null; sent: boolean }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { error: 'Please enter a valid email address.', sent: false };
  }

  if (supabase) {
    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) return { error: error.message, sent: false };
    return { error: null, sent: true };
  }

  // Local dev fallback: immediately sign in
  const demoUser: AuthUser = {
    id: `local_${cleanEmail.replace(/[^a-z0-9]/g, '_')}`,
    email: cleanEmail,
    displayName: cleanEmail.split('@')[0],
    isLocalDemo: true,
  };
  setLocalStoredUser(demoUser);
  return { error: null, sent: true };
}

export async function signInWithOAuthProvider(
  provider: 'google' | 'discord' | 'github'
): Promise<{ error: string | null }> {
  if (supabase) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
      },
    });
    return { error: error ? error.message : null };
  }

  // Local dev fallback
  const email = `commander.${provider}@diplomacy.local`;
  const demoUser: AuthUser = {
    id: `local_oauth_${provider}`,
    email,
    displayName: `${provider.charAt(0).toUpperCase() + provider.slice(1)} Envoy`,
    isLocalDemo: true,
  };
  setLocalStoredUser(demoUser);
  return { error: null };
}

export async function signOutUser(): Promise<void> {
  if (supabase) {
    await supabase.auth.signOut();
  }
  setLocalStoredUser(null);
}
