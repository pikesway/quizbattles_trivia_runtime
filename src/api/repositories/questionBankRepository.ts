import { supabase } from '../../lib/supabase';
import {
  AuthoredQuestion,
  QuestionListFilters,
  DifficultyLevel,
  ReviewState,
  SourceType,
} from '../../types/authoring';
import { TriviaAnswer } from '../../types/trivia';

export interface QuestionWithAnswers extends AuthoredQuestion {
  answers: TriviaAnswer[];
}

export interface CreateQuestionInput {
  question_text: string;
  explanation: string;
  topic: string;
  tags: string[];
  difficulty_level: DifficultyLevel;
  review_state?: ReviewState;
  source_type?: SourceType;
  source_batch_id?: string;
  external_question_id?: string;
  import_metadata?: Record<string, unknown>;
  is_active?: boolean;
}

export interface CreateAnswerInput {
  question_id: string;
  answer_text: string;
  is_correct: boolean;
  display_order: number;
}

export class QuestionBankRepository {
  async createQuestion(input: CreateQuestionInput): Promise<AuthoredQuestion> {
    const difficultyNumeric = this.difficultyToNumeric(input.difficulty_level);

    const { data, error } = await supabase
      .from('trivia_questions')
      .insert({
        question_text: input.question_text,
        explanation: input.explanation,
        topic: input.topic,
        tags: input.tags,
        difficulty: difficultyNumeric,
        difficulty_level: input.difficulty_level,
        review_state: input.review_state || 'pending_review',
        source_type: input.source_type || 'manual',
        source_batch_id: input.source_batch_id || null,
        external_question_id: input.external_question_id || null,
        import_metadata: input.import_metadata || {},
        is_active: input.is_active ?? true,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create question: ${error.message}`);
    return data;
  }

  async createAnswers(answers: CreateAnswerInput[]): Promise<TriviaAnswer[]> {
    const { data, error } = await supabase
      .from('trivia_answers')
      .insert(answers)
      .select();

    if (error) throw new Error(`Failed to create answers: ${error.message}`);
    return data || [];
  }

  async getQuestionById(id: string): Promise<AuthoredQuestion | null> {
    const { data, error } = await supabase
      .from('trivia_questions')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`Failed to fetch question: ${error.message}`);
    return data;
  }

  async getQuestionWithAnswers(id: string): Promise<QuestionWithAnswers | null> {
    const question = await this.getQuestionById(id);
    if (!question) return null;

    const { data: answers, error } = await supabase
      .from('trivia_answers')
      .select('*')
      .eq('question_id', id)
      .order('display_order', { ascending: true });

    if (error) throw new Error(`Failed to fetch answers: ${error.message}`);

    return {
      ...question,
      answers: answers || [],
    };
  }

  async listQuestions(
    filters: QuestionListFilters = {},
    limit = 50,
    offset = 0
  ): Promise<AuthoredQuestion[]> {
    let query = supabase.from('trivia_questions').select('*');

    if (filters.topic) {
      query = query.eq('topic', filters.topic);
    }
    if (filters.tags && filters.tags.length > 0) {
      query = query.overlaps('tags', filters.tags);
    }
    if (filters.difficulty_level) {
      query = query.eq('difficulty_level', filters.difficulty_level);
    }
    if (filters.review_state) {
      query = query.eq('review_state', filters.review_state);
    }
    if (filters.source_type) {
      query = query.eq('source_type', filters.source_type);
    }
    if (filters.source_batch_id) {
      query = query.eq('source_batch_id', filters.source_batch_id);
    }
    if (filters.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }
    if (filters.search) {
      query = query.ilike('question_text', `%${filters.search}%`);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) throw new Error(`Failed to list questions: ${error.message}`);
    return data || [];
  }

  async countQuestions(filters: QuestionListFilters = {}): Promise<number> {
    let query = supabase
      .from('trivia_questions')
      .select('*', { count: 'exact', head: true });

    if (filters.topic) {
      query = query.eq('topic', filters.topic);
    }
    if (filters.tags && filters.tags.length > 0) {
      query = query.overlaps('tags', filters.tags);
    }
    if (filters.difficulty_level) {
      query = query.eq('difficulty_level', filters.difficulty_level);
    }
    if (filters.review_state) {
      query = query.eq('review_state', filters.review_state);
    }
    if (filters.source_type) {
      query = query.eq('source_type', filters.source_type);
    }
    if (filters.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    const { count, error } = await query;

    if (error) throw new Error(`Failed to count questions: ${error.message}`);
    return count || 0;
  }

  async updateReviewState(
    id: string,
    newState: ReviewState
  ): Promise<AuthoredQuestion> {
    const { data, error } = await supabase
      .from('trivia_questions')
      .update({ review_state: newState })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update review state: ${error.message}`);
    return data;
  }

  async updateQuestion(
    id: string,
    updates: Partial<CreateQuestionInput>
  ): Promise<AuthoredQuestion> {
    const updateData: Record<string, unknown> = { ...updates };

    if (updates.difficulty_level) {
      updateData.difficulty = this.difficultyToNumeric(updates.difficulty_level);
    }

    const { data, error } = await supabase
      .from('trivia_questions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update question: ${error.message}`);
    return data;
  }

  async deleteQuestion(id: string): Promise<void> {
    const { error } = await supabase
      .from('trivia_questions')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete question: ${error.message}`);
  }

  async getApprovedQuestionsByTopicAndTags(
    topic: string,
    tags: string[],
    limit: number
  ): Promise<AuthoredQuestion[]> {
    let query = supabase
      .from('trivia_questions')
      .select('*')
      .eq('is_active', true)
      .eq('review_state', 'approved');

    if (topic) {
      query = query.eq('topic', topic);
    }
    if (tags && tags.length > 0) {
      query = query.overlaps('tags', tags);
    }

    query = query.limit(limit);

    const { data, error } = await query;

    if (error) throw new Error(`Failed to fetch approved questions: ${error.message}`);
    return data || [];
  }

  async getApprovedCountByDifficulty(
    topic?: string,
    tags?: string[]
  ): Promise<Record<DifficultyLevel, number>> {
    const counts: Record<DifficultyLevel, number> = {
      easy: 0,
      medium: 0,
      hard: 0,
    };

    for (const level of ['easy', 'medium', 'hard'] as DifficultyLevel[]) {
      let query = supabase
        .from('trivia_questions')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)
        .eq('review_state', 'approved')
        .eq('difficulty_level', level);

      if (topic) {
        query = query.eq('topic', topic);
      }
      if (tags && tags.length > 0) {
        query = query.overlaps('tags', tags);
      }

      const { count, error } = await query;
      if (error) throw new Error(`Failed to count ${level} questions: ${error.message}`);
      counts[level] = count || 0;
    }

    return counts;
  }

  async findExactDuplicate(questionText: string, topic: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('trivia_questions')
      .select('id')
      .eq('question_text', questionText)
      .eq('topic', topic)
      .maybeSingle();

    if (error) throw new Error(`Failed to check duplicates: ${error.message}`);
    return data?.id || null;
  }

  async getAnswersForQuestions(questionIds: string[]): Promise<Map<string, TriviaAnswer[]>> {
    const { data, error } = await supabase
      .from('trivia_answers')
      .select('*')
      .in('question_id', questionIds)
      .order('display_order', { ascending: true });

    if (error) throw new Error(`Failed to fetch answers: ${error.message}`);

    const answerMap = new Map<string, TriviaAnswer[]>();
    (data || []).forEach(answer => {
      const existing = answerMap.get(answer.question_id) || [];
      answerMap.set(answer.question_id, [...existing, answer]);
    });

    return answerMap;
  }

  async getTopics(): Promise<string[]> {
    const { data, error } = await supabase
      .from('trivia_questions')
      .select('topic')
      .not('topic', 'eq', '');

    if (error) throw new Error(`Failed to fetch topics: ${error.message}`);

    const topics = [...new Set((data || []).map(d => d.topic))];
    return topics.sort();
  }

  async getAllTags(): Promise<string[]> {
    const { data, error } = await supabase
      .from('trivia_questions')
      .select('tags');

    if (error) throw new Error(`Failed to fetch tags: ${error.message}`);

    const allTags = (data || []).flatMap(d => d.tags || []);
    const uniqueTags = [...new Set(allTags)];
    return uniqueTags.sort();
  }

  private difficultyToNumeric(level: DifficultyLevel): number {
    switch (level) {
      case 'easy': return 1;
      case 'medium': return 3;
      case 'hard': return 5;
      default: return 3;
    }
  }
}
