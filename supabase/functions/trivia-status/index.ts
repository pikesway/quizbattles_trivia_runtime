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

    const config = session.config || {};

    if (session.status === 'completed') {
      const endScreenRules = config.end_screen_rules || [];
      let message = 'Game completed!';
      for (const rule of endScreenRules) {
        if (session.score >= rule.min && session.score <= rule.max) {
          message = rule.text;
          break;
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            status: 'completed',
            score: session.score,
            total: session.total_questions,
            correct_answers: session.correct_answers,
            message,
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (session.status === 'abandoned') {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            status: 'abandoned',
            score: session.score,
            total: session.total_questions,
            correct_answers: session.correct_answers,
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const questionSet = session.question_set;

    if (session.current_index >= questionSet.length) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            status: 'in_progress',
            awaiting_completion: true,
            score: session.score,
            total_questions: session.total_questions,
            current_question: session.current_index,
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const currentQuestion = questionSet[session.current_index];
    const shuffledAnswers = shuffleArray(
      currentQuestion.answers.map((a: any) => ({ answer_id: a.answer_id, answer_text: a.answer_text }))
    );

    const response: any = {
      status: 'in_progress',
      question: {
        question_text: currentQuestion.question_text,
        answers: shuffledAnswers,
      },
      current_question: session.current_index + 1,
      total_questions: session.total_questions,
      score: session.score,
      correct_answers: session.correct_answers,
      timer: {
        mode: session.timer_mode,
        seconds: session.timer_seconds,
      },
      ui: config.ui || {},
      lead_capture: config.lead_capture || { enabled: false, fields: [] },
    };

    if (session.timer_mode === 'per_quiz') {
      const elapsed = Date.now() - new Date(session.started_at).getTime();
      const totalTime = session.timer_seconds * 1000;
      response.remaining_time_ms = Math.max(0, totalTime - elapsed);

      if (response.remaining_time_ms <= 0) {
        await supabase
          .from('trivia_game_sessions')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq('id', session_id);

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              status: 'completed',
              score: session.score,
              total: session.total_questions,
              correct_answers: session.correct_answers,
              message: 'Time expired! Quiz auto-completed.',
              auto_completed: true,
            },
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: true, data: response }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'GET_STATUS_FAILED', message: (error as Error).message },
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
