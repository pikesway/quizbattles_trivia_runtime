import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

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

interface LeadCapturePayload {
  session_id: string;
  data: Record<string, string>;
  terms_accepted?: boolean;
}

interface ValidationError {
  field: string;
  message: string;
}

function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validatePhone(phone: string): boolean {
  const digitsOnly = phone.replace(/\D/g, '');
  return digitsOnly.length === 10;
}

function validateLeadData(
  data: Record<string, string>,
  termsAccepted: boolean | undefined,
  leadCaptureConfig: LeadCaptureConfig
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const field of leadCaptureConfig.fields) {
    const value = data[field.name]?.trim() || '';

    if (field.required && !value) {
      errors.push({
        field: field.name,
        message: `${field.label} is required`,
      });
      continue;
    }

    if (value) {
      if (field.type === 'email' && !validateEmail(value)) {
        errors.push({
          field: field.name,
          message: 'Please enter a valid email address',
        });
      }

      if (field.type === 'phone' && !validatePhone(value)) {
        errors.push({
          field: field.name,
          message: 'Please enter a valid 10 digit phone number',
        });
      }
    }
  }

  if (leadCaptureConfig.terms?.enabled && leadCaptureConfig.terms?.required) {
    if (!termsAccepted) {
      errors.push({
        field: 'terms',
        message: 'You must accept the terms to continue',
      });
    }
  }

  return errors;
}

async function captureLeadOnPlatform(
  session: any,
  leadData: Record<string, string>
): Promise<string | null> {
  const webhookUrl = Deno.env.get('PLATFORM_WEBHOOK_URL');
  const webhookSecret = Deno.env.get('PLATFORM_WEBHOOK_SECRET');

  if (!webhookUrl || !webhookSecret) {
    console.log('Platform webhook not configured, skipping lead capture');
    return null;
  }

  try {
    const nameParts = (leadData.name || '').trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const payload = {
      event_type: 'lead_capture',
      campaign_id: session.campaign_id,
      first_name: firstName,
      last_name: lastName,
      email: leadData.email || '',
      phone: leadData.phone || '',
    };

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
      console.error('Platform webhook failed:', response.status, await response.text());
      return null;
    }

    const result = await response.json();
    return result.lead_id || null;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      console.error('Platform webhook timeout after 5 seconds');
    } else {
      console.error('Error calling platform webhook:', error);
    }
    return null;
  }
}

function isTestSession(session: any): boolean {
  return session.is_test_session === true;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { session_id, data, terms_accepted }: LeadCapturePayload = await req.json();

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

    const leadCaptureConfig: LeadCaptureConfig = session.config?.lead_capture || {
      enabled: true,
      headline: 'Complete Your Entry',
      fields: [
        { type: 'name', name: 'name', label: 'Name', placeholder: 'Enter your name', required: true },
        { type: 'email', name: 'email', label: 'Email', placeholder: 'Enter your email', required: true },
      ],
      terms: { enabled: false, text: '', required: false },
      submit_label: 'Submit',
    };

    const validationErrors = validateLeadData(data, terms_accepted, leadCaptureConfig);
    if (validationErrors.length > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Please correct the errors below',
            details: validationErrors,
          },
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (isTestSession(session)) {
      console.log('Test session detected, skipping platform lead capture');
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            lead_id: null,
            captured: false,
            test_mode: true,
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const leadId = await captureLeadOnPlatform(session, data);

    if (leadId) {
      const metadata = session.metadata || {};
      metadata.platform_lead_id = leadId;

      const { error: updateError } = await supabase
        .from('trivia_game_sessions')
        .update({
          lead_id: leadId,
          metadata: metadata
        })
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
