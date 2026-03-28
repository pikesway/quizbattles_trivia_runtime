import { supabase } from '../../lib/supabase';
import type { EndScreenCase, CreateEndScreenCaseInput, UpdateEndScreenCaseInput } from '../../types/authoring';

export interface EndScreenCaseRow {
  id: string;
  shell_id: string;
  min_percentage: number;
  max_percentage: number | null;
  message: string;
  enabled: boolean;
  sort_order: number;
  share_text_override: string | null;
  created_at: string;
  updated_at: string;
}

export async function getEndScreenCasesByShellId(shellId: string): Promise<EndScreenCase[]> {
  const { data, error } = await supabase
    .from('trivia_end_screen_cases')
    .select('*')
    .eq('shell_id', shellId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getEnabledEndScreenCasesByShellId(shellId: string): Promise<EndScreenCase[]> {
  const { data, error } = await supabase
    .from('trivia_end_screen_cases')
    .select('*')
    .eq('shell_id', shellId)
    .eq('enabled', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getEndScreenCaseById(id: string): Promise<EndScreenCase | null> {
  const { data, error } = await supabase
    .from('trivia_end_screen_cases')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createEndScreenCase(
  shellId: string,
  input: CreateEndScreenCaseInput
): Promise<EndScreenCase> {
  let sortOrder = input.sort_order;

  if (sortOrder === undefined) {
    const { data: maxOrder } = await supabase
      .from('trivia_end_screen_cases')
      .select('sort_order')
      .eq('shell_id', shellId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    sortOrder = (maxOrder?.sort_order ?? -1) + 1;
  }

  const { data, error } = await supabase
    .from('trivia_end_screen_cases')
    .insert({
      shell_id: shellId,
      min_percentage: input.min_percentage,
      max_percentage: input.max_percentage,
      message: input.message,
      enabled: input.enabled ?? true,
      sort_order: sortOrder,
      share_text_override: input.share_text_override ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateEndScreenCase(
  id: string,
  input: UpdateEndScreenCaseInput
): Promise<EndScreenCase> {
  const updateData: Partial<EndScreenCaseRow> = {};

  if (input.min_percentage !== undefined) updateData.min_percentage = input.min_percentage;
  if (input.max_percentage !== undefined) updateData.max_percentage = input.max_percentage;
  if (input.message !== undefined) updateData.message = input.message;
  if (input.enabled !== undefined) updateData.enabled = input.enabled;
  if (input.sort_order !== undefined) updateData.sort_order = input.sort_order;
  if (input.share_text_override !== undefined) updateData.share_text_override = input.share_text_override;

  const { data, error } = await supabase
    .from('trivia_end_screen_cases')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteEndScreenCase(id: string): Promise<void> {
  const { error } = await supabase
    .from('trivia_end_screen_cases')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function deleteAllEndScreenCases(shellId: string): Promise<void> {
  const { error } = await supabase
    .from('trivia_end_screen_cases')
    .delete()
    .eq('shell_id', shellId);

  if (error) throw error;
}

export async function reorderEndScreenCases(
  shellId: string,
  orderedIds: string[]
): Promise<EndScreenCase[]> {
  const updates = orderedIds.map((id, index) => ({
    id,
    shell_id: shellId,
    sort_order: index,
  }));

  for (const update of updates) {
    const { error } = await supabase
      .from('trivia_end_screen_cases')
      .update({ sort_order: update.sort_order })
      .eq('id', update.id)
      .eq('shell_id', shellId);

    if (error) throw error;
  }

  return getEndScreenCasesByShellId(shellId);
}

export async function bulkCreateEndScreenCases(
  shellId: string,
  cases: CreateEndScreenCaseInput[]
): Promise<EndScreenCase[]> {
  const { data: maxOrder } = await supabase
    .from('trivia_end_screen_cases')
    .select('sort_order')
    .eq('shell_id', shellId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const startOrder = (maxOrder?.sort_order ?? -1) + 1;

  const insertData = cases.map((c, index) => ({
    shell_id: shellId,
    min_percentage: c.min_percentage,
    max_percentage: c.max_percentage,
    message: c.message,
    enabled: c.enabled ?? true,
    sort_order: c.sort_order ?? (startOrder + index),
    share_text_override: c.share_text_override ?? null,
  }));

  const { data, error } = await supabase
    .from('trivia_end_screen_cases')
    .insert(insertData)
    .select();

  if (error) throw error;
  return data;
}
