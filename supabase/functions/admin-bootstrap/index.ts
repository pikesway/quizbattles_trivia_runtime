import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function successResponse(data: unknown) {
  return { success: true, data };
}

function errorResponse(code: string, message: string) {
  return { success: false, error: { code, message } };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify(errorResponse('UNAUTHORIZED', 'Missing or invalid authorization header')),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      return new Response(
        JSON.stringify(errorResponse('UNAUTHORIZED', 'Invalid or expired token')),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: existingProfile, error: profileError } = await supabase
      .from('trivia_admin_users')
      .select('*')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    if (existingProfile) {
      if (!existingProfile.is_active) {
        return new Response(
          JSON.stringify(errorResponse('ACCOUNT_DEACTIVATED', 'Your admin account has been deactivated')),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify(successResponse(existingProfile)),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const bootstrapEmails = Deno.env.get('ADMIN_BOOTSTRAP_EMAILS') || '';
    const allowedEmails = bootstrapEmails
      .split(',')
      .map(email => email.trim().toLowerCase())
      .filter(email => email.length > 0);

    const userEmail = user.email?.toLowerCase() || '';

    if (!allowedEmails.includes(userEmail)) {
      return new Response(
        JSON.stringify(errorResponse('NOT_AUTHORIZED', 'You are not authorized for admin access. Contact an administrator if you believe this is an error.')),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const displayName = user.user_metadata?.full_name ||
                        user.user_metadata?.name ||
                        userEmail.split('@')[0];

    const { data: newProfile, error: insertError } = await supabase
      .from('trivia_admin_users')
      .insert({
        auth_user_id: user.id,
        email: userEmail,
        display_name: displayName,
        role: 'admin',
        is_active: true,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify(successResponse(newProfile)),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify(errorResponse('SERVER_ERROR', (error as Error).message)),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
