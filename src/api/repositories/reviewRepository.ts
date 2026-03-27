import { supabase } from '../../lib/supabase';
import { QuestionReview, ReviewAction } from '../../types/authoring';

export class ReviewRepository {
  async createReview(
    questionId: string,
    reviewerId: string,
    action: ReviewAction,
    previousState: string,
    notes?: string
  ): Promise<QuestionReview> {
    const { data, error } = await supabase
      .from('trivia_question_reviews')
      .insert({
        question_id: questionId,
        reviewer_id: reviewerId,
        action,
        previous_state: previousState,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create review: ${error.message}`);
    return data;
  }

  async getReviewsForQuestion(questionId: string): Promise<QuestionReview[]> {
    const { data, error } = await supabase
      .from('trivia_question_reviews')
      .select('*')
      .eq('question_id', questionId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch reviews: ${error.message}`);
    return data || [];
  }

  async getReviewsByReviewer(
    reviewerId: string,
    limit = 50,
    offset = 0
  ): Promise<QuestionReview[]> {
    const { data, error } = await supabase
      .from('trivia_question_reviews')
      .select('*')
      .eq('reviewer_id', reviewerId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to fetch reviews: ${error.message}`);
    return data || [];
  }

  async getRecentReviews(limit = 50): Promise<QuestionReview[]> {
    const { data, error } = await supabase
      .from('trivia_question_reviews')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to fetch recent reviews: ${error.message}`);
    return data || [];
  }

  async countReviewsByAction(
    startDate?: Date,
    endDate?: Date
  ): Promise<Record<ReviewAction, number>> {
    let query = supabase
      .from('trivia_question_reviews')
      .select('action');

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }
    if (endDate) {
      query = query.lte('created_at', endDate.toISOString());
    }

    const { data, error } = await query;

    if (error) throw new Error(`Failed to count reviews: ${error.message}`);

    const counts: Record<ReviewAction, number> = {
      approved: 0,
      rejected: 0,
    };

    (data || []).forEach(item => {
      if (item.action === 'approved') counts.approved++;
      else if (item.action === 'rejected') counts.rejected++;
    });

    return counts;
  }
}
