import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function isTimerExpired(session: any): boolean {
  const now = Date.now();
  const startedAt = new Date(session.started_at).getTime();

  if (session.timer_mode === 'per_quiz') {
    const totalTimeMs = session.timer_seconds * 1000;
    return now > startedAt + totalTimeMs;
  }

  return false;
}

function isQuestionTimerExpiredServerSide(session: any): boolean {
  if (session.timer_mode === 'per_question' && session.current_question_started_at) {
    const now = Date.now();
    const questionStartedAt = new Date(session.current_question_started_at).getTime();
    const elapsed = now - questionStartedAt;
    const allowedTimeMs = session.timer_seconds * 1000;
    const gracePeriodMs = 1000;
    return elapsed > allowedTimeMs + gracePeriodMs;
  }
  return false;
}

async function autoCompleteSession(supabase: any, sessionId: string, session: any) {
  await supabase
    .from('trivia_game_sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  return {
    score: session.score,
    total: session.total_questions,
    correct_answers: session.correct_answers,
    message: 'Time expired! Quiz auto-completed.',
    auto_completed: true,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { session_id, selected_answer_id, time_to_answer_ms = 0 } = await req.json();

    if (!session_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'Missing required fields' },
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isTimeout = !selected_answer_id || selected_answer_id === null || selected_answer_id === '';

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

    if (!isTimeout && isTimerExpired(session)) {
      const completionData = await autoCompleteSession(supabase, session_id, session);
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'TIMER_EXPIRED', message: 'Quiz timer has expired' },
          data: completionData,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!isTimeout && isQuestionTimerExpiredServerSide(session)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'QUESTION_TIMER_EXPIRED', message: 'Question timer has expired' },
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const questionSet = session.question_set;
    const currentQuestion = questionSet[session.current_index];

    const { data: existingAnswer } = await supabase
      .from('trivia_session_answers')
      .select('id')
      .eq('session_id', session_id)
      .eq('question_id', currentQuestion.question_id)
      .maybeSingle();

    if (existingAnswer) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'ALREADY_ANSWERED', message: 'Question already answered' },
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const correctAnswer = currentQuestion.answers.find((a: any) => a.is_correct);
    if (!correctAnswer) {
      throw new Error('No correct answer found');
    }

    const isCorrect = isTimeout ? false : selected_answer_id === correctAnswer.answer_id;

    await supabase.from('trivia_session_answers').insert({
      session_id,
      question_id: currentQuestion.question_id,
      selected_answer_id: isTimeout ? null : selected_answer_id,
      is_correct: isCorrect,
      time_to_answer_ms,
    });

    const newScore = isCorrect ? session.score + 1 : session.score;
    const newCorrectAnswers = isCorrect ? session.correct_answers + 1 : session.correct_answers;
    const newIndex = session.current_index + 1;
    const isLastQuestion = newIndex >= session.total_questions;

    const updates: any = {
      score: newScore,
      correct_answers: newCorrectAnswers,
      current_index: newIndex,
    };

    if (isLastQuestion) {
      updates.status = 'completed';
      updates.completed_at = new Date().toISOString();
    }

    await supabase.from('trivia_game_sessions').update(updates).eq('id', session_id);

    const responseData: any = {
      correct: isCorrect,
      correct_answer_id: correctAnswer.answer_id,
      explanation: currentQuestion.explanation,
      feedback_type: isCorrect ? 'correct' : 'incorrect',
      score: newScore,
      is_last_question: isLastQuestion,
    };

    if (session.timer_mode === 'per_question') {
      responseData.timer_seconds = session.timer_seconds;
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: responseData,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'SUBMIT_ANSWER_FAILED', message: (error as Error).message },
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
