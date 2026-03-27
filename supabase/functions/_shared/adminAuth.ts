import { createClient } from 'npm:@supabase/supabase-js@2';

export interface AdminProfile {
  id: string;
  auth_user_id: string;
  email: string;
  display_name: string;
  role: 'admin' | 'editor' | 'reviewer';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthResult {
  user: { id: string; email?: string } | null;
  adminProfile: AdminProfile | null;
  error?: string;
  errorCode?: 'UNAUTHORIZED' | 'FORBIDDEN' | 'ACCOUNT_DEACTIVATED';
}

export async function verifyAdminAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, adminProfile: null, error: 'Missing or invalid authorization header', errorCode: 'UNAUTHORIZED' };
  }

  const token = authHeader.substring(7);
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return { user: null, adminProfile: null, error: 'Invalid or expired token', errorCode: 'UNAUTHORIZED' };
  }

  const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

  const { data: adminProfile, error: profileError } = await supabaseService
    .from('trivia_admin_users')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (profileError) {
    return { user: null, adminProfile: null, error: 'Failed to verify admin status', errorCode: 'UNAUTHORIZED' };
  }

  if (!adminProfile) {
    return { user: null, adminProfile: null, error: 'Not authorized for admin access', errorCode: 'FORBIDDEN' };
  }

  if (!adminProfile.is_active) {
    return { user: null, adminProfile: null, error: 'Your admin account has been deactivated', errorCode: 'ACCOUNT_DEACTIVATED' };
  }

  return { user, adminProfile };
}

export function createAuthErrorResponse(
  result: AuthResult,
  corsHeaders: Record<string, string>
): Response {
  const status = result.errorCode === 'UNAUTHORIZED' ? 401 : 403;
  return new Response(
    JSON.stringify({
      success: false,
      error: { code: result.errorCode || 'UNAUTHORIZED', message: result.error }
    }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
