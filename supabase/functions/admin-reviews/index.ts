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

    if (req.method === 'GET') {
      const topic = url.searchParams.get('topic');
      const sourceBatchId = url.searchParams.get('source_batch_id');
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      let query = supabase
        .from('trivia_questions')
        .select('*', { count: 'exact' })
        .eq('review_state', 'pending_review');

      if (topic) query = query.eq('topic', topic);
      if (sourceBatchId) query = query.eq('source_batch_id', sourceBatchId);

      query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data: questions, count, error } = await query;
      if (error) throw error;

      const questionIds = (questions || []).map(q => q.id);

      let answers: Record<string, unknown>[] = [];
      if (questionIds.length > 0) {
        const { data: answersData } = await supabase
          .from('trivia_answers')
          .select('*')
          .in('question_id', questionIds)
          .order('display_order', { ascending: true });
        answers = answersData || [];
      }

      const answersMap = new Map<string, unknown[]>();
      answers.forEach(answer => {
        const qId = answer.question_id as string;
        const existing = answersMap.get(qId) || [];
        answersMap.set(qId, [...existing, answer]);
      });

      const questionsWithAnswers = (questions || []).map(q => ({
        ...q,
        answers: answersMap.get(q.id) || [],
      }));

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: todayReviews } = await supabase
        .from('trivia_question_reviews')
        .select('action')
        .gte('created_at', today.toISOString());

      const approvedToday = (todayReviews || []).filter(r => r.action === 'approved').length;
      const rejectedToday = (todayReviews || []).filter(r => r.action === 'rejected').length;

      return new Response(
        JSON.stringify(successResponse({
          queue: questionsWithAnswers,
          total: count || 0,
          stats: {
            pending_count: count || 0,
            approved_today: approvedToday,
            rejected_today: rejectedToday,
          },
        })),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const lastPart = pathParts[pathParts.length - 1];
      const reviewerId = authResult.adminProfile.id;

      if (lastPart === 'bulk-approve' || lastPart === 'bulk-reject') {
        const { question_ids, notes } = body;
        const action = lastPart === 'bulk-approve' ? 'approved' : 'rejected';
        const newState = action;

        if (!question_ids || !Array.isArray(question_ids) || question_ids.length === 0) {
          return new Response(
            JSON.stringify(errorResponse('INVALID_REQUEST', 'question_ids array is required')),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const results = { success: 0, failed: [] as string[] };

        for (const questionId of question_ids) {
          try {
            const { data: question } = await supabase
              .from('trivia_questions')
              .select('review_state')
              .eq('id', questionId)
              .maybeSingle();

            if (!question) {
              results.failed.push(questionId);
              continue;
            }

            await supabase.from('trivia_question_reviews').insert({
              question_id: questionId,
              reviewer_id: reviewerId,
              action,
              previous_state: question.review_state,
              notes: notes || null,
            });

            await supabase
              .from('trivia_questions')
              .update({ review_state: newState })
              .eq('id', questionId);

            results.success++;
          } catch {
            results.failed.push(questionId);
          }
        }

        return new Response(
          JSON.stringify(successResponse(results)),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const secondLast = pathParts[pathParts.length - 2];
      const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(secondLast);

      if (isValidUUID && (lastPart === 'approve' || lastPart === 'reject')) {
        const questionId = secondLast;
        const { notes } = body;
        const action = lastPart === 'approve' ? 'approved' : 'rejected';

        const { data: question, error: questionError } = await supabase
          .from('trivia_questions')
          .select('*')
          .eq('id', questionId)
          .maybeSingle();

        if (questionError) throw questionError;
        if (!question) {
          return new Response(
            JSON.stringify(errorResponse('NOT_FOUND', 'Question not found')),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await supabase.from('trivia_question_reviews').insert({
          question_id: questionId,
          reviewer_id: reviewerId,
          action,
          previous_state: question.review_state,
          notes: notes || null,
        });

        const { data: updatedQuestion, error: updateError } = await supabase
          .from('trivia_questions')
          .update({ review_state: action })
          .eq('id', questionId)
          .select()
          .single();

        if (updateError) throw updateError;

        return new Response(
          JSON.stringify(successResponse(updatedQuestion)),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
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
