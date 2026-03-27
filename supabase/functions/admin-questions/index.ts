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
    const questionId = pathParts[pathParts.length - 1];
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(questionId);

    if (req.method === 'GET') {
      if (isValidUUID) {
        const { data: question, error } = await supabase
          .from('trivia_questions')
          .select('*')
          .eq('id', questionId)
          .maybeSingle();

        if (error) throw error;
        if (!question) {
          return new Response(
            JSON.stringify(errorResponse('NOT_FOUND', 'Question not found')),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: answers } = await supabase
          .from('trivia_answers')
          .select('*')
          .eq('question_id', questionId)
          .order('display_order', { ascending: true });

        return new Response(
          JSON.stringify(successResponse({ ...question, answers: answers || [] })),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const topic = url.searchParams.get('topic');
      const difficultyLevel = url.searchParams.get('difficulty_level');
      const reviewState = url.searchParams.get('review_state');
      const sourceType = url.searchParams.get('source_type');
      const sourceBatchId = url.searchParams.get('source_batch_id');
      const search = url.searchParams.get('search');
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      let query = supabase.from('trivia_questions').select('*', { count: 'exact' });

      if (topic) query = query.eq('topic', topic);
      if (difficultyLevel) query = query.eq('difficulty_level', difficultyLevel);
      if (reviewState) query = query.eq('review_state', reviewState);
      if (sourceType) query = query.eq('source_type', sourceType);
      if (sourceBatchId) query = query.eq('source_batch_id', sourceBatchId);
      if (search) query = query.ilike('question_text', `%${search}%`);

      query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, count, error } = await query;
      if (error) throw error;

      return new Response(
        JSON.stringify(successResponse({ questions: data || [], total: count || 0 })),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const { question_text, explanation, topic, tags, difficulty_level, answers } = body;

      if (!question_text || !topic || !difficulty_level || !answers || answers.length < 2) {
        return new Response(
          JSON.stringify(errorResponse('INVALID_REQUEST', 'Missing required fields')),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const correctCount = answers.filter((a: { is_correct: boolean }) => a.is_correct).length;
      if (correctCount !== 1) {
        return new Response(
          JSON.stringify(errorResponse('INVALID_ANSWERS', 'Exactly one answer must be correct')),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const difficultyMap: Record<string, number> = { easy: 1, medium: 3, hard: 5 };

      const { data: question, error: questionError } = await supabase
        .from('trivia_questions')
        .insert({
          question_text,
          explanation: explanation || '',
          topic,
          tags: tags || [],
          difficulty: difficultyMap[difficulty_level] || 3,
          difficulty_level,
          review_state: 'approved',
          source_type: 'manual',
          is_active: true,
        })
        .select()
        .single();

      if (questionError) throw questionError;

      const answerInserts = answers.map((a: { text: string; is_correct: boolean }, index: number) => ({
        question_id: question.id,
        answer_text: a.text,
        is_correct: a.is_correct,
        display_order: index + 1,
      }));

      const { data: createdAnswers, error: answersError } = await supabase
        .from('trivia_answers')
        .insert(answerInserts)
        .select();

      if (answersError) throw answersError;

      return new Response(
        JSON.stringify(successResponse({ ...question, answers: createdAnswers })),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
