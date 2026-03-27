import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface QuestionSnapshot {
  question_id: string;
  question_text: string;
  explanation: string;
  answers: AnswerSnapshot[];
}

interface AnswerSnapshot {
  answer_id: string;
  answer_text: string;
  is_correct: boolean;
}

interface GameConfig {
  question_mode: 'fixed' | 'random';
  question_count: number;
  timer: { mode: string; seconds: number };
  ui: { background_url: string };
  lead_capture: {
    enabled: boolean;
    fields: Array<{ name: string; required: boolean; visible: boolean }>;
  };
  end_screen_rules: Array<{ min: number; max: number; text: string }>;
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getDefaultConfig(): GameConfig {
  return {
    question_mode: 'random',
    question_count: 10,
    timer: { mode: 'per_question', seconds: 15 },
    ui: { background_url: 'https://images.pexels.com/photos/1939485/pexels-photo-1939485.jpeg' },
    lead_capture: {
      enabled: true,
      fields: [
        { name: 'email', required: true, visible: true },
        { name: 'name', required: false, visible: true },
      ],
    },
    end_screen_rules: [
      { min: 0, max: 0, text: 'Try again! Better luck next time.' },
      { min: 1, max: 4, text: 'Not bad! Keep practicing.' },
      { min: 5, max: 7, text: 'Good job! You know your stuff.' },
      { min: 8, max: 9, text: 'Excellent! Almost perfect.' },
      { min: 10, max: 10, text: 'Legend! Perfect score!' },
    ],
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

    const { campaign_id, campaign_game_instance_id, lead_id } = await req.json();

    if (!campaign_id || !campaign_game_instance_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'Missing required fields' },
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const config = getDefaultConfig();

    let questions;
    if (config.question_mode === 'fixed') {
      const { data, error } = await supabase
        .from('trivia_questions')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(config.question_count);

      if (error) throw error;
      questions = data || [];
    } else {
      const { data, error } = await supabase
        .from('trivia_questions')
        .select('*')
        .eq('is_active', true)
        .limit(config.question_count * 2);

      if (error) throw error;
      questions = shuffleArray(data || []).slice(0, config.question_count);
    }

    const questionIds = questions.map((q) => q.id);

    const { data: answers, error: answersError } = await supabase
      .from('trivia_answers')
      .select('*')
      .in('question_id', questionIds);

    if (answersError) throw answersError;

    const answersMap = new Map();
    (answers || []).forEach((answer) => {
      const existing = answersMap.get(answer.question_id) || [];
      answersMap.set(answer.question_id, [...existing, answer]);
    });

    const questionSet: QuestionSnapshot[] = questions.map((question) => ({
      question_id: question.id,
      question_text: question.question_text,
      explanation: question.explanation,
      answers: (answersMap.get(question.id) || []).map((a: any) => ({
        answer_id: a.id,
        answer_text: a.answer_text,
        is_correct: a.is_correct,
      })),
    }));

    const now = new Date().toISOString();
    const { data: session, error: sessionError } = await supabase
      .from('trivia_game_sessions')
      .insert({
        campaign_id,
        campaign_game_instance_id,
        lead_id: lead_id || null,
        status: 'in_progress',
        score: 0,
        total_questions: config.question_count,
        correct_answers: 0,
        timer_mode: config.timer.mode,
        timer_seconds: config.timer.seconds,
        question_set: questionSet,
        current_index: 0,
        config: config,
        current_question_started_at: now,
      })
      .select()
      .single();

    if (sessionError) throw sessionError;

    const firstQuestion = questionSet[0];
    const shuffledAnswers = shuffleArray(
      firstQuestion.answers.map((a) => ({ answer_id: a.answer_id, answer_text: a.answer_text }))
    );

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          session_id: session.id,
          question: {
            question_text: firstQuestion.question_text,
            answers: shuffledAnswers,
          },
          ui: config.ui,
          lead_capture: config.lead_capture,
          timer: config.timer,
          total_questions: config.question_count,
          current_question: 1,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'START_SESSION_FAILED', message: (error as Error).message },
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
