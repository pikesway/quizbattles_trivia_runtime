import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface LeadCapturePayload {
  session_id: string;
  data: Record<string, string>;
}

async function captureLeadOnPlatform(
  session: any,
  leadData: Record<string, string>
): Promise<string | null> {
  const platformUrl = Deno.env.get('PLATFORM_API_URL');
  if (!platformUrl) {
    console.log('Platform API URL not configured, skipping lead capture');
    return null;
  }

  try {
    const payload = {
      campaign_id: session.campaign_id,
      campaign_game_instance_id: session.campaign_game_instance_id,
      ...leadData,
    };

    const response = await fetch(`${platformUrl}/api/leads/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error('Failed to capture lead on platform:', await response.text());
      return null;
    }

    const result = await response.json();
    return result.lead_id || null;
  } catch (error) {
    console.error('Error capturing lead on platform:', error);
    return null;
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

    const { session_id, data }: LeadCapturePayload = await req.json();

    if (!session_id || !data) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'Missing required fields' },
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

    if (session.lead_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'LEAD_ALREADY_CAPTURED', message: 'Lead already captured for this session' },
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const leadId = await captureLeadOnPlatform(session, data);

    if (leadId) {
      const { error: updateError } = await supabase
        .from('trivia_game_sessions')
        .update({ lead_id: leadId })
        .eq('id', session_id);

      if (updateError) {
        console.error('Failed to update session with lead_id:', updateError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          lead_id: leadId,
          captured: !!leadId,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'LEAD_CAPTURE_FAILED', message: (error as Error).message },
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
