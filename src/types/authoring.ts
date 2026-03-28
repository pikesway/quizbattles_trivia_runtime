export type ShellStatus = 'draft' | 'ready' | 'active' | 'archived';
export type ShellVisibility = 'global' | 'tier_1' | 'tier_2' | 'tier_3' | 'client_specific' | 'internal_only';
export type SelectionMode = 'fixed' | 'random_per_campaign' | 'random_per_play';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';
export type ReviewState = 'pending_review' | 'approved' | 'rejected';
export type SourceType = 'manual' | 'csv' | 'webhook';
export type ImportProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type WebhookProcessingResult = 'pending' | 'success' | 'partial' | 'failed';
export type ReviewAction = 'approved' | 'rejected';
export type LeadTiming = 'before' | 'after' | 'disabled';
export type TimerMode = 'per_question' | 'per_quiz';

export const DEFAULT_DIFFICULTY_MIX: DifficultyMix = {
  easy: 20,
  medium: 60,
  hard: 20,
};

export const APPROVED_FONTS = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Source Sans Pro',
  'Nunito',
  'Raleway',
  'Work Sans',
] as const;

export type ApprovedFont = typeof APPROVED_FONTS[number];

export const MOBILE_FIT_THRESHOLDS = {
  question_text_max: 200,
  answer_text_max: 80,
  explanation_max: 300,
} as const;

export interface DifficultyMix {
  easy: number;
  medium: number;
  hard: number;
}

export interface ShellTheme {
  font_family: ApprovedFont;
  primary_text_color: string;
  secondary_text_color: string;
  button_fill_color: string;
  button_text_color: string;
  overlay_tint: string;
  correct_feedback_accent: string;
  incorrect_feedback_accent: string;
}

export interface ShellBackgrounds {
  default: string;
  start: string | null;
  lead: string | null;
  game: string | null;
  end: string | null;
  feedback: string | null;
}

export interface StartScreenConfig {
  headline: string;
  body: string;
  button_label: string;
  logo_url: string | null;
  disclaimer_text: string | null;
}

export type LeadFormFieldType = 'name' | 'email' | 'phone' | 'text';

export interface LeadFormField {
  type: LeadFormFieldType;
  label: string;
  placeholder: string;
  required: boolean;
  enabled: boolean;
}

export interface LeadFormTermsConfig {
  enabled: boolean;
  text: string;
  required: boolean;
}

export interface LeadFormConfig {
  headline: string;
  fields: LeadFormField[];
  terms: LeadFormTermsConfig;
  submit_label: string;
}

export type GameScreenSpacingPreset = 'compact' | 'comfortable' | 'spacious';
export type GameScreenSpacing = GameScreenSpacingPreset | 'custom';

export const SPACING_LIMITS = {
  min: 8,
  max: 60,
  presets: {
    compact: 12,
    comfortable: 24,
    spacious: 40,
  },
} as const;

export interface GameScreenConfig {
  show_progress_bar: boolean;
  show_question_number: boolean;
  spacing: GameScreenSpacing;
  custom_spacing_value?: number;
}

export interface EndScreenCtaConfig {
  enabled: boolean;
  label: string;
}

export interface SocialShareConfig {
  enabled: boolean;
  share_text_template: string;
  share_image_url: string;
  hashtags: string[];
  fallback_url: string;
}

export interface EndScreenConfig {
  headline_template: string;
  show_score_breakdown: boolean;
  cta: EndScreenCtaConfig;
  social_share: SocialShareConfig;
}

export interface FeedbackScreenConfig {
  correct_headline: string;
  incorrect_headline: string;
  show_explanation: boolean;
}

export interface ShellScreens {
  start: StartScreenConfig;
  lead: LeadFormConfig;
  game: GameScreenConfig;
  end: EndScreenConfig;
  feedback: FeedbackScreenConfig;
}

export interface ScoreRangeMessage {
  min: number;
  max: number;
  message: string;
}

export interface EndScreenCase {
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

export interface CreateEndScreenCaseInput {
  min_percentage: number;
  max_percentage: number | null;
  message: string;
  enabled?: boolean;
  sort_order?: number;
  share_text_override?: string | null;
}

export interface UpdateEndScreenCaseInput {
  min_percentage?: number;
  max_percentage?: number | null;
  message?: string;
  enabled?: boolean;
  sort_order?: number;
  share_text_override?: string | null;
}

export interface EndScreenCaseImportRow {
  min_percentage: string;
  max_percentage: string;
  message: string;
  enabled: string;
}

export interface ShellConfig {
  theme: ShellTheme;
  backgrounds: ShellBackgrounds;
  screens: ShellScreens;
  score_range_messages: ScoreRangeMessage[];
}

export interface TriviaShell {
  id: string;
  internal_name: string;
  slug: string;
  status: ShellStatus;
  visibility: ShellVisibility;
  topic: string;
  tags: string[];
  default_selection_mode: SelectionMode;
  default_question_count: number;
  default_difficulty_mix: DifficultyMix;
  default_timer_mode: TimerMode;
  default_timer_seconds: number;
  is_start_screen_enabled: boolean;
  is_lead_screen_enabled: boolean;
  config: ShellConfig;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface ShellQuestionLink {
  id: string;
  shell_id: string;
  question_id: string;
  position: number;
  created_at: string;
  created_by: string | null;
}

export interface QuestionImportBatch {
  id: string;
  source_type: SourceType;
  source_identifier: string;
  shell_slug: string | null;
  total_items: number;
  success_count: number;
  failure_count: number;
  processing_status: ImportProcessingStatus;
  raw_metadata: Record<string, unknown>;
  error_details: ImportErrorDetail[];
  created_at: string;
  created_by: string | null;
}

export interface ImportErrorDetail {
  row?: number;
  field?: string;
  message: string;
  value?: unknown;
}

export interface WebhookLog {
  id: string;
  request_timestamp: string;
  source: string;
  request_payload: Record<string, unknown>;
  processing_result: WebhookProcessingResult;
  error_details: Record<string, unknown> | null;
  batch_id: string | null;
}

export interface QuestionReview {
  id: string;
  question_id: string;
  reviewer_id: string;
  action: ReviewAction;
  previous_state: ReviewState;
  notes: string | null;
  created_at: string;
}

export interface CampaignQuestionSet {
  id: string;
  campaign_game_instance_id: string;
  shell_id: string;
  resolved_config: ResolvedShellConfig;
  question_ids: string[];
  difficulty_distribution: DifficultyMix;
  created_at: string;
}

export interface EndScreenCaseSnapshot {
  id: string;
  min_percentage: number;
  max_percentage: number | null;
  message: string;
  share_text_override: string | null;
}

export interface ResolvedShellConfig {
  shell_id: string;
  shell_slug: string;
  selection_mode: SelectionMode;
  question_count: number;
  difficulty_mix: DifficultyMix;
  timer_mode: TimerMode;
  timer_seconds: number;
  is_start_screen_enabled: boolean;
  is_lead_screen_enabled: boolean;
  theme: ShellTheme;
  backgrounds: ShellBackgrounds;
  screens: ShellScreens;
  score_range_messages: ScoreRangeMessage[];
  end_screen_cases: EndScreenCaseSnapshot[];
}

export interface AuthoredQuestion {
  id: string;
  question_text: string;
  explanation: string;
  topic: string;
  tags: string[];
  difficulty: number;
  difficulty_level: DifficultyLevel;
  is_active: boolean;
  review_state: ReviewState;
  source_type: SourceType;
  source_batch_id: string | null;
  external_question_id: string | null;
  import_metadata: Record<string, unknown>;
  created_at: string;
}

export interface CreateShellInput {
  internal_name: string;
  slug: string;
  topic?: string;
  tags?: string[];
  visibility?: ShellVisibility;
}

export interface UpdateShellInput {
  internal_name?: string;
  slug?: string;
  status?: ShellStatus;
  visibility?: ShellVisibility;
  topic?: string;
  tags?: string[];
  default_selection_mode?: SelectionMode;
  default_question_count?: number;
  default_difficulty_mix?: DifficultyMix;
  default_timer_mode?: TimerMode;
  default_timer_seconds?: number;
  is_start_screen_enabled?: boolean;
  is_lead_screen_enabled?: boolean;
  config?: Partial<ShellConfig>;
}

export interface ShellListFilters {
  status?: ShellStatus;
  visibility?: ShellVisibility;
  topic?: string;
  tags?: string[];
  search?: string;
}

export interface QuestionListFilters {
  topic?: string;
  tags?: string[];
  difficulty_level?: DifficultyLevel;
  review_state?: ReviewState;
  source_type?: SourceType;
  source_batch_id?: string;
  search?: string;
  is_active?: boolean;
}

export interface CSVImportRow {
  topic: string;
  tags: string;
  question: string;
  explanation: string;
  difficulty: string;
  answer_1: string;
  answer_1_is_correct: string;
  answer_2: string;
  answer_2_is_correct: string;
  answer_3: string;
  answer_3_is_correct: string;
  answer_4: string;
  answer_4_is_correct: string;
}

export interface WebhookImportPayload {
  import_batch_id?: string;
  source: string;
  shell_slug?: string;
  topic: string;
  tags: string[];
  questions: WebhookQuestion[];
}

export interface WebhookQuestion {
  external_question_id?: string;
  question: string;
  explanation: string;
  difficulty: DifficultyLevel;
  answers: WebhookAnswer[];
  active?: boolean;
}

export interface WebhookAnswer {
  text: string;
  is_correct: boolean;
}

export interface ValidationResult {
  is_valid: boolean;
  blocking_errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ValidationIssue {
  code: string;
  message: string;
  field?: string;
  context?: Record<string, unknown>;
}

export interface QuestionSupplyHealth {
  total_approved: number;
  by_difficulty: {
    easy: number;
    medium: number;
    hard: number;
  };
  needed: {
    easy: number;
    medium: number;
    hard: number;
    total: number;
  };
  sufficient: boolean;
  shortages: {
    easy: number;
    medium: number;
    hard: number;
  };
}

export interface MobileFitWarning {
  question_id: string;
  issues: {
    field: 'question_text' | 'answer_text' | 'explanation';
    actual_length: number;
    max_length: number;
    answer_index?: number;
  }[];
}

export interface DuplicateWarning {
  question_id: string;
  duplicate_of: string;
  match_type: 'exact_text' | 'exact_text_and_topic';
}
