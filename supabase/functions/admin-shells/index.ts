import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyAdminAuth, createAuthErrorResponse } from '../_shared/adminAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
    const authResult = await verifyAdminAuth(req);
    if (authResult.error || !authResult.adminProfile) {
      return createAuthErrorResponse(authResult, corsHeaders);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const shellId = pathParts[pathParts.length - 1];
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shellId);

    if (req.method === 'GET') {
      if (isValidUUID) {
        const { data, error } = await supabase
          .from('trivia_shells')
          .select('*')
          .eq('id', shellId)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          return new Response(
            JSON.stringify(errorResponse('NOT_FOUND', 'Shell not found')),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify(successResponse(data)),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const status = url.searchParams.get('status');
      const visibility = url.searchParams.get('visibility');
      const search = url.searchParams.get('search');

      let query = supabase.from('trivia_shells').select('*');

      if (status) query = query.eq('status', status);
      if (visibility) query = query.eq('visibility', visibility);
      if (search) query = query.or(`internal_name.ilike.%${search}%,slug.ilike.%${search}%`);

      query = query.order('updated_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      return new Response(
        JSON.stringify(successResponse(data || [])),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const { internal_name, slug, topic, tags, visibility } = body;

      if (!internal_name || !slug) {
        return new Response(
          JSON.stringify(errorResponse('INVALID_REQUEST', 'internal_name and slug are required')),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: existing } = await supabase
        .from('trivia_shells')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify(errorResponse('DUPLICATE_SLUG', 'A shell with this slug already exists')),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data, error } = await supabase
        .from('trivia_shells')
        .insert({
          internal_name,
          slug,
          topic: topic || '',
          tags: tags || [],
          visibility: visibility || 'internal_only',
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify(successResponse(data)),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'PUT' && isValidUUID) {
      const body = await req.json();

      const { data: existing } = await supabase
        .from('trivia_shells')
        .select('*')
        .eq('id', shellId)
        .maybeSingle();

      if (!existing) {
        return new Response(
          JSON.stringify(errorResponse('NOT_FOUND', 'Shell not found')),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (body.slug && body.slug !== existing.slug) {
        const { data: slugCheck } = await supabase
          .from('trivia_shells')
          .select('id')
          .eq('slug', body.slug)
          .neq('id', shellId)
          .maybeSingle();

        if (slugCheck) {
          return new Response(
            JSON.stringify(errorResponse('DUPLICATE_SLUG', 'A shell with this slug already exists')),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      const updateData = {
        ...body,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('trivia_shells')
        .update(updateData)
        .eq('id', shellId)
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify(successResponse(data)),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'DELETE' && isValidUUID) {
      const { data: existing } = await supabase
        .from('trivia_shells')
        .select('status')
        .eq('id', shellId)
        .maybeSingle();

      if (!existing) {
        return new Response(
          JSON.stringify(errorResponse('NOT_FOUND', 'Shell not found')),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (existing.status === 'active') {
        return new Response(
          JSON.stringify(errorResponse('CANNOT_DELETE', 'Cannot delete an active shell')),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error } = await supabase
        .from('trivia_shells')
        .delete()
        .eq('id', shellId);

      if (error) throw error;

      return new Response(
        JSON.stringify(successResponse({ deleted: true })),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed')),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify(errorResponse('SERVER_ERROR', (error as Error).message)),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
