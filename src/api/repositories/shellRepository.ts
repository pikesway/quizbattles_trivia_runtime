import { supabase } from '../../lib/supabase';
import {
  TriviaShell,
  ShellQuestionLink,
  CreateShellInput,
  UpdateShellInput,
  ShellListFilters,
  ShellStatus,
} from '../../types/authoring';

export class ShellRepository {
  async create(input: CreateShellInput, userId?: string): Promise<TriviaShell> {
    const { data, error } = await supabase
      .from('trivia_shells')
      .insert({
        internal_name: input.internal_name,
        slug: input.slug,
        topic: input.topic || '',
        tags: input.tags || [],
        visibility: input.visibility || 'internal_only',
        created_by: userId || null,
        updated_by: userId || null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create shell: ${error.message}`);
    return data;
  }

  async getById(id: string): Promise<TriviaShell | null> {
    const { data, error } = await supabase
      .from('trivia_shells')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`Failed to fetch shell: ${error.message}`);
    return data;
  }

  async getBySlug(slug: string): Promise<TriviaShell | null> {
    const { data, error } = await supabase
      .from('trivia_shells')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (error) throw new Error(`Failed to fetch shell by slug: ${error.message}`);
    return data;
  }

  async list(filters: ShellListFilters = {}): Promise<TriviaShell[]> {
    let query = supabase.from('trivia_shells').select('*');

    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.visibility) {
      query = query.eq('visibility', filters.visibility);
    }
    if (filters.topic) {
      query = query.eq('topic', filters.topic);
    }
    if (filters.tags && filters.tags.length > 0) {
      query = query.overlaps('tags', filters.tags);
    }
    if (filters.search) {
      query = query.or(`internal_name.ilike.%${filters.search}%,slug.ilike.%${filters.search}%`);
    }

    query = query.order('updated_at', { ascending: false });

    const { data, error } = await query;

    if (error) throw new Error(`Failed to list shells: ${error.message}`);
    return data || [];
  }

  async update(id: string, input: UpdateShellInput, userId?: string): Promise<TriviaShell> {
    const updateData: Record<string, unknown> = {
      ...input,
      updated_at: new Date().toISOString(),
      updated_by: userId || null,
    };

    const { data, error } = await supabase
      .from('trivia_shells')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update shell: ${error.message}`);
    return data;
  }

  async updateStatus(id: string, status: ShellStatus, userId?: string): Promise<TriviaShell> {
    const { data, error } = await supabase
      .from('trivia_shells')
      .update({
        status,
        updated_at: new Date().toISOString(),
        updated_by: userId || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update shell status: ${error.message}`);
    return data;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('trivia_shells')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete shell: ${error.message}`);
  }

  async slugExists(slug: string, excludeId?: string): Promise<boolean> {
    let query = supabase
      .from('trivia_shells')
      .select('id')
      .eq('slug', slug);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) throw new Error(`Failed to check slug: ${error.message}`);
    return data !== null;
  }

  async getQuestionLinks(shellId: string): Promise<ShellQuestionLink[]> {
    const { data, error } = await supabase
      .from('trivia_shell_question_links')
      .select('*')
      .eq('shell_id', shellId)
      .order('position', { ascending: true });

    if (error) throw new Error(`Failed to fetch question links: ${error.message}`);
    return data || [];
  }

  async addQuestionLink(
    shellId: string,
    questionId: string,
    position: number,
    userId?: string
  ): Promise<ShellQuestionLink> {
    const { data, error } = await supabase
      .from('trivia_shell_question_links')
      .insert({
        shell_id: shellId,
        question_id: questionId,
        position,
        created_by: userId || null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to add question link: ${error.message}`);
    return data;
  }

  async removeQuestionLink(shellId: string, questionId: string): Promise<void> {
    const { error } = await supabase
      .from('trivia_shell_question_links')
      .delete()
      .eq('shell_id', shellId)
      .eq('question_id', questionId);

    if (error) throw new Error(`Failed to remove question link: ${error.message}`);
  }

  async updateQuestionLinkPosition(
    shellId: string,
    questionId: string,
    newPosition: number
  ): Promise<void> {
    const { error } = await supabase
      .from('trivia_shell_question_links')
      .update({ position: newPosition })
      .eq('shell_id', shellId)
      .eq('question_id', questionId);

    if (error) throw new Error(`Failed to update question link position: ${error.message}`);
  }

  async reorderQuestionLinks(
    shellId: string,
    orderedQuestionIds: string[]
  ): Promise<void> {
    for (let i = 0; i < orderedQuestionIds.length; i++) {
      const { error } = await supabase
        .from('trivia_shell_question_links')
        .update({ position: i + 1 })
        .eq('shell_id', shellId)
        .eq('question_id', orderedQuestionIds[i]);

      if (error) throw new Error(`Failed to reorder question links: ${error.message}`);
    }
  }

  async getQuestionLinkCount(shellId: string): Promise<number> {
    const { count, error } = await supabase
      .from('trivia_shell_question_links')
      .select('*', { count: 'exact', head: true })
      .eq('shell_id', shellId);

    if (error) throw new Error(`Failed to count question links: ${error.message}`);
    return count || 0;
  }

  async getActiveShellsForVisibility(
    visibility: string[]
  ): Promise<TriviaShell[]> {
    const { data, error } = await supabase
      .from('trivia_shells')
      .select('*')
      .eq('status', 'active')
      .in('visibility', visibility);

    if (error) throw new Error(`Failed to fetch active shells: ${error.message}`);
    return data || [];
  }
}
