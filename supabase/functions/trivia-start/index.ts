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

interface LeadField {
  type: 'name' | 'email' | 'phone' | 'text';
  name: string;
  label: string;
  placeholder: string;
  required: boolean;
}

interface LeadTermsConfig {
  enabled: boolean;
  text: string;
  required: boolean;
}

interface LeadCaptureConfig {
  enabled: boolean;
  headline: string;
  fields: LeadField[];
  terms: LeadTermsConfig;
  submit_label: string;
}

interface GameConfig {
  question_mode: 'fixed' | 'random';
  question_count: number;
  timer: { mode: string; seconds: number };
  ui: { background_url: string };
  lead_capture: LeadCaptureConfig;
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
      headline: 'Complete Your Entry',
      fields: [
        { type: 'name', name: 'name', label: 'Name', placeholder: 'Enter your name', required: true },
        { type: 'email', name: 'email', label: 'Email', placeholder: 'Enter your email', required: true },
        { type: 'phone', name: 'phone', label: 'Phone', placeholder: '10 digit phone number', required: false },
      ],
      terms: {
        enabled: true,
        text: 'By submitting your information you agree to receive promotional communications',
        required: true,
      },
      submit_label: 'Submit',
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

    const { template_id, campaign_id, campaign_game_instance_id, lead_id } = await req.json();

    if (!template_id || !campaign_id || !campaign_game_instance_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'Missing required fields' },
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: shell, error: shellError } = await supabase
      .from('trivia_shells')
      .select('*')
      .eq('slug', template_id)
      .eq('status', 'active')
      .maybeSingle();

    if (shellError) throw shellError;

    if (!shell) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'SHELL_NOT_FOUND', message: 'Game template not found or inactive' },
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const config: GameConfig = {
      question_mode: shell.default_selection_mode || 'random',
      question_count: shell.default_question_count || 10,
      timer: {
        mode: shell.default_timer_mode || 'per_question',
        seconds: shell.default_timer_seconds || 15,
      },
      ui: {
        background_url: shell.config?.backgrounds?.default || shell.config?.backgrounds?.game || 'https://images.pexels.com/photos/1939485/pexels-photo-1939485.jpeg',
      },
      lead_capture: shell.config?.lead_capture || getDefaultConfig().lead_capture,
      end_screen_rules: shell.config?.score_range_messages || getDefaultConfig().end_screen_rules,
    };

    let questions;
    if (config.question_mode === 'fixed') {
      const { data: links, error: linksError } = await supabase
        .from('trivia_shell_question_links')
        .select('question_id')
        .eq('shell_id', shell.id)
        .order('position', { ascending: true })
        .limit(config.question_count);

      if (linksError) throw linksError;

      const questionIds = (links || []).map((link) => link.question_id);

      if (questionIds.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: { code: 'NO_QUESTIONS', message: 'No questions configured for this game' },
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data, error } = await supabase
        .from('trivia_questions')
        .select('*')
        .in('id', questionIds)
        .eq('is_active', true)
        .eq('review_state', 'approved');

      if (error) throw error;

      const questionsMap = new Map((data || []).map((q) => [q.id, q]));
      questions = questionIds.map((id) => questionsMap.get(id)).filter(Boolean);
    } else {
      const { data, error } = await supabase
        .from('trivia_questions')
        .select('*')
        .eq('is_active', true)
        .eq('review_state', 'approved')
        .limit(config.question_count * 3);

      if (error) throw error;

      if (!data || data.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: { code: 'NO_QUESTIONS', message: 'No approved questions available' },
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

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
        shell_id: shell.id,
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
