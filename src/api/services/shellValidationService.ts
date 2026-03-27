import { ShellRepository } from '../repositories/shellRepository';
import { QuestionBankRepository } from '../repositories/questionBankRepository';
import { QuestionBankService } from './questionBankService';
import {
  TriviaShell,
  ValidationResult,
  ValidationIssue,
  QuestionSupplyHealth,
  DifficultyMix,
  DifficultyLevel,
  MobileFitWarning,
  APPROVED_FONTS,
} from '../../types/authoring';

export class ShellValidationService {
  private shellRepo: ShellRepository;
  private questionRepo: QuestionBankRepository;
  private questionService: QuestionBankService;

  constructor() {
    this.shellRepo = new ShellRepository();
    this.questionRepo = new QuestionBankRepository();
    this.questionService = new QuestionBankService();
  }

  async validateShell(shellId: string): Promise<ValidationResult> {
    const shell = await this.shellRepo.getById(shellId);
    if (!shell) {
      return {
        is_valid: false,
        blocking_errors: [{ code: 'SHELL_NOT_FOUND', message: 'Shell not found' }],
        warnings: [],
      };
    }

    const blockingErrors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];

    this.validateRequiredFields(shell, blockingErrors);
    this.validateEnumValues(shell, blockingErrors);
    this.validateTopicOrTags(shell, blockingErrors);
    this.validateRuntimeConfig(shell, blockingErrors);
    this.validateDifficultyMix(shell, blockingErrors);
    this.validateTimerConfig(shell, blockingErrors);
    this.validateScoreRangeMessages(shell, blockingErrors, warnings);
    this.validateTheme(shell, blockingErrors, warnings);
    this.validateBackgrounds(shell, warnings);
    this.validateScreenConfig(shell, blockingErrors);

    await this.validateQuestionSupply(shell, blockingErrors, warnings);

    return {
      is_valid: blockingErrors.length === 0,
      blocking_errors: blockingErrors,
      warnings,
    };
  }

  async getQuestionSupplyHealth(shell: TriviaShell): Promise<QuestionSupplyHealth> {
    const supplyCounts = await this.questionRepo.getApprovedCountByDifficulty(
      shell.topic || undefined,
      shell.tags?.length > 0 ? shell.tags : undefined
    );

    const neededCounts = this.calculateNeededByDifficulty(
      shell.default_question_count,
      shell.default_difficulty_mix
    );

    const shortages = {
      easy: Math.max(0, neededCounts.easy - supplyCounts.easy),
      medium: Math.max(0, neededCounts.medium - supplyCounts.medium),
      hard: Math.max(0, neededCounts.hard - supplyCounts.hard),
    };

    const totalApproved = supplyCounts.easy + supplyCounts.medium + supplyCounts.hard;
    const totalNeeded = neededCounts.easy + neededCounts.medium + neededCounts.hard;

    return {
      total_approved: totalApproved,
      by_difficulty: supplyCounts,
      needed: {
        ...neededCounts,
        total: totalNeeded,
      },
      sufficient: shortages.easy === 0 && shortages.medium === 0 && shortages.hard === 0,
      shortages,
    };
  }

  async getMobileFitWarnings(shellId: string): Promise<MobileFitWarning[]> {
    const shell = await this.shellRepo.getById(shellId);
    if (!shell) return [];

    const warnings: MobileFitWarning[] = [];

    if (shell.default_selection_mode === 'fixed') {
      const links = await this.shellRepo.getQuestionLinks(shellId);
      const questionIds = links.map(l => l.question_id);
      const questions = await this.questionService.getQuestionsWithAnswers(questionIds);

      for (const question of questions) {
        const warning = await this.questionService.checkMobileFit(question);
        if (warning) {
          warnings.push(warning);
        }
      }
    }

    return warnings;
  }

  private validateRequiredFields(shell: TriviaShell, errors: ValidationIssue[]): void {
    if (!shell.internal_name || shell.internal_name.trim().length === 0) {
      errors.push({
        code: 'MISSING_INTERNAL_NAME',
        message: 'Internal name is required',
        field: 'internal_name',
      });
    }

    if (!shell.slug || shell.slug.trim().length === 0) {
      errors.push({
        code: 'MISSING_SLUG',
        message: 'Slug is required',
        field: 'slug',
      });
    }
  }

  private validateTopicOrTags(shell: TriviaShell, errors: ValidationIssue[]): void {
    if (shell.status === 'draft') {
      return;
    }

    const hasTopic = shell.topic && shell.topic.trim().length > 0;
    const hasTags = shell.tags && shell.tags.length > 0;

    if (!hasTopic && !hasTags) {
      errors.push({
        code: 'MISSING_TOPIC_OR_TAGS',
        message: 'Either Topic or Tags must be specified to move beyond draft status',
        field: 'topic',
      });
    }
  }

  private validateEnumValues(shell: TriviaShell, errors: ValidationIssue[]): void {
    const validStatuses = ['draft', 'ready', 'active', 'archived'];
    if (!validStatuses.includes(shell.status)) {
      errors.push({
        code: 'INVALID_STATUS',
        message: `Invalid status: ${shell.status}`,
        field: 'status',
        context: { valid_values: validStatuses },
      });
    }

    const validVisibilities = ['global', 'tier_1', 'tier_2', 'tier_3', 'client_specific', 'internal_only'];
    if (!validVisibilities.includes(shell.visibility)) {
      errors.push({
        code: 'INVALID_VISIBILITY',
        message: `Invalid visibility: ${shell.visibility}`,
        field: 'visibility',
        context: { valid_values: validVisibilities },
      });
    }

    const validSelectionModes = ['fixed', 'random_per_campaign', 'random_per_play'];
    if (!validSelectionModes.includes(shell.default_selection_mode)) {
      errors.push({
        code: 'INVALID_SELECTION_MODE',
        message: `Invalid selection mode: ${shell.default_selection_mode}`,
        field: 'default_selection_mode',
        context: { valid_values: validSelectionModes },
      });
    }
  }

  private validateRuntimeConfig(shell: TriviaShell, errors: ValidationIssue[]): void {
    if (!shell.default_question_count || shell.default_question_count < 1) {
      errors.push({
        code: 'INVALID_QUESTION_COUNT',
        message: 'Question count must be at least 1',
        field: 'default_question_count',
      });
    }

    if (shell.default_question_count > 100) {
      errors.push({
        code: 'QUESTION_COUNT_TOO_HIGH',
        message: 'Question count cannot exceed 100',
        field: 'default_question_count',
      });
    }
  }

  private validateDifficultyMix(shell: TriviaShell, errors: ValidationIssue[]): void {
    const mix = shell.default_difficulty_mix;

    if (!mix || typeof mix !== 'object') {
      errors.push({
        code: 'MISSING_DIFFICULTY_MIX',
        message: 'Difficulty mix is required',
        field: 'default_difficulty_mix',
      });
      return;
    }

    const total = (mix.easy || 0) + (mix.medium || 0) + (mix.hard || 0);

    if (total !== 100) {
      errors.push({
        code: 'INVALID_DIFFICULTY_MIX_TOTAL',
        message: `Difficulty mix must total 100, got ${total}`,
        field: 'default_difficulty_mix',
        context: { easy: mix.easy, medium: mix.medium, hard: mix.hard, total },
      });
    }

    if (mix.easy < 0 || mix.medium < 0 || mix.hard < 0) {
      errors.push({
        code: 'NEGATIVE_DIFFICULTY_VALUE',
        message: 'Difficulty percentages cannot be negative',
        field: 'default_difficulty_mix',
      });
    }
  }

  private validateTimerConfig(shell: TriviaShell, errors: ValidationIssue[]): void {
    const validTimerModes = ['per_question', 'per_quiz'];
    if (!validTimerModes.includes(shell.default_timer_mode)) {
      errors.push({
        code: 'INVALID_TIMER_MODE',
        message: `Invalid timer mode: ${shell.default_timer_mode}`,
        field: 'default_timer_mode',
        context: { valid_values: validTimerModes },
      });
    }

    if (!shell.default_timer_seconds || shell.default_timer_seconds < 5) {
      errors.push({
        code: 'TIMER_TOO_SHORT',
        message: 'Timer must be at least 5 seconds',
        field: 'default_timer_seconds',
      });
    }

    if (shell.default_timer_seconds > 600) {
      errors.push({
        code: 'TIMER_TOO_LONG',
        message: 'Timer cannot exceed 600 seconds (10 minutes)',
        field: 'default_timer_seconds',
      });
    }
  }

  private validateScoreRangeMessages(
    shell: TriviaShell,
    errors: ValidationIssue[],
    warnings: ValidationIssue[]
  ): void {
    const messages = shell.config?.score_range_messages;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      errors.push({
        code: 'MISSING_SCORE_RANGE_MESSAGES',
        message: 'At least one score range message is required',
        field: 'config.score_range_messages',
      });
      return;
    }

    const sortedMessages = [...messages].sort((a, b) => a.min - b.min);

    for (let i = 0; i < sortedMessages.length; i++) {
      const msg = sortedMessages[i];

      if (msg.min > msg.max) {
        errors.push({
          code: 'INVALID_SCORE_RANGE',
          message: `Score range ${i + 1}: min (${msg.min}) cannot be greater than max (${msg.max})`,
          field: 'config.score_range_messages',
          context: { index: i, min: msg.min, max: msg.max },
        });
      }

      if (!msg.message || msg.message.trim().length === 0) {
        errors.push({
          code: 'EMPTY_SCORE_MESSAGE',
          message: `Score range ${i + 1}: message is required`,
          field: 'config.score_range_messages',
          context: { index: i },
        });
      }

      if (i > 0) {
        const prevMsg = sortedMessages[i - 1];
        if (msg.min <= prevMsg.max) {
          warnings.push({
            code: 'OVERLAPPING_SCORE_RANGES',
            message: `Score ranges may overlap: ${prevMsg.min}-${prevMsg.max} and ${msg.min}-${msg.max}`,
            field: 'config.score_range_messages',
            context: { ranges: [prevMsg, msg] },
          });
        }
      }
    }

    if (sortedMessages[0].min !== 0) {
      warnings.push({
        code: 'SCORE_RANGE_GAP_AT_START',
        message: 'Score ranges do not start at 0',
        field: 'config.score_range_messages',
      });
    }

    if (sortedMessages[sortedMessages.length - 1].max !== 100) {
      warnings.push({
        code: 'SCORE_RANGE_GAP_AT_END',
        message: 'Score ranges do not end at 100',
        field: 'config.score_range_messages',
      });
    }
  }

  private validateTheme(
    shell: TriviaShell,
    errors: ValidationIssue[],
    warnings: ValidationIssue[]
  ): void {
    const theme = shell.config?.theme;

    if (!theme) {
      errors.push({
        code: 'MISSING_THEME',
        message: 'Theme configuration is required',
        field: 'config.theme',
      });
      return;
    }

    if (theme.font_family && !APPROVED_FONTS.includes(theme.font_family as typeof APPROVED_FONTS[number])) {
      warnings.push({
        code: 'UNAPPROVED_FONT',
        message: `Font "${theme.font_family}" is not in the approved font list`,
        field: 'config.theme.font_family',
        context: { approved_fonts: APPROVED_FONTS },
      });
    }

    const colorFields = [
      'primary_text_color',
      'secondary_text_color',
      'button_fill_color',
      'button_text_color',
      'correct_feedback_accent',
      'incorrect_feedback_accent',
    ];

    for (const field of colorFields) {
      const value = theme[field as keyof typeof theme];
      if (value && typeof value === 'string' && !this.isValidColor(value)) {
        warnings.push({
          code: 'INVALID_COLOR_FORMAT',
          message: `Invalid color format for ${field}: ${value}`,
          field: `config.theme.${field}`,
        });
      }
    }
  }

  private validateBackgrounds(shell: TriviaShell, warnings: ValidationIssue[]): void {
    const backgrounds = shell.config?.backgrounds;

    if (!backgrounds) return;

    if (!backgrounds.default || backgrounds.default.trim().length === 0) {
      warnings.push({
        code: 'MISSING_DEFAULT_BACKGROUND',
        message: 'No default background image set',
        field: 'config.backgrounds.default',
      });
    }
  }

  private validateScreenConfig(shell: TriviaShell, errors: ValidationIssue[]): void {
    const screens = shell.config?.screens;

    if (!screens) {
      errors.push({
        code: 'MISSING_SCREEN_CONFIG',
        message: 'Screen configuration is required',
        field: 'config.screens',
      });
      return;
    }

    if (!screens.game) {
      errors.push({
        code: 'MISSING_GAME_SCREEN_CONFIG',
        message: 'Game screen configuration is required',
        field: 'config.screens.game',
      });
    }

    if (!screens.end) {
      errors.push({
        code: 'MISSING_END_SCREEN_CONFIG',
        message: 'End screen configuration is required',
        field: 'config.screens.end',
      });
    }

    if (shell.is_start_screen_enabled && !screens.start) {
      errors.push({
        code: 'MISSING_START_SCREEN_CONFIG',
        message: 'Start screen is enabled but configuration is missing',
        field: 'config.screens.start',
      });
    }

    if (shell.is_lead_screen_enabled) {
      this.validateLeadFormConfig(shell, errors);
    }
  }

  private validateLeadFormConfig(shell: TriviaShell, errors: ValidationIssue[]): void {
    const lead = shell.config?.screens?.lead;

    if (!lead) {
      errors.push({
        code: 'MISSING_LEAD_SCREEN_CONFIG',
        message: 'Lead screen is enabled but configuration is missing',
        field: 'config.screens.lead',
      });
      return;
    }

    const enabledFields = (lead.fields || []).filter(f => f.enabled);

    if (enabledFields.length === 0) {
      errors.push({
        code: 'NO_LEAD_FIELDS_ENABLED',
        message: 'At least one form field must be enabled when lead screen is active',
        field: 'config.screens.lead.fields',
      });
    }

    for (const field of enabledFields) {
      if (!field.label || field.label.trim().length === 0) {
        errors.push({
          code: 'EMPTY_FIELD_LABEL',
          message: `Field "${field.type}" requires a label`,
          field: `config.screens.lead.fields.${field.type}.label`,
        });
      }
    }

    if (lead.terms?.enabled && lead.terms?.required) {
      if (!lead.terms.text || lead.terms.text.trim().length === 0) {
        errors.push({
          code: 'EMPTY_TERMS_TEXT',
          message: 'Terms text is required when terms checkbox is enabled and required',
          field: 'config.screens.lead.terms.text',
        });
      }
    }

    if (!lead.submit_label || lead.submit_label.trim().length === 0) {
      errors.push({
        code: 'EMPTY_SUBMIT_LABEL',
        message: 'Submit button label is required',
        field: 'config.screens.lead.submit_label',
      });
    }
  }

  private async validateQuestionSupply(
    shell: TriviaShell,
    errors: ValidationIssue[],
    warnings: ValidationIssue[]
  ): Promise<void> {
    if (shell.default_selection_mode === 'fixed') {
      await this.validateFixedQuestions(shell, errors, warnings);
    } else {
      await this.validateRandomQuestionSupply(shell, errors, warnings);
    }
  }

  private async validateFixedQuestions(
    shell: TriviaShell,
    errors: ValidationIssue[],
    warnings: ValidationIssue[]
  ): Promise<void> {
    const links = await this.shellRepo.getQuestionLinks(shell.id);
    const linkedCount = links.length;

    if (linkedCount < shell.default_question_count) {
      errors.push({
        code: 'INSUFFICIENT_FIXED_QUESTIONS',
        message: `Fixed shell requires ${shell.default_question_count} questions, but only ${linkedCount} are linked`,
        field: 'questions',
        context: { needed: shell.default_question_count, linked: linkedCount },
      });
    }

    for (const link of links) {
      const question = await this.questionRepo.getQuestionById(link.question_id);
      if (!question) {
        errors.push({
          code: 'LINKED_QUESTION_NOT_FOUND',
          message: `Linked question ${link.question_id} not found`,
          field: 'questions',
          context: { question_id: link.question_id },
        });
        continue;
      }

      if (question.review_state !== 'approved') {
        errors.push({
          code: 'LINKED_QUESTION_NOT_APPROVED',
          message: `Linked question at position ${link.position} is not approved (state: ${question.review_state})`,
          field: 'questions',
          context: { question_id: link.question_id, position: link.position, state: question.review_state },
        });
      }

      const questionWithAnswers = await this.questionRepo.getQuestionWithAnswers(link.question_id);
      if (questionWithAnswers) {
        const correctCount = questionWithAnswers.answers.filter(a => a.is_correct).length;
        if (correctCount !== 1) {
          errors.push({
            code: 'INVALID_ANSWER_INTEGRITY',
            message: `Question at position ${link.position} does not have exactly one correct answer`,
            field: 'questions',
            context: { question_id: link.question_id, correct_count: correctCount },
          });
        }
      }
    }

    const positions = links.map(l => l.position).sort((a, b) => a - b);
    for (let i = 0; i < positions.length; i++) {
      if (positions[i] !== i + 1) {
        warnings.push({
          code: 'QUESTION_ORDER_GAP',
          message: 'Question positions have gaps or are not sequential',
          field: 'questions',
          context: { positions },
        });
        break;
      }
    }
  }

  private async validateRandomQuestionSupply(
    shell: TriviaShell,
    errors: ValidationIssue[],
    warnings: ValidationIssue[]
  ): Promise<void> {
    const health = await this.getQuestionSupplyHealth(shell);

    if (health.total_approved < shell.default_question_count) {
      errors.push({
        code: 'INSUFFICIENT_QUESTION_SUPPLY',
        message: `Need ${shell.default_question_count} questions but only ${health.total_approved} approved questions available`,
        field: 'questions',
        context: { needed: shell.default_question_count, available: health.total_approved },
      });
    }

    if (!health.sufficient) {
      const shortageDetails: string[] = [];
      if (health.shortages.easy > 0) shortageDetails.push(`easy: ${health.shortages.easy} short`);
      if (health.shortages.medium > 0) shortageDetails.push(`medium: ${health.shortages.medium} short`);
      if (health.shortages.hard > 0) shortageDetails.push(`hard: ${health.shortages.hard} short`);

      warnings.push({
        code: 'DIFFICULTY_SUPPLY_SHORTAGE',
        message: `Insufficient questions by difficulty: ${shortageDetails.join(', ')}`,
        field: 'questions',
        context: {
          needed: health.needed,
          available: health.by_difficulty,
          shortages: health.shortages,
        },
      });
    }
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

  private isValidColor(color: string): boolean {
    if (color.startsWith('#')) {
      return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
    }
    if (color.startsWith('rgb')) {
      return /^rgba?\([^)]+\)$/.test(color);
    }
    return false;
  }
}
