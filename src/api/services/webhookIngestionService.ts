import { ImportRepository } from '../repositories/importRepository';
import { QuestionBankService, CreateQuestionWithAnswersInput } from './questionBankService';
import {
  QuestionImportBatch,
  WebhookLog,
  WebhookImportPayload,
  WebhookQuestion,
  DifficultyLevel,
  ImportErrorDetail,
} from '../../types/authoring';

export interface WebhookIngestionResult {
  log: WebhookLog;
  batch: QuestionImportBatch | null;
  created_question_ids: string[];
  errors: ImportErrorDetail[];
}

export class WebhookIngestionService {
  private importRepo: ImportRepository;
  private questionService: QuestionBankService;

  constructor() {
    this.importRepo = new ImportRepository();
    this.questionService = new QuestionBankService();
  }

  async ingestWebhook(payload: WebhookImportPayload): Promise<WebhookIngestionResult> {
    const log = await this.importRepo.createWebhookLog(
      payload.source,
      payload as unknown as Record<string, unknown>
    );

    try {
      const validationErrors = this.validatePayload(payload);
      if (validationErrors.length > 0) {
        await this.importRepo.updateWebhookLog(
          log.id,
          'failed',
          undefined,
          { validation_errors: validationErrors }
        );

        return {
          log: await this.getUpdatedLog(log.id),
          batch: null,
          created_question_ids: [],
          errors: validationErrors,
        };
      }

      const batch = await this.importRepo.createBatch({
        source_type: 'webhook',
        source_identifier: payload.source,
        shell_slug: payload.shell_slug,
        total_items: payload.questions.length,
        raw_metadata: {
          import_batch_id: payload.import_batch_id,
          source: payload.source,
          topic: payload.topic,
          tags: payload.tags,
        },
      });

      const createdQuestionIds: string[] = [];
      const errors: ImportErrorDetail[] = [];

      for (let i = 0; i < payload.questions.length; i++) {
        const webhookQuestion = payload.questions[i];

        try {
          const questionErrors = this.validateQuestion(webhookQuestion, i);
          if (questionErrors.length > 0) {
            errors.push(...questionErrors);
            continue;
          }

          const questionInput = this.webhookQuestionToInput(
            webhookQuestion,
            payload.topic,
            payload.tags,
            batch.id
          );
          const question = await this.questionService.createQuestion(questionInput);
          createdQuestionIds.push(question.id);
        } catch (err) {
          errors.push({
            row: i,
            message: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      const successCount = createdQuestionIds.length;
      const failureCount = errors.length;
      const processingResult = failureCount === payload.questions.length ? 'failed' :
                               failureCount > 0 ? 'partial' : 'success';

      await this.importRepo.updateBatchStatus(
        batch.id,
        failureCount === payload.questions.length ? 'failed' : 'completed',
        successCount,
        failureCount,
        errors
      );

      await this.importRepo.updateWebhookLog(
        log.id,
        processingResult,
        batch.id,
        errors.length > 0 ? { question_errors: errors } : undefined
      );

      const updatedBatch = await this.importRepo.getBatch(batch.id);
      const updatedLog = await this.getUpdatedLog(log.id);

      return {
        log: updatedLog,
        batch: updatedBatch,
        created_question_ids: createdQuestionIds,
        errors,
      };
    } catch (err) {
      await this.importRepo.updateWebhookLog(
        log.id,
        'failed',
        undefined,
        { error: err instanceof Error ? err.message : 'Unknown error' }
      );

      throw err;
    }
  }

  private validatePayload(payload: WebhookImportPayload): ImportErrorDetail[] {
    const errors: ImportErrorDetail[] = [];

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

  private validateQuestion(question: WebhookQuestion, index: number): ImportErrorDetail[] {
    const errors: ImportErrorDetail[] = [];

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

  private webhookQuestionToInput(
    question: WebhookQuestion,
    topic: string,
    tags: string[],
    batchId: string
  ): CreateQuestionWithAnswersInput {
    return {
      question_text: question.question.trim(),
      explanation: question.explanation?.trim() || '',
      topic: topic.trim(),
      tags,
      difficulty_level: question.difficulty as DifficultyLevel,
      answers: question.answers.map(a => ({
        text: a.text.trim(),
        is_correct: a.is_correct,
      })),
      review_state: 'pending_review',
      source_type: 'webhook',
      source_batch_id: batchId,
      external_question_id: question.external_question_id,
    };
  }

  private async getUpdatedLog(logId: string): Promise<WebhookLog> {
    const { supabase } = await import('../../lib/supabase');
    const { data, error } = await supabase
      .from('trivia_webhook_logs')
      .select('*')
      .eq('id', logId)
      .single();

    if (error) throw new Error(`Failed to fetch webhook log: ${error.message}`);
    return data;
  }
}
