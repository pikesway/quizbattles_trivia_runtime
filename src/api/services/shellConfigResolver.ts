import { ShellRepository } from '../repositories/shellRepository';
import { QuestionBankRepository } from '../repositories/questionBankRepository';
import { CampaignQuestionSetRepository } from '../repositories/campaignQuestionSetRepository';
import {
  TriviaShell,
  ResolvedShellConfig,
  DifficultyMix,
  DifficultyLevel,
  SelectionMode,
  CampaignQuestionSet,
  AuthoredQuestion,
} from '../../types/authoring';
import { QuestionSnapshot, GameInstanceConfig } from '../../types/trivia';

export interface PlatformOverrides {
  selection_mode?: SelectionMode;
  question_count?: number;
  difficulty_mix?: DifficultyMix;
  timer_mode?: 'per_question' | 'per_quiz';
  timer_seconds?: number;
}

export interface ResolvedQuestionSet {
  questions: QuestionSnapshot[];
  difficulty_distribution: DifficultyMix;
  deviation?: {
    requested: DifficultyMix;
    actual: DifficultyMix;
    notes: string[];
  };
}

export class ShellConfigResolver {
  private shellRepo: ShellRepository;
  private questionRepo: QuestionBankRepository;
  private campaignSetRepo: CampaignQuestionSetRepository;

  constructor() {
    this.shellRepo = new ShellRepository();
    this.questionRepo = new QuestionBankRepository();
    this.campaignSetRepo = new CampaignQuestionSetRepository();
  }

  async resolveConfig(
    shellIdOrSlug: string,
    platformOverrides?: PlatformOverrides
  ): Promise<ResolvedShellConfig> {
    const shell = await this.getShell(shellIdOrSlug);

    const resolved: ResolvedShellConfig = {
      shell_id: shell.id,
      shell_slug: shell.slug,
      selection_mode: platformOverrides?.selection_mode || shell.default_selection_mode,
      question_count: platformOverrides?.question_count || shell.default_question_count,
      difficulty_mix: platformOverrides?.difficulty_mix || shell.default_difficulty_mix,
      timer_mode: platformOverrides?.timer_mode || shell.default_timer_mode,
      timer_seconds: platformOverrides?.timer_seconds || shell.default_timer_seconds,
      is_start_screen_enabled: shell.is_start_screen_enabled,
      is_lead_screen_enabled: shell.is_lead_screen_enabled,
      theme: shell.config.theme,
      backgrounds: shell.config.backgrounds,
      screens: shell.config.screens,
      score_range_messages: shell.config.score_range_messages,
    };

    return resolved;
  }

  async resolveQuestionSet(
    shellIdOrSlug: string,
    campaignGameInstanceId: string,
    platformOverrides?: PlatformOverrides
  ): Promise<ResolvedQuestionSet> {
    const shell = await this.getShell(shellIdOrSlug);
    const config = await this.resolveConfig(shellIdOrSlug, platformOverrides);

    if (config.selection_mode === 'random_per_campaign') {
      const existingSet = await this.campaignSetRepo.getByCampaignGameInstanceId(campaignGameInstanceId);
      if (existingSet) {
        return this.loadExistingCampaignSet(existingSet);
      }
    }

    const questionSet = await this.buildQuestionSet(shell, config);

    if (config.selection_mode === 'random_per_campaign') {
      await this.campaignSetRepo.create({
        campaign_game_instance_id: campaignGameInstanceId,
        shell_id: shell.id,
        resolved_config: config,
        question_ids: questionSet.questions.map(q => q.question_id),
        difficulty_distribution: questionSet.difficulty_distribution,
      });
    }

    return questionSet;
  }

  async buildQuestionSet(
    shell: TriviaShell,
    config: ResolvedShellConfig
  ): Promise<ResolvedQuestionSet> {
    if (config.selection_mode === 'fixed') {
      return this.buildFixedQuestionSet(shell);
    }

    return this.buildRandomQuestionSet(shell, config);
  }

  toGameInstanceConfig(
    resolved: ResolvedShellConfig,
    platformLeadCapture?: { enabled: boolean; fields: Array<{ name: string; required: boolean; visible: boolean }> }
  ): GameInstanceConfig {
    const background = resolved.backgrounds.game || resolved.backgrounds.default || '';

    return {
      question_mode: resolved.selection_mode === 'fixed' ? 'fixed' : 'random',
      question_count: resolved.question_count,
      timer: {
        mode: resolved.timer_mode,
        seconds: resolved.timer_seconds,
      },
      scoring_mode: 'accuracy_only',
      end_screen_rules: resolved.score_range_messages.map(msg => ({
        min: msg.min,
        max: msg.max,
        text: msg.message,
      })),
      lead_capture: platformLeadCapture || {
        enabled: resolved.is_lead_screen_enabled,
        fields: [],
      },
      ui: {
        background_url: background,
      },
    };
  }

  private async getShell(shellIdOrSlug: string): Promise<TriviaShell> {
    let shell = await this.shellRepo.getById(shellIdOrSlug);
    if (!shell) {
      shell = await this.shellRepo.getBySlug(shellIdOrSlug);
    }
    if (!shell) {
      throw new Error(`Shell not found: ${shellIdOrSlug}`);
    }
    return shell;
  }

  private async buildFixedQuestionSet(shell: TriviaShell): Promise<ResolvedQuestionSet> {
    const links = await this.shellRepo.getQuestionLinks(shell.id);
    const sortedLinks = links.sort((a, b) => a.position - b.position);

    const questionIds = sortedLinks.map(l => l.question_id);
    const answersMap = await this.questionRepo.getAnswersForQuestions(questionIds);

    const questions: QuestionSnapshot[] = [];
    const difficultyCount: Record<DifficultyLevel, number> = { easy: 0, medium: 0, hard: 0 };

    for (const link of sortedLinks) {
      const question = await this.questionRepo.getQuestionById(link.question_id);
      if (!question || question.review_state !== 'approved') continue;

      const answers = answersMap.get(link.question_id) || [];
      if (answers.length === 0) continue;

      const correctCount = answers.filter(a => a.is_correct).length;
      if (correctCount !== 1) continue;

      questions.push({
        question_id: question.id,
        question_text: question.question_text,
        explanation: question.explanation,
        answers: answers.map(a => ({
          answer_id: a.id,
          answer_text: a.answer_text,
          is_correct: a.is_correct,
        })),
      });

      difficultyCount[question.difficulty_level as DifficultyLevel]++;
    }

    const total = questions.length || 1;
    const distribution: DifficultyMix = {
      easy: Math.round((difficultyCount.easy / total) * 100),
      medium: Math.round((difficultyCount.medium / total) * 100),
      hard: Math.round((difficultyCount.hard / total) * 100),
    };

    return { questions, difficulty_distribution: distribution };
  }

  private async buildRandomQuestionSet(
    shell: TriviaShell,
    config: ResolvedShellConfig
  ): Promise<ResolvedQuestionSet> {
    const neededCounts = this.calculateNeededByDifficulty(
      config.question_count,
      config.difficulty_mix
    );

    const selectedQuestions: AuthoredQuestion[] = [];
    const actualCounts: Record<DifficultyLevel, number> = { easy: 0, medium: 0, hard: 0 };
    const deviationNotes: string[] = [];

    for (const level of ['easy', 'medium', 'hard'] as DifficultyLevel[]) {
      const needed = neededCounts[level];
      if (needed === 0) continue;

      const questions = await this.getApprovedQuestionsByDifficulty(
        shell.topic,
        shell.tags,
        level,
        needed * 2
      );

      const shuffled = this.shuffleArray(questions);
      const selected = shuffled.slice(0, Math.min(needed, shuffled.length));

      selectedQuestions.push(...selected);
      actualCounts[level] = selected.length;

      if (selected.length < needed) {
        deviationNotes.push(
          `Needed ${needed} ${level} questions, only ${selected.length} available`
        );
      }
    }

    const totalSelected = selectedQuestions.length;
    const totalNeeded = config.question_count;

    if (totalSelected < totalNeeded) {
      const shortage = totalNeeded - totalSelected;
      const additionalQuestions = await this.fillShortage(
        shell.topic,
        shell.tags,
        shortage,
        selectedQuestions.map(q => q.id)
      );

      for (const q of additionalQuestions) {
        selectedQuestions.push(q);
        actualCounts[q.difficulty_level as DifficultyLevel]++;
      }

      if (additionalQuestions.length > 0) {
        deviationNotes.push(
          `Filled ${additionalQuestions.length} questions from adjacent difficulties`
        );
      }
    }

    const finalQuestions = this.shuffleArray(selectedQuestions).slice(0, totalNeeded);
    const questionIds = finalQuestions.map(q => q.id);
    const answersMap = await this.questionRepo.getAnswersForQuestions(questionIds);

    const questions: QuestionSnapshot[] = finalQuestions.map(q => {
      const answers = answersMap.get(q.id) || [];
      return {
        question_id: q.id,
        question_text: q.question_text,
        explanation: q.explanation,
        answers: this.shuffleArray(answers.map(a => ({
          answer_id: a.id,
          answer_text: a.answer_text,
          is_correct: a.is_correct,
        }))),
      };
    });

    const total = questions.length || 1;
    const distribution: DifficultyMix = {
      easy: Math.round((actualCounts.easy / total) * 100),
      medium: Math.round((actualCounts.medium / total) * 100),
      hard: Math.round((actualCounts.hard / total) * 100),
    };

    const result: ResolvedQuestionSet = {
      questions,
      difficulty_distribution: distribution,
    };

    if (deviationNotes.length > 0) {
      result.deviation = {
        requested: config.difficulty_mix,
        actual: distribution,
        notes: deviationNotes,
      };
    }

    return result;
  }

  private async loadExistingCampaignSet(
    campaignSet: CampaignQuestionSet
  ): Promise<ResolvedQuestionSet> {
    const answersMap = await this.questionRepo.getAnswersForQuestions(campaignSet.question_ids);

    const questions: QuestionSnapshot[] = [];

    for (const questionId of campaignSet.question_ids) {
      const question = await this.questionRepo.getQuestionById(questionId);
      if (!question) continue;

      const answers = answersMap.get(questionId) || [];
      questions.push({
        question_id: question.id,
        question_text: question.question_text,
        explanation: question.explanation,
        answers: answers.map(a => ({
          answer_id: a.id,
          answer_text: a.answer_text,
          is_correct: a.is_correct,
        })),
      });
    }

    return {
      questions,
      difficulty_distribution: campaignSet.difficulty_distribution,
    };
  }

  private async getApprovedQuestionsByDifficulty(
    topic: string,
    tags: string[],
    difficulty: DifficultyLevel,
    limit: number
  ): Promise<AuthoredQuestion[]> {
    const { supabase } = await import('../../lib/supabase');

    let query = supabase
      .from('trivia_questions')
      .select('*')
      .eq('is_active', true)
      .eq('review_state', 'approved')
      .eq('difficulty_level', difficulty);

    if (topic) {
      query = query.eq('topic', topic);
    }
    if (tags && tags.length > 0) {
      query = query.overlaps('tags', tags);
    }

    query = query.limit(limit);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch questions: ${error.message}`);
    return data || [];
  }

  private async fillShortage(
    topic: string,
    tags: string[],
    count: number,
    excludeIds: string[]
  ): Promise<AuthoredQuestion[]> {
    const { supabase } = await import('../../lib/supabase');

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
    if (excludeIds.length > 0) {
      query = query.not('id', 'in', `(${excludeIds.join(',')})`);
    }

    query = query.limit(count * 2);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fill shortage: ${error.message}`);

    const shuffled = this.shuffleArray(data || []);
    return shuffled.slice(0, count);
  }

  private calculateNeededByDifficulty(
    totalCount: number,
    mix: DifficultyMix
  ): Record<DifficultyLevel, number> {
    const counts = {
      easy: Math.floor(totalCount * mix.easy / 100),
      medium: Math.floor(totalCount * mix.medium / 100),
      hard: Math.floor(totalCount * mix.hard / 100),
    };

    let allocated = counts.easy + counts.medium + counts.hard;
    const remainders = {
      easy: (totalCount * mix.easy / 100) - counts.easy,
      medium: (totalCount * mix.medium / 100) - counts.medium,
      hard: (totalCount * mix.hard / 100) - counts.hard,
    };

    while (allocated < totalCount) {
      const maxRemainder = Math.max(remainders.easy, remainders.medium, remainders.hard);
      if (remainders.easy === maxRemainder) {
        counts.easy++;
        remainders.easy = 0;
      } else if (remainders.medium === maxRemainder) {
        counts.medium++;
        remainders.medium = 0;
      } else {
        counts.hard++;
        remainders.hard = 0;
      }
      allocated++;
    }

    return counts;
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}
