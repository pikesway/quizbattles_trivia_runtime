import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function isTimerExpired(session: any): boolean {
  if (session.timer_mode === 'per_quiz') {
    const now = Date.now();
    const startedAt = new Date(session.started_at).getTime();
    const totalTimeMs = session.timer_seconds * 1000;
    return now > startedAt + totalTimeMs;
  }
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { session_id } = await req.json();

    if (!session_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'Session ID required' },
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: session, error: sessionError } = await supabase
      .from('trivia_game_sessions')
      .select('*')
      .eq('id', session_id)
      .single();

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (session.status !== 'in_progress') {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'SESSION_NOT_IN_PROGRESS', message: 'Session is not in progress' },
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (isTimerExpired(session)) {
      await supabase
        .from('trivia_game_sessions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', session_id);

      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'TIMER_EXPIRED', message: 'Quiz timer has expired' },
          data: {
            score: session.score,
            total: session.total_questions,
            correct_answers: session.correct_answers,
            message: 'Time expired! Quiz auto-completed.',
            auto_completed: true,
          },
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const questionSet = session.question_set;

    if (session.current_index >= questionSet.length) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'NO_MORE_QUESTIONS', message: 'No more questions available' },
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const question = questionSet[session.current_index];
    const shuffledAnswers = shuffleArray(
      question.answers.map((a: any) => ({ answer_id: a.answer_id, answer_text: a.answer_text }))
    );

    const questionStartTime = new Date().toISOString();
    await supabase
      .from('trivia_game_sessions')
      .update({ current_question_started_at: questionStartTime })
      .eq('id', session_id);

    const config = session.config || {};

    const response: any = {
      question: {
        question_text: question.question_text,
        answers: shuffledAnswers,
      },
      current_question: session.current_index + 1,
      total_questions: session.total_questions,
      timer: {
        mode: session.timer_mode,
        seconds: session.timer_seconds,
      },
      ui: config.ui || {},
    };

    if (session.timer_mode === 'per_quiz') {
      const elapsed = Date.now() - new Date(session.started_at).getTime();
      const totalTime = session.timer_seconds * 1000;
      response.remaining_time_ms = Math.max(0, totalTime - elapsed);
    }

    return new Response(
      JSON.stringify({ success: true, data: response }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'GET_QUESTION_FAILED', message: (error as Error).message },
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
