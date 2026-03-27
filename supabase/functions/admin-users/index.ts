import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyAdminAuth, createAuthErrorResponse, AdminProfile } from '../_shared/adminAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function successResponse(data: unknown, status = 200) {
  return new Response(
    JSON.stringify({ success: true, data }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function errorResponse(code: string, message: string, status = 400) {
  return new Response(
    JSON.stringify({ success: false, error: { code, message } }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authResult = await verifyAdminAuth(req);
    if (!authResult.adminProfile) {
      return createAuthErrorResponse(authResult, corsHeaders);
    }

    const currentAdmin = authResult.adminProfile;

    if (currentAdmin.role !== 'admin') {
      return errorResponse('FORBIDDEN', 'Only admins can manage users', 403);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const userId = pathParts[2];
    const action = pathParts[3];

    if (req.method === 'GET' && !userId) {
      return await listUsers(supabase);
    }

    if (req.method === 'POST' && !userId) {
      const body = await req.json();
      return await createUser(supabase, body);
    }

    if (req.method === 'PUT' && userId) {
      const body = await req.json();
      return await updateUser(supabase, userId, body, currentAdmin);
    }

    if (req.method === 'PATCH' && userId && action === 'activate') {
      return await setUserActive(supabase, userId, true, currentAdmin);
    }

    if (req.method === 'PATCH' && userId && action === 'deactivate') {
      return await setUserActive(supabase, userId, false, currentAdmin);
    }

    return errorResponse('NOT_FOUND', 'Endpoint not found', 404);
  } catch (error) {
    return errorResponse('SERVER_ERROR', (error as Error).message, 500);
  }
});

async function listUsers(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from('trivia_admin_users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return successResponse(data);
}

async function createUser(
  supabase: ReturnType<typeof createClient>,
  body: { email: string; password: string; display_name: string; role: AdminProfile['role'] }
) {
  const { email, password, display_name, role } = body;

  if (!email || !password || !display_name || !role) {
    return errorResponse('VALIDATION_ERROR', 'Email, password, display_name, and role are required');
  }

  if (!['admin', 'editor', 'reviewer'].includes(role)) {
    return errorResponse('VALIDATION_ERROR', 'Invalid role');
  }

  if (password.length < 8) {
    return errorResponse('VALIDATION_ERROR', 'Password must be at least 8 characters');
  }

  const { data: existingUser } = await supabase
    .from('trivia_admin_users')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (existingUser) {
    return errorResponse('USER_EXISTS', 'A user with this email already exists');
  }

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: email.toLowerCase(),
    password,
    email_confirm: true,
  });

  if (authError) {
    return errorResponse('AUTH_ERROR', authError.message);
  }

  const { data: adminProfile, error: profileError } = await supabase
    .from('trivia_admin_users')
    .insert({
      auth_user_id: authUser.user.id,
      email: email.toLowerCase(),
      display_name,
      role,
      is_active: true,
    })
    .select()
    .single();

  if (profileError) {
    await supabase.auth.admin.deleteUser(authUser.user.id);
    throw profileError;
  }

  return successResponse(adminProfile, 201);
}

async function updateUser(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  body: { display_name?: string; role?: AdminProfile['role'] },
  currentAdmin: AdminProfile
) {
  const { display_name, role } = body;

  const updates: Partial<AdminProfile> = {};
  if (display_name) updates.display_name = display_name;
  if (role) {
    if (!['admin', 'editor', 'reviewer'].includes(role)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid role');
    }
    if (userId === currentAdmin.id) {
      return errorResponse('FORBIDDEN', 'You cannot change your own role');
    }
    updates.role = role;
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse('VALIDATION_ERROR', 'No valid fields to update');
  }

  const { data, error } = await supabase
    .from('trivia_admin_users')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return errorResponse('NOT_FOUND', 'User not found', 404);
    }
    throw error;
  }

  return successResponse(data);
}

async function setUserActive(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  isActive: boolean,
  currentAdmin: AdminProfile
) {
  if (userId === currentAdmin.id) {
    return errorResponse('FORBIDDEN', 'You cannot deactivate yourself');
  }

  const { data, error } = await supabase
    .from('trivia_admin_users')
    .update({ is_active: isActive })
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return errorResponse('NOT_FOUND', 'User not found', 404);
    }
    throw error;
  }

  return successResponse(data);
}
