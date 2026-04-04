import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = result[key];

      // If source value is null or undefined, skip it
      if (sourceValue === null || sourceValue === undefined) {
        continue;
      }

      // If source value is an array, completely replace the target array
      if (Array.isArray(sourceValue)) {
        result[key] = sourceValue as any;
      }
      // If both values are plain objects, recursively merge them
      else if (
        typeof sourceValue === 'object' &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue) &&
        targetValue !== null
      ) {
        result[key] = deepMerge(targetValue, sourceValue) as any;
      }
      // Otherwise, directly assign the source value
      else {
        result[key] = sourceValue as any;
      }
    }
  }

  return result;
}

Deno.serve(async (req: Request) => {
  // CORS preflight - MUST be first line
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role key (bypasses auth)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body
    const { template_id, campaign_id, campaign_game_instance_id, lead_id } = await req.json();

    // Debug logging
    console.log('Received template_id:', template_id);
    console.log('Received campaign_id:', campaign_id);

    // STEP 1: Fetch the shell by ID (template_id is the shell UUID)
    const { data: shell, error: shellError } = await supabase
      .from('trivia_shells')
      .select('*')
      .eq('id', template_id)
      .maybeSingle();

    if (shellError) {
      console.error('Shell query error:', shellError);
      return new Response(
        JSON.stringify({ success: false, error: 'Shell not found.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!shell) {
      return new Response(
        JSON.stringify({ success: false, error: 'Shell not found.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // STEP 1.5: Fetch instance overrides if campaign_game_instance_id is provided
    // Skip override fetch for standalone placeholder values
    let instanceOverrides = {};
    if (campaign_game_instance_id && campaign_game_instance_id !== 'standalone-instance') {
      console.log('Fetching overrides for instance_id:', campaign_game_instance_id);
      const { data: overrideData, error: overrideError } = await supabase
        .from('trivia_instance_overrides')
        .select('settings')
        .eq('instance_id', campaign_game_instance_id)
        .maybeSingle();

      if (overrideError) {
        console.error('Override query error (continuing with defaults):', overrideError);
      } else if (overrideData) {
        instanceOverrides = overrideData.settings || {};
        console.log('Instance overrides found:', Object.keys(instanceOverrides));
      } else {
        console.log('No instance overrides found, using shell defaults');
      }
    } else if (campaign_game_instance_id === 'standalone-instance') {
      console.log('Standalone session detected, skipping override fetch');
    }

    // Extract shell properties
    const topic = shell.topic;
    const tags = shell.tags || [];
    const question_count = instanceOverrides.question_count || shell.default_question_count || 10;

    // STEP 2: Query questions using Option C (PostgreSQL OR Query)
    let questionsQuery = supabase
      .from('trivia_questions')
      .select('*')
      .eq('is_active', true)
      .eq('review_state', 'approved');

    // Apply Option C OR logic
    if (tags && tags.length > 0) {
      // If we have tags, use OR condition: topic matches OR tags overlap
      const orCondition = `topic.eq.${topic},tags.ov.{${tags.join(',')}}`;
      questionsQuery = questionsQuery.or(orCondition);
    } else {
      // If no tags, just filter by topic
      questionsQuery = questionsQuery.eq('topic', topic);
    }

    // Fetch 3x the limit for shuffling pool
    questionsQuery = questionsQuery.limit(question_count * 3);

    const { data: fetchedQuestions, error: questionsError } = await questionsQuery;

    if (questionsError) {
      console.error('Questions query error:', questionsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Zero matching questions found for this topic/tags.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!fetchedQuestions || fetchedQuestions.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Zero matching questions found for this topic/tags.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Shuffle and take the exact count needed
    const selectedQuestions = shuffleArray(fetchedQuestions).slice(0, question_count);

    // Fetch answers for selected questions
    const questionIds = selectedQuestions.map((q) => q.id);
    const { data: answers, error: answersError } = await supabase
      .from('trivia_answers')
      .select('*')
      .in('question_id', questionIds);

    if (answersError) {
      console.error('Answers query error:', answersError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch question answers.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build answers map
    const answersMap = new Map();
    (answers || []).forEach((answer) => {
      const existing = answersMap.get(answer.question_id) || [];
      answersMap.set(answer.question_id, [...existing, answer]);
    });

    // Build question snapshot with shuffled answers
    const questionSet: QuestionSnapshot[] = selectedQuestions.map((question) => ({
      question_id: question.id,
      question_text: question.question_text,
      explanation: question.explanation || '',
      answers: shuffleArray(
        (answersMap.get(question.id) || []).map((a: any) => ({
          answer_id: a.id,
          answer_text: a.answer_text,
          is_correct: a.is_correct,
        }))
      ),
    }));

    // Build config from shell defaults
    const config = {
      question_mode: shell.default_selection_mode || 'random',
      question_count: question_count,
      timer: {
        mode: shell.default_timer_mode || 'per_question',
        seconds: shell.default_timer_seconds || 15,
      },
      ui: {
        background_url: shell.config?.backgrounds?.default ||
                       shell.config?.backgrounds?.game ||
                       'https://images.pexels.com/photos/1939485/pexels-photo-1939485.jpeg',
      },
      lead_capture: shell.config?.lead_capture || {
        enabled: true,
        headline: 'Complete Your Entry',
        fields: [
          { type: 'name', name: 'name', label: 'Name', placeholder: 'Enter your name', required: true },
          { type: 'email', name: 'email', label: 'Email', placeholder: 'Enter your email', required: true },
        ],
        terms: {
          enabled: true,
          text: 'By submitting your information you agree to receive promotional communications',
          required: true,
        },
        submit_label: 'Submit',
      },
      end_screen_rules: shell.config?.score_range_messages || [
        { min: 0, max: 0, text: 'Try again! Better luck next time.' },
        { min: 1, max: 4, text: 'Not bad! Keep practicing.' },
        { min: 5, max: 7, text: 'Good job! You know your stuff.' },
        { min: 8, max: 9, text: 'Excellent! Almost perfect.' },
        { min: 10, max: 10, text: 'Legend! Perfect score!' },
      ],
    };

    // Apply instance overrides using deep merge
    const finalConfig = deepMerge(config, instanceOverrides);

    // Sanitize foreign key IDs: convert standalone placeholders to null
    const sanitizedCampaignId = campaign_id === 'standalone-play' ? null : (campaign_id || null);
    const sanitizedInstanceId = campaign_game_instance_id === 'standalone-instance' ? null : (campaign_game_instance_id || null);

    // Create game session
    const now = new Date().toISOString();
    const { data: session, error: sessionError } = await supabase
      .from('trivia_game_sessions')
      .insert({
        shell_id: shell.id,
        campaign_id: sanitizedCampaignId,
        campaign_game_instance_id: sanitizedInstanceId,
        lead_id: lead_id || null,
        status: 'in_progress',
        score: 0,
        total_questions: question_count,
        correct_answers: 0,
        timer_mode: finalConfig.timer.mode,
        timer_seconds: finalConfig.timer.seconds,
        question_set: questionSet,
        current_index: 0,
        config: finalConfig,
        current_question_started_at: now,
      })
      .select()
      .single();

    if (sessionError) {
      console.error('Session creation error:', sessionError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create game session.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare first question for response (hide correctness)
    const firstQuestion = questionSet[0];
    const publicAnswers = firstQuestion.answers.map((a) => ({
      answer_id: a.answer_id,
      answer_text: a.answer_text,
    }));

    // Success response with all data needed for gameplay
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          session_id: session.id,
          shell: {
            internal_name: shell.internal_name,
            topic: shell.topic,
            config: finalConfig,
          },
          question: {
            question_text: firstQuestion.question_text,
            answers: publicAnswers,
          },
          ui: finalConfig.ui,
          lead_capture: finalConfig.lead_capture,
          timer: finalConfig.timer,
          total_questions: question_count,
          current_question: 1,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    // Catch-all error handler - always return 200 with error structure
    console.error('Unexpected error in trivia-start:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: `Unexpected error: ${(error as Error).message}`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
