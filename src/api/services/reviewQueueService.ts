import { QuestionBankRepository, QuestionWithAnswers } from '../repositories/questionBankRepository';
import { ReviewRepository } from '../repositories/reviewRepository';
import { QuestionBankService } from './questionBankService';
import {
  AuthoredQuestion,
  QuestionReview,
  MobileFitWarning,
  DuplicateWarning,
} from '../../types/authoring';

export interface ReviewQueueItem {
  question: QuestionWithAnswers;
  mobile_fit_warning: MobileFitWarning | null;
  duplicate_warning: DuplicateWarning | null;
  import_batch_id: string | null;
  source_type: string;
}

export interface ReviewQueueStats {
  pending_count: number;
  approved_today: number;
  rejected_today: number;
}

export class ReviewQueueService {
  private questionRepo: QuestionBankRepository;
  private reviewRepo: ReviewRepository;
  private questionBankService: QuestionBankService;

  constructor() {
    this.questionRepo = new QuestionBankRepository();
    this.reviewRepo = new ReviewRepository();
    this.questionBankService = new QuestionBankService();
  }

  async getPendingReviewQueue(
    limit = 50,
    offset = 0,
    filters?: {
      topic?: string;
      source_batch_id?: string;
      source_type?: string;
    }
  ): Promise<ReviewQueueItem[]> {
    const questions = await this.questionRepo.listQuestions(
      {
        review_state: 'pending_review',
        topic: filters?.topic,
        source_batch_id: filters?.source_batch_id,
        source_type: filters?.source_type as 'manual' | 'csv' | 'webhook',
      },
      limit,
      offset
    );

    const queueItems: ReviewQueueItem[] = [];

    for (const question of questions) {
      const questionWithAnswers = await this.questionRepo.getQuestionWithAnswers(question.id);
      if (!questionWithAnswers) continue;

      const mobileFitWarning = await this.questionBankService.checkMobileFit(questionWithAnswers);
      const duplicateWarning = await this.questionBankService.checkDuplicate(
        question.question_text,
        question.topic
      );

      queueItems.push({
        question: questionWithAnswers,
        mobile_fit_warning: mobileFitWarning,
        duplicate_warning: duplicateWarning,
        import_batch_id: question.source_batch_id,
        source_type: question.source_type,
      });
    }

    return queueItems;
  }

  async getReviewQueueStats(): Promise<ReviewQueueStats> {
    const pendingCount = await this.questionRepo.countQuestions({
      review_state: 'pending_review',
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const counts = await this.reviewRepo.countReviewsByAction(today);

    return {
      pending_count: pendingCount,
      approved_today: counts.approved,
      rejected_today: counts.rejected,
    };
  }

  async approveQuestion(
    questionId: string,
    reviewerId: string,
    notes?: string
  ): Promise<AuthoredQuestion> {
    return this.questionBankService.approveQuestion(questionId, reviewerId, notes);
  }

  async rejectQuestion(
    questionId: string,
    reviewerId: string,
    notes?: string
  ): Promise<AuthoredQuestion> {
    return this.questionBankService.rejectQuestion(questionId, reviewerId, notes);
  }

  async getReviewHistory(questionId: string): Promise<QuestionReview[]> {
    return this.reviewRepo.getReviewsForQuestion(questionId);
  }

  async bulkApprove(
    questionIds: string[],
    reviewerId: string,
    notes?: string
  ): Promise<{ approved: number; failed: string[] }> {
    return this.questionBankService.bulkApprove(questionIds, reviewerId, notes);
  }

  async bulkReject(
    questionIds: string[],
    reviewerId: string,
    notes?: string
  ): Promise<{ rejected: number; failed: string[] }> {
    return this.questionBankService.bulkReject(questionIds, reviewerId, notes);
  }

  async getQuestionsByBatch(batchId: string): Promise<ReviewQueueItem[]> {
    const questions = await this.questionRepo.listQuestions(
      { source_batch_id: batchId },
      1000,
      0
    );

    const queueItems: ReviewQueueItem[] = [];

    for (const question of questions) {
      const questionWithAnswers = await this.questionRepo.getQuestionWithAnswers(question.id);
      if (!questionWithAnswers) continue;

      const mobileFitWarning = await this.questionBankService.checkMobileFit(questionWithAnswers);
      const duplicateWarning = question.review_state === 'pending_review'
        ? await this.questionBankService.checkDuplicate(question.question_text, question.topic)
        : null;

      queueItems.push({
        question: questionWithAnswers,
        mobile_fit_warning: mobileFitWarning,
        duplicate_warning: duplicateWarning,
        import_batch_id: question.source_batch_id,
        source_type: question.source_type,
      });
    }

    return queueItems;
  }

  async getRecentReviewActivity(limit = 20): Promise<QuestionReview[]> {
    return this.reviewRepo.getRecentReviews(limit);
  }
}
