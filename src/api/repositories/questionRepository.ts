import { supabase } from '../../lib/supabase';
import { TriviaQuestion, TriviaAnswer } from '../../types/trivia';

export class QuestionRepository {
  async getQuestionsByTopic(topic: string, limit: number): Promise<TriviaQuestion[]> {
    const { data, error } = await supabase
      .from('trivia_questions')
      .select('*')
      .eq('is_active', true)
      .eq('topic', topic)
      .limit(limit);

    if (error) throw new Error(`Failed to fetch questions: ${error.message}`);
    return data || [];
  }

  async getQuestionsByTags(tags: string[], limit: number): Promise<TriviaQuestion[]> {
    const { data, error } = await supabase
      .from('trivia_questions')
      .select('*')
      .eq('is_active', true)
      .overlaps('tags', tags)
      .limit(limit);

    if (error) throw new Error(`Failed to fetch questions: ${error.message}`);
    return data || [];
  }

  async getRandomQuestions(count: number): Promise<TriviaQuestion[]> {
    const { data, error } = await supabase
      .from('trivia_questions')
      .select('*')
      .eq('is_active', true)
      .limit(count * 2);

    if (error) throw new Error(`Failed to fetch questions: ${error.message}`);

    const questions = data || [];
    const shuffled = questions.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  async getFixedQuestions(count: number): Promise<TriviaQuestion[]> {
    const { data, error } = await supabase
      .from('trivia_questions')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(count);

    if (error) throw new Error(`Failed to fetch questions: ${error.message}`);
    return data || [];
  }

  async getAnswersForQuestion(questionId: string): Promise<TriviaAnswer[]> {
    const { data, error } = await supabase
      .from('trivia_answers')
      .select('*')
      .eq('question_id', questionId)
      .order('display_order', { ascending: true });

    if (error) throw new Error(`Failed to fetch answers: ${error.message}`);
    return data || [];
  }

  async getAnswersForQuestions(questionIds: string[]): Promise<Map<string, TriviaAnswer[]>> {
    const { data, error } = await supabase
      .from('trivia_answers')
      .select('*')
      .in('question_id', questionIds);

    if (error) throw new Error(`Failed to fetch answers: ${error.message}`);

    const answerMap = new Map<string, TriviaAnswer[]>();
    (data || []).forEach(answer => {
      const existing = answerMap.get(answer.question_id) || [];
      answerMap.set(answer.question_id, [...existing, answer]);
    });

    return answerMap;
  }
}
