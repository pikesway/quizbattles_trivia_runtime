import { supabase } from '../../lib/supabase';
import { TriviaGameSession, TriviaSessionAnswer, SessionStatus } from '../../types/trivia';

export class SessionRepository {
  async createSession(session: Partial<TriviaGameSession>): Promise<TriviaGameSession> {
    const { data, error } = await supabase
      .from('trivia_game_sessions')
      .insert(session)
      .select()
      .single();

    if (error) throw new Error(`Failed to create session: ${error.message}`);
    return data;
  }

  async getSession(sessionId: string): Promise<TriviaGameSession | null> {
    const { data, error } = await supabase
      .from('trivia_game_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();

    if (error) throw new Error(`Failed to fetch session: ${error.message}`);
    return data;
  }

  async updateSession(sessionId: string, updates: Partial<TriviaGameSession>): Promise<TriviaGameSession> {
    const { data, error } = await supabase
      .from('trivia_game_sessions')
      .update(updates)
      .eq('id', sessionId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update session: ${error.message}`);
    return data;
  }

  async updateSessionStatus(sessionId: string, status: SessionStatus): Promise<void> {
    const updates: Partial<TriviaGameSession> = { status };
    if (status === 'completed') {
      updates.completed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('trivia_game_sessions')
      .update(updates)
      .eq('id', sessionId);

    if (error) throw new Error(`Failed to update session status: ${error.message}`);
  }

  async incrementSessionIndex(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Session not found');

    await this.updateSession(sessionId, {
      current_index: session.current_index + 1,
    });
  }

  async updateScore(sessionId: string, score: number, correctAnswers: number): Promise<void> {
    await this.updateSession(sessionId, {
      score,
      correct_answers: correctAnswers,
    });
  }

  async recordAnswer(answer: Omit<TriviaSessionAnswer, 'id' | 'answered_at'>): Promise<TriviaSessionAnswer> {
    const { data, error } = await supabase
      .from('trivia_session_answers')
      .insert(answer)
      .select()
      .single();

    if (error) throw new Error(`Failed to record answer: ${error.message}`);
    return data;
  }

  async getSessionAnswers(sessionId: string): Promise<TriviaSessionAnswer[]> {
    const { data, error } = await supabase
      .from('trivia_session_answers')
      .select('*')
      .eq('session_id', sessionId);

    if (error) throw new Error(`Failed to fetch session answers: ${error.message}`);
    return data || [];
  }

  async hasAnsweredQuestion(sessionId: string, questionId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('trivia_session_answers')
      .select('id')
      .eq('session_id', sessionId)
      .eq('question_id', questionId)
      .maybeSingle();

    if (error) throw new Error(`Failed to check answered question: ${error.message}`);
    return data !== null;
  }

  async attachLeadToSession(sessionId: string, leadId: string): Promise<void> {
    await this.updateSession(sessionId, { lead_id: leadId });
  }
}
