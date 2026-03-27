import { Request, Response } from 'express';
import { ShellService } from '../services/shellService';
import { QuestionBankService } from '../services/questionBankService';
import { CSVImportService } from '../services/csvImportService';
import { WebhookIngestionService } from '../services/webhookIngestionService';
import { ReviewQueueService } from '../services/reviewQueueService';
import { ShellValidationService } from '../services/shellValidationService';
import { ImportRepository } from '../repositories/importRepository';
import { successResponse, errorResponse } from '../utils/response';
import {
  CreateShellInput,
  UpdateShellInput,
  ShellListFilters,
  QuestionListFilters,
  ShellStatus,
  ShellVisibility,
  WebhookImportPayload,
} from '../../types/authoring';

export class AdminController {
  private shellService: ShellService;
  private questionService: QuestionBankService;
  private csvImportService: CSVImportService;
  private webhookService: WebhookIngestionService;
  private reviewService: ReviewQueueService;
  private validationService: ShellValidationService;
  private importRepo: ImportRepository;

  constructor() {
    this.shellService = new ShellService();
    this.questionService = new QuestionBankService();
    this.csvImportService = new CSVImportService();
    this.webhookService = new WebhookIngestionService();
    this.reviewService = new ReviewQueueService();
    this.validationService = new ShellValidationService();
    this.importRepo = new ImportRepository();
  }

  async listShells(req: Request, res: Response): Promise<void> {
    try {
      const filters: ShellListFilters = {
        status: req.query.status as ShellStatus | undefined,
        visibility: req.query.visibility as ShellVisibility | undefined,
        topic: req.query.topic as string | undefined,
        search: req.query.search as string | undefined,
      };

      if (req.query.tags) {
        filters.tags = (req.query.tags as string).split(',');
      }

      const shells = await this.shellService.listShells(filters);
      res.json(successResponse(shells));
    } catch (error) {
      res.status(500).json(errorResponse('SHELL_LIST_ERROR', (error as Error).message));
    }
  }

  async getShell(req: Request, res: Response): Promise<void> {
    try {
      const shellId = req.params.id as string;
      const shell = await this.shellService.getShell(shellId);
      res.json(successResponse(shell));
    } catch (error) {
      res.status(404).json(errorResponse('SHELL_NOT_FOUND', (error as Error).message));
    }
  }

  async createShell(req: Request, res: Response): Promise<void> {
    try {
      const input: CreateShellInput = req.body;
      const userId = req.headers['x-user-id'] as string;
      const shell = await this.shellService.createShell(input, userId);
      res.status(201).json(successResponse(shell));
    } catch (error) {
      res.status(400).json(errorResponse('SHELL_CREATE_ERROR', (error as Error).message));
    }
  }

  async updateShell(req: Request, res: Response): Promise<void> {
    try {
      const shellId = req.params.id as string;
      const input: UpdateShellInput = req.body;
      const userId = req.headers['x-user-id'] as string;
      const shell = await this.shellService.updateShell(shellId, input, userId);
      res.json(successResponse(shell));
    } catch (error) {
      res.status(400).json(errorResponse('SHELL_UPDATE_ERROR', (error as Error).message));
    }
  }

  async updateShellStatus(req: Request, res: Response): Promise<void> {
    try {
      const shellId = req.params.id as string;
      const { status } = req.body;
      const userId = req.headers['x-user-id'] as string;

      if (status === 'ready') {
        const validation = await this.validationService.validateShell(shellId);
        if (!validation.is_valid) {
          res.status(400).json(errorResponse('VALIDATION_FAILED', 'Shell validation failed'));
          return;
        }
      }

      const shell = await this.shellService.updateShellStatus(shellId, status, userId);
      res.json(successResponse(shell));
    } catch (error) {
      res.status(400).json(errorResponse('STATUS_UPDATE_ERROR', (error as Error).message));
    }
  }

  async cloneShell(req: Request, res: Response): Promise<void> {
    try {
      const shellId = req.params.id as string;
      const { new_slug, new_name } = req.body;
      const userId = req.headers['x-user-id'] as string;
      const shell = await this.shellService.cloneShell(shellId, new_slug, new_name, userId);
      res.status(201).json(successResponse(shell));
    } catch (error) {
      res.status(400).json(errorResponse('SHELL_CLONE_ERROR', (error as Error).message));
    }
  }

  async archiveShell(req: Request, res: Response): Promise<void> {
    try {
      const shellId = req.params.id as string;
      const userId = req.headers['x-user-id'] as string;
      const shell = await this.shellService.archiveShell(shellId, userId);
      res.json(successResponse(shell));
    } catch (error) {
      res.status(400).json(errorResponse('SHELL_ARCHIVE_ERROR', (error as Error).message));
    }
  }

  async deleteShell(req: Request, res: Response): Promise<void> {
    try {
      const shellId = req.params.id as string;
      await this.shellService.deleteShell(shellId);
      res.json(successResponse({ deleted: true }));
    } catch (error) {
      res.status(400).json(errorResponse('SHELL_DELETE_ERROR', (error as Error).message));
    }
  }

  async validateShell(req: Request, res: Response): Promise<void> {
    try {
      const shellId = req.params.id as string;
      const validation = await this.validationService.validateShell(shellId);
      const supply = await this.validationService.getQuestionSupplyHealth(
        await this.shellService.getShell(shellId)
      );
      const mobileFitWarnings = await this.validationService.getMobileFitWarnings(shellId);

      res.json(successResponse({
        validation,
        question_supply: supply,
        mobile_fit_warnings: mobileFitWarnings,
      }));
    } catch (error) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', (error as Error).message));
    }
  }

  async getShellQuestions(req: Request, res: Response): Promise<void> {
    try {
      const shellId = req.params.id as string;
      const links = await this.shellService.getShellQuestions(shellId);
      const questionIds = links.map(l => l.question_id);
      const questions = await this.questionService.getQuestionsWithAnswers(questionIds);

      const result = links.map(link => ({
        ...link,
        question: questions.find(q => q.id === link.question_id),
      }));

      res.json(successResponse(result));
    } catch (error) {
      res.status(400).json(errorResponse('SHELL_QUESTIONS_ERROR', (error as Error).message));
    }
  }

  async addShellQuestion(req: Request, res: Response): Promise<void> {
    try {
      const shellId = req.params.id as string;
      const { question_id, position } = req.body;
      const userId = req.headers['x-user-id'] as string;
      const link = await this.shellService.addQuestionToShell(
        shellId,
        question_id,
        position,
        userId
      );
      res.status(201).json(successResponse(link));
    } catch (error) {
      res.status(400).json(errorResponse('ADD_QUESTION_ERROR', (error as Error).message));
    }
  }

  async removeShellQuestion(req: Request, res: Response): Promise<void> {
    try {
      const shellId = req.params.id as string;
      const questionId = req.params.questionId as string;
      await this.shellService.removeQuestionFromShell(shellId, questionId);
      res.json(successResponse({ removed: true }));
    } catch (error) {
      res.status(400).json(errorResponse('REMOVE_QUESTION_ERROR', (error as Error).message));
    }
  }

  async reorderShellQuestions(req: Request, res: Response): Promise<void> {
    try {
      const shellId = req.params.id as string;
      const { question_ids } = req.body;
      await this.shellService.reorderShellQuestions(shellId, question_ids);
      res.json(successResponse({ reordered: true }));
    } catch (error) {
      res.status(400).json(errorResponse('REORDER_ERROR', (error as Error).message));
    }
  }

  async listQuestions(req: Request, res: Response): Promise<void> {
    try {
      const filters: QuestionListFilters = {
        topic: req.query.topic as string,
        difficulty_level: req.query.difficulty_level as 'easy' | 'medium' | 'hard',
        review_state: req.query.review_state as 'pending_review' | 'approved' | 'rejected',
        source_type: req.query.source_type as 'manual' | 'csv' | 'webhook',
        source_batch_id: req.query.source_batch_id as string,
        search: req.query.search as string,
        is_active: req.query.is_active === 'true' ? true : req.query.is_active === 'false' ? false : undefined,
      };

      if (req.query.tags) {
        filters.tags = (req.query.tags as string).split(',');
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await this.questionService.listQuestions(filters, limit, offset);
      res.json(successResponse(result));
    } catch (error) {
      res.status(500).json(errorResponse('QUESTION_LIST_ERROR', (error as Error).message));
    }
  }

  async getQuestion(req: Request, res: Response): Promise<void> {
    try {
      const questionId = req.params.id as string;
      const question = await this.questionService.getQuestion(questionId);
      res.json(successResponse(question));
    } catch (error) {
      res.status(404).json(errorResponse('QUESTION_NOT_FOUND', (error as Error).message));
    }
  }

  async createQuestion(req: Request, res: Response): Promise<void> {
    try {
      const question = await this.questionService.createQuestion({
        ...req.body,
        review_state: 'approved',
        source_type: 'manual',
      });
      res.status(201).json(successResponse(question));
    } catch (error) {
      res.status(400).json(errorResponse('QUESTION_CREATE_ERROR', (error as Error).message));
    }
  }

  async getTopics(_req: Request, res: Response): Promise<void> {
    try {
      const topics = await this.questionService.getTopics();
      res.json(successResponse(topics));
    } catch (error) {
      res.status(500).json(errorResponse('TOPICS_ERROR', (error as Error).message));
    }
  }

  async getTags(_req: Request, res: Response): Promise<void> {
    try {
      const tags = await this.questionService.getAllTags();
      res.json(successResponse(tags));
    } catch (error) {
      res.status(500).json(errorResponse('TAGS_ERROR', (error as Error).message));
    }
  }

  async updateQuestion(req: Request, res: Response): Promise<void> {
    try {
      const questionId = req.params.id as string;
      const question = await this.questionService.updateQuestion(questionId, req.body);
      res.json(successResponse(question));
    } catch (error) {
      res.status(400).json(errorResponse('QUESTION_UPDATE_ERROR', (error as Error).message));
    }
  }

  async deleteQuestion(req: Request, res: Response): Promise<void> {
    try {
      const questionId = req.params.id as string;
      const force = req.query.force === 'true';
      const result = await this.questionService.deleteQuestion(questionId, force);

      if (!result.deleted && result.blockedByShells) {
        res.status(409).json(errorResponse(
          'QUESTION_IN_USE',
          'Question is assigned to active quizzes',
          { shells: result.blockedByShells }
        ));
        return;
      }

      res.json(successResponse({ deleted: true }));
    } catch (error) {
      res.status(400).json(errorResponse('QUESTION_DELETE_ERROR', (error as Error).message));
    }
  }

  async getQuestionUsage(req: Request, res: Response): Promise<void> {
    try {
      const questionId = req.params.id as string;
      const usage = await this.questionService.getQuestionUsage(questionId);
      res.json(successResponse(usage));
    } catch (error) {
      res.status(400).json(errorResponse('QUESTION_USAGE_ERROR', (error as Error).message));
    }
  }

  async bulkDeleteQuestions(req: Request, res: Response): Promise<void> {
    try {
      const { question_ids, force } = req.body;

      if (!question_ids || !Array.isArray(question_ids)) {
        res.status(400).json(errorResponse('INVALID_INPUT', 'question_ids must be an array'));
        return;
      }

      const result = await this.questionService.bulkDeleteQuestions(question_ids, force === true);
      res.json(successResponse(result));
    } catch (error) {
      res.status(400).json(errorResponse('BULK_DELETE_ERROR', (error as Error).message));
    }
  }

  async getReviewQueue(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const filters = {
        topic: req.query.topic as string,
        source_batch_id: req.query.source_batch_id as string,
        source_type: req.query.source_type as string,
      };

      const queue = await this.reviewService.getPendingReviewQueue(limit, offset, filters);
      const stats = await this.reviewService.getReviewQueueStats();

      res.json(successResponse({ queue, stats }));
    } catch (error) {
      res.status(500).json(errorResponse('REVIEW_QUEUE_ERROR', (error as Error).message));
    }
  }

  async approveQuestion(req: Request, res: Response): Promise<void> {
    try {
      const questionId = req.params.id as string;
      const reviewerId = req.headers['x-user-id'] as string;
      const { notes } = req.body;

      if (!reviewerId) {
        res.status(401).json(errorResponse('UNAUTHORIZED', 'User ID required'));
        return;
      }

      const question = await this.reviewService.approveQuestion(questionId, reviewerId, notes);
      res.json(successResponse(question));
    } catch (error) {
      res.status(400).json(errorResponse('APPROVE_ERROR', (error as Error).message));
    }
  }

  async rejectQuestion(req: Request, res: Response): Promise<void> {
    try {
      const questionId = req.params.id as string;
      const reviewerId = req.headers['x-user-id'] as string;
      const { notes } = req.body;

      if (!reviewerId) {
        res.status(401).json(errorResponse('UNAUTHORIZED', 'User ID required'));
        return;
      }

      const question = await this.reviewService.rejectQuestion(questionId, reviewerId, notes);
      res.json(successResponse(question));
    } catch (error) {
      res.status(400).json(errorResponse('REJECT_ERROR', (error as Error).message));
    }
  }

  async bulkApprove(req: Request, res: Response): Promise<void> {
    try {
      const reviewerId = req.headers['x-user-id'] as string;
      const { question_ids, notes } = req.body;

      if (!reviewerId) {
        res.status(401).json(errorResponse('UNAUTHORIZED', 'User ID required'));
        return;
      }

      const result = await this.reviewService.bulkApprove(question_ids, reviewerId, notes);
      res.json(successResponse(result));
    } catch (error) {
      res.status(400).json(errorResponse('BULK_APPROVE_ERROR', (error as Error).message));
    }
  }

  async bulkReject(req: Request, res: Response): Promise<void> {
    try {
      const reviewerId = req.headers['x-user-id'] as string;
      const { question_ids, notes } = req.body;

      if (!reviewerId) {
        res.status(401).json(errorResponse('UNAUTHORIZED', 'User ID required'));
        return;
      }

      const result = await this.reviewService.bulkReject(question_ids, reviewerId, notes);
      res.json(successResponse(result));
    } catch (error) {
      res.status(400).json(errorResponse('BULK_REJECT_ERROR', (error as Error).message));
    }
  }

  async getReviewHistory(req: Request, res: Response): Promise<void> {
    try {
      const questionId = req.params.id as string;
      const history = await this.reviewService.getReviewHistory(questionId);
      res.json(successResponse(history));
    } catch (error) {
      res.status(400).json(errorResponse('REVIEW_HISTORY_ERROR', (error as Error).message));
    }
  }

  async importCSV(req: Request, res: Response): Promise<void> {
    try {
      const { csv_content, filename, shell_slug } = req.body;
      const userId = req.headers['x-user-id'] as string;

      if (!csv_content) {
        res.status(400).json(errorResponse('MISSING_CSV', 'CSV content is required'));
        return;
      }

      const result = await this.csvImportService.importFromCSV(
        csv_content,
        filename || 'upload.csv',
        shell_slug,
        userId
      );

      res.status(201).json(successResponse(result));
    } catch (error) {
      res.status(400).json(errorResponse('CSV_IMPORT_ERROR', (error as Error).message));
    }
  }

  async listImportBatches(req: Request, res: Response): Promise<void> {
    try {
      const sourceType = req.query.source_type as 'csv' | 'webhook' | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const batches = await this.importRepo.listBatches(sourceType, limit, offset);
      res.json(successResponse(batches));
    } catch (error) {
      res.status(500).json(errorResponse('IMPORT_LIST_ERROR', (error as Error).message));
    }
  }

  async getImportBatch(req: Request, res: Response): Promise<void> {
    try {
      const batchId = req.params.id as string;
      const batch = await this.importRepo.getBatch(batchId);
      if (!batch) {
        res.status(404).json(errorResponse('BATCH_NOT_FOUND', 'Import batch not found'));
        return;
      }

      const questions = await this.reviewService.getQuestionsByBatch(batchId);
      res.json(successResponse({ batch, questions }));
    } catch (error) {
      res.status(400).json(errorResponse('IMPORT_BATCH_ERROR', (error as Error).message));
    }
  }

  async ingestWebhook(req: Request, res: Response): Promise<void> {
    try {
      const payload: WebhookImportPayload = req.body;
      const result = await this.webhookService.ingestWebhook(payload);
      res.status(201).json(successResponse(result));
    } catch (error) {
      res.status(400).json(errorResponse('WEBHOOK_ERROR', (error as Error).message));
    }
  }

  async listWebhookLogs(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const logs = await this.importRepo.listWebhookLogs(limit, offset);
      res.json(successResponse(logs));
    } catch (error) {
      res.status(500).json(errorResponse('WEBHOOK_LOGS_ERROR', (error as Error).message));
    }
  }
}
