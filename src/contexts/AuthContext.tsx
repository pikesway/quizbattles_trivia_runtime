import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { User, AuthError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { AdminProfile } from '../types/admin';

interface AuthContextType {
  user: User | null;
  adminProfile: AdminProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  canManageUsers: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshAdminProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user && !!adminProfile && adminProfile.is_active;
  const isAdmin = adminProfile?.role === 'admin';
  const canManageUsers = adminProfile?.role === 'admin';

  const fetchAdminProfile = useCallback(async (_authUser: User): Promise<AdminProfile | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return null;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-bootstrap`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();

      if (!result.success) {
        return null;
      }

      return result.data as AdminProfile;
    } catch {
      return null;
    }
  }, []);

  const refreshAdminProfile = useCallback(async () => {
    if (!user) return;
    const profile = await fetchAdminProfile(user);
    setAdminProfile(profile);
  }, [user, fetchAdminProfile]);

  useEffect(() => {
    let mounted = true;

    async function initializeAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user && mounted) {
          setUser(session.user);
          const profile = await fetchAdminProfile(session.user);
          if (mounted) {
            setAdminProfile(profile);
          }
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setAdminProfile(null);
      } else if (session?.user) {
        setUser(session.user);
        (async () => {
          const profile = await fetchAdminProfile(session.user);
          if (mounted) {
            setAdminProfile(profile);
          }
        })();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchAdminProfile]);

  const signIn = useCallback(async (email: string, password: string): Promise<{ error: string | null }> => {
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        return { error: getAuthErrorMessage(authError) };
      }

      if (!data.user) {
        return { error: 'Authentication failed' };
      }

      setUser(data.user);

      const profile = await fetchAdminProfile(data.user);

      if (!profile) {
        await supabase.auth.signOut();
        setUser(null);
        return { error: 'You are not authorized for admin access' };
      }

      if (!profile.is_active) {
        await supabase.auth.signOut();
        setUser(null);
        setAdminProfile(null);
        return { error: 'Your admin account has been deactivated' };
      }

      setAdminProfile(profile);
      return { error: null };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }, [fetchAdminProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setAdminProfile(null);
  }, []);

  const value: AuthContextType = {
    user,
    adminProfile,
    isLoading,
    isAuthenticated,
    isAdmin,
    canManageUsers,
    signIn,
    signOut,
    refreshAdminProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

function getAuthErrorMessage(error: AuthError): string {
  switch (error.message) {
    case 'Invalid login credentials':
      return 'Invalid email or password';
    case 'Email not confirmed':
      return 'Please verify your email address';
    default:
      return error.message;
  }
}
