import {
  QuestionBankRepository,
  QuestionWithAnswers,
  CreateAnswerInput,
} from '../repositories/questionBankRepository';
import {
  AuthoredQuestion,
  QuestionListFilters,
  DifficultyLevel,
  ReviewState,
  MobileFitWarning,
  DuplicateWarning,
  MOBILE_FIT_THRESHOLDS,
} from '../../types/authoring';

export interface CreateQuestionWithAnswersInput {
  question_text: string;
  explanation: string;
  topic: string;
  tags: string[];
  difficulty_level: DifficultyLevel;
  answers: Array<{
    text: string;
    is_correct: boolean;
  }>;
  review_state?: ReviewState;
  source_type?: 'manual' | 'csv' | 'webhook';
  source_batch_id?: string;
  external_question_id?: string;
  import_metadata?: Record<string, unknown>;
}

export class QuestionBankService {
  private questionRepo: QuestionBankRepository;

  constructor() {
    this.questionRepo = new QuestionBankRepository();
  }

  async createQuestion(
    input: CreateQuestionWithAnswersInput
  ): Promise<QuestionWithAnswers> {
    this.validateAnswers(input.answers);

    const question = await this.questionRepo.createQuestion({
      question_text: input.question_text,
      explanation: input.explanation,
      topic: input.topic,
      tags: input.tags,
      difficulty_level: input.difficulty_level,
      review_state: input.review_state || 'pending_review',
      source_type: input.source_type || 'manual',
      source_batch_id: input.source_batch_id,
      external_question_id: input.external_question_id,
      import_metadata: input.import_metadata,
    });

    const answerInputs: CreateAnswerInput[] = input.answers.map((a, index) => ({
      question_id: question.id,
      answer_text: a.text,
      is_correct: a.is_correct,
      display_order: index + 1,
    }));

    const answers = await this.questionRepo.createAnswers(answerInputs);

    return { ...question, answers };
  }

  async getQuestion(id: string): Promise<QuestionWithAnswers> {
    const question = await this.questionRepo.getQuestionWithAnswers(id);
    if (!question) {
      throw new Error('Question not found');
    }
    return question;
  }

  async listQuestions(
    filters: QuestionListFilters = {},
    limit = 50,
    offset = 0
  ): Promise<{ questions: AuthoredQuestion[]; total: number }> {
    const [questions, total] = await Promise.all([
      this.questionRepo.listQuestions(filters, limit, offset),
      this.questionRepo.countQuestions(filters),
    ]);

    return { questions, total };
  }

  async updateReviewState(
    id: string,
    newState: ReviewState,
    reviewerId: string,
    notes?: string
  ): Promise<AuthoredQuestion> {
    const question = await this.questionRepo.getQuestionById(id);
    if (!question) {
      throw new Error('Question not found');
    }

    if (question.review_state === newState) {
      throw new Error(`Question is already in ${newState} state`);
    }

    const { supabase } = await import('../../lib/supabase');
    await supabase.from('trivia_question_reviews').insert({
      question_id: id,
      reviewer_id: reviewerId,
      action: newState === 'approved' ? 'approved' : 'rejected',
      previous_state: question.review_state,
      notes: notes || null,
    });

    return this.questionRepo.updateReviewState(id, newState);
  }

  async approveQuestion(id: string, reviewerId: string, notes?: string): Promise<AuthoredQuestion> {
    return this.updateReviewState(id, 'approved', reviewerId, notes);
  }

  async rejectQuestion(id: string, reviewerId: string, notes?: string): Promise<AuthoredQuestion> {
    return this.updateReviewState(id, 'rejected', reviewerId, notes);
  }

  async checkDuplicate(questionText: string, topic: string): Promise<DuplicateWarning | null> {
    const duplicateId = await this.questionRepo.findExactDuplicate(questionText, topic);
    if (duplicateId) {
      return {
        question_id: '',
        duplicate_of: duplicateId,
        match_type: 'exact_text_and_topic',
      };
    }
    return null;
  }

  async checkMobileFit(question: QuestionWithAnswers): Promise<MobileFitWarning | null> {
    const issues: MobileFitWarning['issues'] = [];

    if (question.question_text.length > MOBILE_FIT_THRESHOLDS.question_text_max) {
      issues.push({
        field: 'question_text',
        actual_length: question.question_text.length,
        max_length: MOBILE_FIT_THRESHOLDS.question_text_max,
      });
    }

    if (question.explanation.length > MOBILE_FIT_THRESHOLDS.explanation_max) {
      issues.push({
        field: 'explanation',
        actual_length: question.explanation.length,
        max_length: MOBILE_FIT_THRESHOLDS.explanation_max,
      });
    }

    question.answers.forEach((answer, index) => {
      if (answer.answer_text.length > MOBILE_FIT_THRESHOLDS.answer_text_max) {
        issues.push({
          field: 'answer_text',
          actual_length: answer.answer_text.length,
          max_length: MOBILE_FIT_THRESHOLDS.answer_text_max,
          answer_index: index,
        });
      }
    });

    if (issues.length === 0) return null;

    return {
      question_id: question.id,
      issues,
    };
  }

  async getQuestionSupplyByDifficulty(
    topic?: string,
    tags?: string[]
  ): Promise<Record<DifficultyLevel, number>> {
    return this.questionRepo.getApprovedCountByDifficulty(topic, tags);
  }

  async getTopics(): Promise<string[]> {
    return this.questionRepo.getTopics();
  }

  async getAllTags(): Promise<string[]> {
    return this.questionRepo.getAllTags();
  }

  async getQuestionsWithAnswers(questionIds: string[]): Promise<QuestionWithAnswers[]> {
    const questions: QuestionWithAnswers[] = [];
    const answersMap = await this.questionRepo.getAnswersForQuestions(questionIds);

    for (const id of questionIds) {
      const question = await this.questionRepo.getQuestionById(id);
      if (question) {
        questions.push({
          ...question,
          answers: answersMap.get(id) || [],
        });
      }
    }

    return questions;
  }

  async bulkApprove(
    questionIds: string[],
    reviewerId: string,
    notes?: string
  ): Promise<{ approved: number; failed: string[] }> {
    const results = { approved: 0, failed: [] as string[] };

    for (const id of questionIds) {
      try {
        await this.approveQuestion(id, reviewerId, notes);
        results.approved++;
      } catch {
        results.failed.push(id);
      }
    }

    return results;
  }

  async bulkReject(
    questionIds: string[],
    reviewerId: string,
    notes?: string
  ): Promise<{ rejected: number; failed: string[] }> {
    const results = { rejected: 0, failed: [] as string[] };

    for (const id of questionIds) {
      try {
        await this.rejectQuestion(id, reviewerId, notes);
        results.rejected++;
      } catch {
        results.failed.push(id);
      }
    }

    return results;
  }

  async updateQuestion(
    id: string,
    input: Partial<CreateQuestionWithAnswersInput>
  ): Promise<QuestionWithAnswers> {
    const existingQuestion = await this.questionRepo.getQuestionById(id);
    if (!existingQuestion) {
      throw new Error('Question not found');
    }

    if (input.answers) {
      this.validateAnswers(input.answers);
    }

    const questionUpdates: Record<string, unknown> = {};
    if (input.question_text !== undefined) questionUpdates.question_text = input.question_text;
    if (input.explanation !== undefined) questionUpdates.explanation = input.explanation;
    if (input.topic !== undefined) questionUpdates.topic = input.topic;
    if (input.tags !== undefined) questionUpdates.tags = input.tags;
    if (input.difficulty_level !== undefined) questionUpdates.difficulty_level = input.difficulty_level;

    if (Object.keys(questionUpdates).length > 0) {
      await this.questionRepo.updateQuestion(id, questionUpdates);
    }

    if (input.answers) {
      await this.questionRepo.deleteAnswersByQuestionId(id);
      const answerInputs: CreateAnswerInput[] = input.answers.map((a, index) => ({
        question_id: id,
        answer_text: a.text,
        is_correct: a.is_correct,
        display_order: index + 1,
      }));
      await this.questionRepo.createAnswers(answerInputs);
    }

    const updatedQuestion = await this.questionRepo.getQuestionWithAnswers(id);
    if (!updatedQuestion) {
      throw new Error('Failed to retrieve updated question');
    }
    return updatedQuestion;
  }

  async getQuestionUsage(questionId: string): Promise<{
    shells: Array<{ id: string; internal_name: string; status: string }>;
    hasActiveUsage: boolean;
  }> {
    return this.questionRepo.getQuestionUsage(questionId);
  }

  async deleteQuestion(
    id: string,
    force = false
  ): Promise<{
    deleted: boolean;
    blockedByShells?: Array<{ id: string; internal_name: string; status: string }>;
  }> {
    const question = await this.questionRepo.getQuestionById(id);
    if (!question) {
      throw new Error('Question not found');
    }

    const usage = await this.questionRepo.getQuestionUsage(id);

    if (usage.hasActiveUsage && !force) {
      return {
        deleted: false,
        blockedByShells: usage.shells.filter(s => s.status === 'active' || s.status === 'ready'),
      };
    }

    await this.questionRepo.deleteAnswersByQuestionId(id);
    await this.questionRepo.deleteQuestion(id);

    return { deleted: true };
  }

  async bulkDeleteQuestions(
    questionIds: string[],
    force = false
  ): Promise<{
    deleted: number;
    blocked: Array<{
      questionId: string;
      shells: Array<{ id: string; internal_name: string; status: string }>;
    }>;
    failed: string[];
  }> {
    const results = {
      deleted: 0,
      blocked: [] as Array<{
        questionId: string;
        shells: Array<{ id: string; internal_name: string; status: string }>;
      }>,
      failed: [] as string[],
    };

    for (const id of questionIds) {
      try {
        const result = await this.deleteQuestion(id, force);
        if (result.deleted) {
          results.deleted++;
        } else if (result.blockedByShells) {
          results.blocked.push({
            questionId: id,
            shells: result.blockedByShells,
          });
        }
      } catch {
        results.failed.push(id);
      }
    }

    return results;
  }

  private validateAnswers(answers: Array<{ text: string; is_correct: boolean }>): void {
    if (answers.length < 2) {
      throw new Error('At least 2 answers are required');
    }

    if (answers.length > 4) {
      throw new Error('Maximum 4 answers allowed');
    }

    const correctCount = answers.filter(a => a.is_correct).length;
    if (correctCount !== 1) {
      throw new Error('Exactly one answer must be marked as correct');
    }

    for (const answer of answers) {
      if (!answer.text || answer.text.trim().length === 0) {
        throw new Error('Answer text cannot be empty');
      }
    }
  }
}
