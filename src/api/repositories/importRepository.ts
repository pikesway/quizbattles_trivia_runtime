import { supabase } from '../../lib/supabase';
import {
  QuestionImportBatch,
  WebhookLog,
  ImportProcessingStatus,
  WebhookProcessingResult,
  ImportErrorDetail,
} from '../../types/authoring';

export interface CreateImportBatchInput {
  source_type: 'csv' | 'webhook';
  source_identifier: string;
  shell_slug?: string;
  total_items: number;
  raw_metadata?: Record<string, unknown>;
  created_by?: string;
}

export class ImportRepository {
  async createBatch(input: CreateImportBatchInput): Promise<QuestionImportBatch> {
    const { data, error } = await supabase
      .from('trivia_question_import_batches')
      .insert({
        source_type: input.source_type,
        source_identifier: input.source_identifier,
        shell_slug: input.shell_slug || null,
        total_items: input.total_items,
        raw_metadata: input.raw_metadata || {},
        created_by: input.created_by || null,
        processing_status: 'processing',
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create import batch: ${error.message}`);
    return data;
  }

  async getBatch(id: string): Promise<QuestionImportBatch | null> {
    const { data, error } = await supabase
      .from('trivia_question_import_batches')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`Failed to fetch import batch: ${error.message}`);
    return data;
  }

  async listBatches(
    sourceType?: 'csv' | 'webhook',
    limit = 50,
    offset = 0
  ): Promise<QuestionImportBatch[]> {
    let query = supabase
      .from('trivia_question_import_batches')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (sourceType) {
      query = query.eq('source_type', sourceType);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Failed to list import batches: ${error.message}`);
    return data || [];
  }

  async updateBatchStatus(
    id: string,
    status: ImportProcessingStatus,
    successCount?: number,
    failureCount?: number,
    errorDetails?: ImportErrorDetail[]
  ): Promise<QuestionImportBatch> {
    const updates: Record<string, unknown> = { processing_status: status };

    if (successCount !== undefined) {
      updates.success_count = successCount;
    }
    if (failureCount !== undefined) {
      updates.failure_count = failureCount;
    }
    if (errorDetails !== undefined) {
      updates.error_details = errorDetails;
    }

    const { data, error } = await supabase
      .from('trivia_question_import_batches')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update import batch: ${error.message}`);
    return data;
  }

  async createWebhookLog(
    source: string,
    requestPayload: Record<string, unknown>
  ): Promise<WebhookLog> {
    const { data, error } = await supabase
      .from('trivia_webhook_logs')
      .insert({
        source,
        request_payload: requestPayload,
        processing_result: 'pending',
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create webhook log: ${error.message}`);
    return data;
  }

  async updateWebhookLog(
    id: string,
    result: WebhookProcessingResult,
    batchId?: string,
    errorDetails?: Record<string, unknown>
  ): Promise<WebhookLog> {
    const updates: Record<string, unknown> = {
      processing_result: result,
    };

    if (batchId) {
      updates.batch_id = batchId;
    }
    if (errorDetails) {
      updates.error_details = errorDetails;
    }

    const { data, error } = await supabase
      .from('trivia_webhook_logs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update webhook log: ${error.message}`);
    return data;
  }

  async listWebhookLogs(limit = 50, offset = 0): Promise<WebhookLog[]> {
    const { data, error } = await supabase
      .from('trivia_webhook_logs')
      .select('*')
      .order('request_timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to list webhook logs: ${error.message}`);
    return data || [];
  }

  async getWebhookLogsBySource(
    source: string,
    limit = 50
  ): Promise<WebhookLog[]> {
    const { data, error } = await supabase
      .from('trivia_webhook_logs')
      .select('*')
      .eq('source', source)
      .order('request_timestamp', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to list webhook logs by source: ${error.message}`);
    return data || [];
  }
}
