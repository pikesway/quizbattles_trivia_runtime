import { supabase } from '../../lib/supabase';
import {
  CampaignQuestionSet,
  ResolvedShellConfig,
  DifficultyMix,
} from '../../types/authoring';

export interface CreateCampaignQuestionSetInput {
  campaign_game_instance_id: string;
  shell_id: string;
  resolved_config: ResolvedShellConfig;
  question_ids: string[];
  difficulty_distribution: DifficultyMix;
}

export class CampaignQuestionSetRepository {
  async create(input: CreateCampaignQuestionSetInput): Promise<CampaignQuestionSet> {
    const { data, error } = await supabase
      .from('trivia_campaign_question_sets')
      .insert({
        campaign_game_instance_id: input.campaign_game_instance_id,
        shell_id: input.shell_id,
        resolved_config: input.resolved_config,
        question_ids: input.question_ids,
        difficulty_distribution: input.difficulty_distribution,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create campaign question set: ${error.message}`);
    return data;
  }

  async getByCampaignGameInstanceId(
    campaignGameInstanceId: string
  ): Promise<CampaignQuestionSet | null> {
    const { data, error } = await supabase
      .from('trivia_campaign_question_sets')
      .select('*')
      .eq('campaign_game_instance_id', campaignGameInstanceId)
      .maybeSingle();

    if (error) throw new Error(`Failed to fetch campaign question set: ${error.message}`);
    return data;
  }

  async getByShellId(shellId: string): Promise<CampaignQuestionSet[]> {
    const { data, error } = await supabase
      .from('trivia_campaign_question_sets')
      .select('*')
      .eq('shell_id', shellId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch campaign question sets: ${error.message}`);
    return data || [];
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('trivia_campaign_question_sets')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete campaign question set: ${error.message}`);
  }

  async deleteByCampaignGameInstanceId(campaignGameInstanceId: string): Promise<void> {
    const { error } = await supabase
      .from('trivia_campaign_question_sets')
      .delete()
      .eq('campaign_game_instance_id', campaignGameInstanceId);

    if (error) throw new Error(`Failed to delete campaign question set: ${error.message}`);
  }
}
