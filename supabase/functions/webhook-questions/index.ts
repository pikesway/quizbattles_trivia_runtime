import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyAdminAuth } from '../_shared/adminAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Api-Key',
};

interface WebhookAnswer {
  text: string;
  is_correct: boolean;
}

interface WebhookQuestion {
  external_question_id?: string;
  question: string;
  explanation?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  answers: WebhookAnswer[];
  active?: boolean;
}

interface WebhookPayload {
  import_batch_id?: string;
  source: string;
  shell_slug?: string;
  topic: string;
  tags: string[];
  questions: WebhookQuestion[];
}

interface ValidationError {
  row?: number;
  field?: string;
  message: string;
  value?: unknown;
}

function successResponse(data: unknown) {
  return { success: true, data };
}

function errorResponse(code: string, message: string, details?: unknown) {
  return { success: false, error: { code, message, details } };
}

async function verifyAuth(req: Request): Promise<{ valid: boolean; sourceType: 'webhook' | 'csv'; error?: string }> {
  const apiKey = req.headers.get('X-Api-Key');
  const expectedApiKey = Deno.env.get('WEBHOOK_API_KEY');

  if (apiKey) {
    if (!expectedApiKey) {
      return { valid: false, sourceType: 'webhook', error: 'Webhook API key not configured on server' };
    }
    if (apiKey !== expectedApiKey) {
      return { valid: false, sourceType: 'webhook', error: 'Invalid API key' };
    }
    return { valid: true, sourceType: 'webhook' };
  }

  const authResult = await verifyAdminAuth(req);
  if (authResult.adminProfile) {
    return { valid: true, sourceType: 'csv' };
  }

  return { valid: false, sourceType: 'webhook', error: 'Authentication required (provide X-Api-Key header or admin Bearer token)' };
}

function validatePayload(payload: WebhookPayload): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!payload.source || payload.source.trim().length === 0) {
    errors.push({ field: 'source', message: 'Source identifier is required' });
  }

  if (!payload.topic || payload.topic.trim().length === 0) {
    errors.push({ field: 'topic', message: 'Topic is required' });
  }

  if (!payload.questions || !Array.isArray(payload.questions)) {
    errors.push({ field: 'questions', message: 'Questions array is required' });
  } else if (payload.questions.length === 0) {
    errors.push({ field: 'questions', message: 'At least one question is required' });
  }

  return errors;
}

function validateQuestion(question: WebhookQuestion, index: number): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!question.question || question.question.trim().length === 0) {
    errors.push({ row: index, field: 'question', message: 'Question text is required' });
  }

  if (!question.difficulty || !['easy', 'medium', 'hard'].includes(question.difficulty)) {
    errors.push({
      row: index,
      field: 'difficulty',
      message: 'Difficulty must be easy, medium, or hard',
      value: question.difficulty,
    });
  }

  if (!question.answers || !Array.isArray(question.answers)) {
    errors.push({ row: index, field: 'answers', message: 'Answers array is required' });
  } else {
    if (question.answers.length < 2) {
      errors.push({ row: index, message: 'At least 2 answers are required' });
    }
    if (question.answers.length > 4) {
      errors.push({ row: index, message: 'Maximum 4 answers allowed' });
    }

    const correctCount = question.answers.filter(a => a.is_correct).length;
    if (correctCount === 0) {
      errors.push({ row: index, message: 'At least one answer must be marked as correct' });
    } else if (correctCount > 1) {
      errors.push({ row: index, message: 'Only one answer can be marked as correct' });
    }

    for (let i = 0; i < question.answers.length; i++) {
      if (!question.answers[i].text || question.answers[i].text.trim().length === 0) {
        errors.push({ row: index, field: `answers[${i}].text`, message: 'Answer text is required' });
      }
    }
  }

  return errors;
}

function difficultyToNumeric(level: string): number {
  switch (level) {
    case 'easy': return 1;
    case 'medium': return 3;
    case 'hard': return 5;
    default: return 3;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify(errorResponse('METHOD_NOT_ALLOWED', 'Only POST requests are allowed')),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { valid, sourceType, error: authError } = await verifyAuth(req);
  if (!valid) {
    return new Response(
      JSON.stringify(errorResponse('UNAUTHORIZED', authError || 'Authentication required')),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload: WebhookPayload = await req.json();

    const { data: webhookLog, error: logError } = await supabase
      .from('trivia_webhook_logs')
      .insert({
        source: payload.source || 'unknown',
        request_payload: payload,
        processing_result: 'pending',
      })
      .select()
      .single();

    if (logError) throw logError;

    const payloadErrors = validatePayload(payload);
    if (payloadErrors.length > 0) {
      await supabase
        .from('trivia_webhook_logs')
        .update({
          processing_result: 'failed',
          error_details: { validation_errors: payloadErrors },
        })
        .eq('id', webhookLog.id);

      return new Response(
        JSON.stringify(errorResponse('VALIDATION_FAILED', 'Payload validation failed', payloadErrors)),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: batch, error: batchError } = await supabase
      .from('trivia_question_import_batches')
      .insert({
        source_type: sourceType,
        source_identifier: payload.source,
        shell_slug: payload.shell_slug || null,
        total_items: payload.questions.length,
        processing_status: 'processing',
        raw_metadata: {
          import_batch_id: payload.import_batch_id,
          source: payload.source,
          topic: payload.topic,
          tags: payload.tags,
        },
      })
      .select()
      .single();

    if (batchError) throw batchError;

    const createdQuestionIds: string[] = [];
    const errors: ValidationError[] = [];

    for (let i = 0; i < payload.questions.length; i++) {
      const webhookQuestion = payload.questions[i];

      const questionErrors = validateQuestion(webhookQuestion, i);
      if (questionErrors.length > 0) {
        errors.push(...questionErrors);
        continue;
      }

      try {
        const { data: question, error: questionError } = await supabase
          .from('trivia_questions')
          .insert({
            question_text: webhookQuestion.question.trim(),
            explanation: webhookQuestion.explanation?.trim() || '',
            topic: payload.topic.trim(),
            tags: payload.tags || [],
            difficulty: difficultyToNumeric(webhookQuestion.difficulty),
            difficulty_level: webhookQuestion.difficulty,
            review_state: 'pending_review',
            source_type: sourceType,
            source_batch_id: batch.id,
            external_question_id: webhookQuestion.external_question_id || null,
            is_active: webhookQuestion.active !== false,
          })
          .select()
          .single();

        if (questionError) throw questionError;

        const answerInserts = webhookQuestion.answers.map((a, index) => ({
          question_id: question.id,
          answer_text: a.text.trim(),
          is_correct: a.is_correct,
          display_order: index + 1,
        }));

        const { error: answersError } = await supabase
          .from('trivia_answers')
          .insert(answerInserts);

        if (answersError) throw answersError;

        createdQuestionIds.push(question.id);
      } catch (err) {
        errors.push({
          row: i,
          message: (err as Error).message,
        });
      }
    }

    const successCount = createdQuestionIds.length;
    const failureCount = errors.length;
    const processingResult = failureCount === payload.questions.length ? 'failed' :
                            failureCount > 0 ? 'partial' : 'success';

    await supabase
      .from('trivia_question_import_batches')
      .update({
        processing_status: failureCount === payload.questions.length ? 'failed' : 'completed',
        success_count: successCount,
        failure_count: failureCount,
        error_details: errors,
      })
      .eq('id', batch.id);

    await supabase
      .from('trivia_webhook_logs')
      .update({
        processing_result: processingResult,
        batch_id: batch.id,
        error_details: errors.length > 0 ? { question_errors: errors } : null,
      })
      .eq('id', webhookLog.id);

    return new Response(
      JSON.stringify(successResponse({
        batch_id: batch.id,
        webhook_log_id: webhookLog.id,
        total_received: payload.questions.length,
        success_count: successCount,
        failure_count: failureCount,
        created_question_ids: createdQuestionIds,
        errors: errors.length > 0 ? errors : undefined,
      })),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify(errorResponse('SERVER_ERROR', (error as Error).message)),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
