import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const DEFAULT_END_SCREEN_RULES = [
  { min: 0, max: 0, text: 'Try again! Better luck next time.' },
  { min: 1, max: 4, text: 'Not bad! Keep practicing.' },
  { min: 5, max: 7, text: 'Good job! You know your stuff.' },
  { min: 8, max: 9, text: 'Excellent! Almost perfect.' },
  { min: 10, max: 100, text: 'Legend! Perfect score!' },
];

function getEndScreenMessage(score: number, rules: Array<{ min: number; max: number; text: string }>): string {
  const endScreenRules = rules && rules.length > 0 ? rules : DEFAULT_END_SCREEN_RULES;

  for (const rule of endScreenRules) {
    if (score >= rule.min && score <= rule.max) {
      return rule.text;
    }
  }

  return 'Game completed!';
}

async function recordGamePlayOnPlatform(session: any): Promise<void> {
  const platformUrl = Deno.env.get('PLATFORM_API_URL');
  if (!platformUrl) {
    console.log('Platform API URL not configured, skipping game play record');
    return;
  }

  try {
    const completionTimeMs = session.completed_at
      ? new Date(session.completed_at).getTime() - new Date(session.started_at).getTime()
      : 0;

    const payload = {
      campaign_id: session.campaign_id,
      campaign_game_instance_id: session.campaign_game_instance_id,
      lead_id: session.lead_id,
      score: session.score,
      completion_time_ms: completionTimeMs,
      session_id: session.id,
    };

    const response = await fetch(`${platformUrl}/api/game-play/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error('Failed to record game play on platform:', await response.text());
    }
  } catch (error) {
    console.error('Error recording game play on platform:', error);
  }
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

    if (session.status === 'completed') {
      const endScreenRules = session.config?.end_screen_rules || DEFAULT_END_SCREEN_RULES;
      const message = getEndScreenMessage(session.score, endScreenRules);

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            score: session.score,
            total: session.total_questions,
            message,
            correct_answers: session.correct_answers,
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (session.status !== 'in_progress') {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'INVALID_SESSION_STATE', message: 'Session cannot be completed from current state' },
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { error: updateError } = await supabase
      .from('trivia_game_sessions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', session_id);

    if (updateError) throw updateError;

    session.status = 'completed';
    session.completed_at = new Date().toISOString();

    const endScreenRules = session.config?.end_screen_rules || DEFAULT_END_SCREEN_RULES;
    const message = getEndScreenMessage(session.score, endScreenRules);

    EdgeRuntime.waitUntil(recordGamePlayOnPlatform(session));

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          score: session.score,
          total: session.total_questions,
          message,
          correct_answers: session.correct_answers,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'COMPLETE_SESSION_FAILED', message: (error as Error).message },
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
