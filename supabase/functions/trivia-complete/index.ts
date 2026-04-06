import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface EndScreenCase {
  id: string;
  min_percentage: number;
  max_percentage: number | null;
  message: string;
  share_text_override: string | null;
}

interface EndScreenRule {
  min: number;
  max: number;
  text: string;
}

interface EndScreenCtaConfig {
  enabled: boolean;
  label: string;
}

interface SocialShareConfig {
  enabled: boolean;
  share_text_template: string;
  share_image_url: string;
  hashtags: string[];
  fallback_url: string;
}

const DEFAULT_END_SCREEN_RULES: EndScreenRule[] = [
  { min: 0, max: 20, text: 'Keep practicing!' },
  { min: 21, max: 50, text: 'Good effort!' },
  { min: 51, max: 80, text: 'Well done!' },
  { min: 81, max: 100, text: 'Excellent!' },
];

function getEndScreenMessageFromCases(
  percentage: number,
  cases: EndScreenCase[]
): { message: string; shareTextOverride: string | null } | null {
  if (!cases || cases.length === 0) {
    return null;
  }

  for (const caseItem of cases) {
    const maxPct = caseItem.max_percentage ?? 100;
    if (percentage >= caseItem.min_percentage && percentage <= maxPct) {
      return {
        message: caseItem.message,
        shareTextOverride: caseItem.share_text_override,
      };
    }
  }

  return null;
}

function getEndScreenMessageFromLegacyRules(
  percentage: number,
  rules: EndScreenRule[]
): string {
  const endScreenRules = rules && rules.length > 0 ? rules : DEFAULT_END_SCREEN_RULES;

  for (const rule of endScreenRules) {
    if (percentage >= rule.min && percentage <= rule.max) {
      return rule.text;
    }
  }

  return 'Game completed!';
}

function resolveShareText(
  template: string,
  score: number,
  total: number,
  percentage: number,
  resultMessage: string,
  quizName: string
): string {
  return template
    .replace(/\{score\}/g, String(score))
    .replace(/\{total\}/g, String(total))
    .replace(/\{percentage\}/g, String(percentage))
    .replace(/\{result_message\}/g, resultMessage)
    .replace(/\{quiz_name\}/g, quizName);
}

async function sendGameCompleteWebhook(session: Record<string, unknown>): Promise<any> {
  const webhookUrl = Deno.env.get('PLATFORM_WEBHOOK_URL');
  const webhookSecret = Deno.env.get('PLATFORM_WEBHOOK_SECRET');

  if (!webhookUrl || !webhookSecret) {
    return { status: 'skipped', reason: 'Platform webhook missing ENV variables' };
  }

  try {
    const timeElapsedSeconds = session.completed_at && session.started_at
      ? Math.round((new Date(session.completed_at as string).getTime() - new Date(session.started_at as string).getTime()) / 1000)
      : 0;

    const metadata = (session.metadata as Record<string, unknown>) || {};
    const leadId = metadata.platform_lead_id || session.lead_id || null;

    const payload = {
      event_type: 'game_complete',
      campaign_id: session.campaign_id,
      instance_id: session.campaign_game_instance_id || null,
      lead_id: leadId,
      final_score: session.correct_answers || 0,
      time_elapsed_seconds: timeElapsedSeconds,
    };

    if (!leadId) {
      return { status: 'skipped', reason: 'lead_id is null', payload };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${webhookSecret}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      return { status: 'failed', code: response.status, platform_response: errText, payload };
    }

    const successData = await response.json();
    return { status: 'success', platform_response: successData, payload };

  } catch (error) {
    return { status: 'error', reason: (error as Error).message };
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

    const { session_id, metadata: requestMetadata } = await req.json();

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

    const correctAnswers = session.correct_answers || 0;
    const totalQuestions = session.total_questions || 1;
    const percentage = Math.round((correctAnswers / totalQuestions) * 100);

    const config = session.config || {};
    const endScreenCases = config.end_screen_cases as EndScreenCase[] | undefined;
    const endScreenRules = config.end_screen_rules as EndScreenRule[] | undefined;
    const screens = config.screens || {};
    const endScreenConfig = screens.end || {};
    const ctaConfig = endScreenConfig.cta as EndScreenCtaConfig | undefined;
    const socialShareConfig = endScreenConfig.social_share as SocialShareConfig | undefined;

    const caseMatch = getEndScreenMessageFromCases(percentage, endScreenCases || []);
    const message = caseMatch?.message || getEndScreenMessageFromLegacyRules(percentage, endScreenRules || []);

    let shareText: string | undefined;
    if (socialShareConfig?.enabled && socialShareConfig.share_text_template) {
      const templateToUse = caseMatch?.shareTextOverride || socialShareConfig.share_text_template;
      shareText = resolveShareText(
        templateToUse,
        correctAnswers,
        totalQuestions,
        percentage,
        message,
        config.shell_slug || 'Quiz'
      );
    }

    const responseData = {
      score: session.score,
      total: totalQuestions,
      percentage,
      message,
      correct_answers: correctAnswers,
      share_text: shareText,
      cta: ctaConfig?.enabled ? { enabled: true, label: ctaConfig.label || 'Continue' } : undefined,
      social_share: socialShareConfig?.enabled ? {
        enabled: true,
        share_text: shareText || '',
        share_image_url: socialShareConfig.share_image_url || '',
        hashtags: socialShareConfig.hashtags || [],
        fallback_url: socialShareConfig.fallback_url || '',
      } : undefined,
    };

    if (session.status === 'completed') {
      await sendGameCompleteWebhook(session);
      return new Response(
        JSON.stringify({ success: true, data: responseData }),
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

    const updatedMetadata = { ...(session.metadata || {}) };
    if (requestMetadata?.device_id) {
      updatedMetadata.device_id = requestMetadata.device_id;
    }

    const { error: updateError } = await supabase
      .from('trivia_game_sessions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        metadata: updatedMetadata,
      })
      .eq('id', session_id);

    if (updateError) throw updateError;

    session.status = 'completed';
    session.completed_at = new Date().toISOString();

    const webhookDebug = await sendGameCompleteWebhook(session);

    return new Response(
      JSON.stringify({ success: true, data: { ...responseData, debug_webhook: webhookDebug } }),
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
