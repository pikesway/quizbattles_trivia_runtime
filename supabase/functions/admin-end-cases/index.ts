import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyAdminAuth, createAuthErrorResponse } from '../_shared/adminAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface EndScreenCase {
  id: string;
  shell_id: string;
  min_percentage: number;
  max_percentage: number | null;
  message: string;
  enabled: boolean;
  sort_order: number;
  share_text_override: string | null;
  created_at: string;
  updated_at: string;
}

interface CreateCaseInput {
  min_percentage: number;
  max_percentage: number | null;
  message: string;
  enabled?: boolean;
  sort_order?: number;
  share_text_override?: string | null;
}

interface UpdateCaseInput {
  min_percentage?: number;
  max_percentage?: number | null;
  message?: string;
  enabled?: boolean;
  sort_order?: number;
  share_text_override?: string | null;
}

interface ImportCaseInput {
  min_percentage: number;
  max_percentage: number | null;
  message: string;
  enabled?: boolean;
}

function validateCaseInput(input: CreateCaseInput): string | null {
  if (input.min_percentage < 0 || input.min_percentage > 100) {
    return 'min_percentage must be between 0 and 100';
  }
  if (input.max_percentage !== null && (input.max_percentage < 0 || input.max_percentage > 100)) {
    return 'max_percentage must be between 0 and 100 or null';
  }
  if (input.max_percentage !== null && input.min_percentage > input.max_percentage) {
    return 'min_percentage cannot be greater than max_percentage';
  }
  if (!input.message || input.message.trim().length === 0) {
    return 'message is required';
  }
  return null;
}

function checkOverlaps(cases: EndScreenCase[], newCase: CreateCaseInput, excludeId?: string): string | null {
  const enabledCases = cases.filter(c => c.enabled && c.id !== excludeId);
  const newMax = newCase.max_percentage ?? 100;

  for (const existing of enabledCases) {
    const existingMax = existing.max_percentage ?? 100;
    if (newCase.min_percentage <= existingMax && newMax >= existing.min_percentage) {
      return `Range ${newCase.min_percentage}-${newMax}% overlaps with existing case ${existing.min_percentage}-${existingMax}%`;
    }
  }
  return null;
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const shellId = pathParts[2];
    const caseId = pathParts[4];
    const action = pathParts[5];

    if (!shellId) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'INVALID_REQUEST', message: 'Shell ID required' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'GET' && !caseId) {
      const { data, error } = await supabase
        .from('trivia_end_screen_cases')
        .select('*')
        .eq('shell_id', shellId)
        .order('sort_order', { ascending: true });

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, data }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'POST' && action === 'import') {
      const body = await req.json();
      const { cases, replace_existing } = body as { cases: ImportCaseInput[]; replace_existing?: boolean };

      if (!Array.isArray(cases)) {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'INVALID_REQUEST', message: 'cases array required' } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const errors: { index: number; message: string }[] = [];
      const validCases: CreateCaseInput[] = [];

      for (let i = 0; i < cases.length; i++) {
        const c = cases[i];
        const validationError = validateCaseInput({
          min_percentage: c.min_percentage,
          max_percentage: c.max_percentage,
          message: c.message,
          enabled: c.enabled ?? true,
        });
        if (validationError) {
          errors.push({ index: i, message: validationError });
        } else {
          validCases.push({
            min_percentage: c.min_percentage,
            max_percentage: c.max_percentage,
            message: c.message,
            enabled: c.enabled ?? true,
            sort_order: i,
          });
        }
      }

      if (validCases.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'VALIDATION_FAILED', message: 'No valid cases to import' }, errors }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (replace_existing) {
        await supabase.from('trivia_end_screen_cases').delete().eq('shell_id', shellId);
      }

      const insertData = validCases.map((c, index) => ({
        shell_id: shellId,
        min_percentage: c.min_percentage,
        max_percentage: c.max_percentage,
        message: c.message,
        enabled: c.enabled ?? true,
        sort_order: c.sort_order ?? index,
        share_text_override: c.share_text_override ?? null,
      }));

      const { data: created, error: insertError } = await supabase
        .from('trivia_end_screen_cases')
        .insert(insertData)
        .select();

      if (insertError) throw insertError;

      return new Response(
        JSON.stringify({ success: true, data: { created: created.length, errors } }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'POST' && action === 'reorder') {
      const body = await req.json();
      const { ordered_ids } = body as { ordered_ids: string[] };

      if (!Array.isArray(ordered_ids)) {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'INVALID_REQUEST', message: 'ordered_ids array required' } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      for (let i = 0; i < ordered_ids.length; i++) {
        await supabase
          .from('trivia_end_screen_cases')
          .update({ sort_order: i })
          .eq('id', ordered_ids[i])
          .eq('shell_id', shellId);
      }

      const { data, error } = await supabase
        .from('trivia_end_screen_cases')
        .select('*')
        .eq('shell_id', shellId)
        .order('sort_order', { ascending: true });

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, data }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'POST' && !caseId) {
      const input = (await req.json()) as CreateCaseInput;

      const validationError = validateCaseInput(input);
      if (validationError) {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'VALIDATION_FAILED', message: validationError } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: existingCases } = await supabase
        .from('trivia_end_screen_cases')
        .select('*')
        .eq('shell_id', shellId);

      if (input.enabled !== false) {
        const overlapError = checkOverlaps(existingCases || [], input);
        if (overlapError) {
          return new Response(
            JSON.stringify({ success: false, error: { code: 'OVERLAP_DETECTED', message: overlapError } }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      let sortOrder = input.sort_order;
      if (sortOrder === undefined) {
        const maxOrder = (existingCases || []).reduce((max, c) => Math.max(max, c.sort_order), -1);
        sortOrder = maxOrder + 1;
      }

      const { data, error } = await supabase
        .from('trivia_end_screen_cases')
        .insert({
          shell_id: shellId,
          min_percentage: input.min_percentage,
          max_percentage: input.max_percentage,
          message: input.message,
          enabled: input.enabled ?? true,
          sort_order: sortOrder,
          share_text_override: input.share_text_override ?? null,
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, data }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'PUT' && caseId) {
      const input = (await req.json()) as UpdateCaseInput;

      const { data: existing, error: fetchError } = await supabase
        .from('trivia_end_screen_cases')
        .select('*')
        .eq('id', caseId)
        .eq('shell_id', shellId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!existing) {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'End screen case not found' } }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const merged: CreateCaseInput = {
        min_percentage: input.min_percentage ?? existing.min_percentage,
        max_percentage: input.max_percentage !== undefined ? input.max_percentage : existing.max_percentage,
        message: input.message ?? existing.message,
        enabled: input.enabled ?? existing.enabled,
      };

      const validationError = validateCaseInput(merged);
      if (validationError) {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'VALIDATION_FAILED', message: validationError } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (merged.enabled) {
        const { data: allCases } = await supabase
          .from('trivia_end_screen_cases')
          .select('*')
          .eq('shell_id', shellId);

        const overlapError = checkOverlaps(allCases || [], merged, caseId);
        if (overlapError) {
          return new Response(
            JSON.stringify({ success: false, error: { code: 'OVERLAP_DETECTED', message: overlapError } }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      const updateData: Record<string, unknown> = {};
      if (input.min_percentage !== undefined) updateData.min_percentage = input.min_percentage;
      if (input.max_percentage !== undefined) updateData.max_percentage = input.max_percentage;
      if (input.message !== undefined) updateData.message = input.message;
      if (input.enabled !== undefined) updateData.enabled = input.enabled;
      if (input.sort_order !== undefined) updateData.sort_order = input.sort_order;
      if (input.share_text_override !== undefined) updateData.share_text_override = input.share_text_override;

      const { data, error } = await supabase
        .from('trivia_end_screen_cases')
        .update(updateData)
        .eq('id', caseId)
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, data }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'DELETE' && caseId) {
      const { error } = await supabase
        .from('trivia_end_screen_cases')
        .delete()
        .eq('id', caseId)
        .eq('shell_id', shellId);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found' } }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: (error as Error).message },
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
