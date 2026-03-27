export interface TriviaQuestion {
  id: string;
  question_text: string;
  explanation: string;
  topic: string;
  tags: string[];
  difficulty: number;
  is_active: boolean;
  created_at: string;
}

export interface TriviaAnswer {
  id: string;
  question_id: string;
  answer_text: string;
  is_correct: boolean;
  display_order: number;
}

export type SessionStatus = 'in_progress' | 'completed' | 'abandoned';
export type TimerMode = 'per_question' | 'per_quiz';

export interface TriviaGameSession {
  id: string;
  campaign_id: string;
  campaign_game_instance_id: string;
  lead_id: string | null;
  status: SessionStatus;
  score: number;
  total_questions: number;
  correct_answers: number;
  started_at: string;
  completed_at: string | null;
  timer_mode: TimerMode;
  timer_seconds: number;
  question_set: QuestionSnapshot[];
  current_index: number;
  config: Partial<GameInstanceConfig>;
  current_question_started_at: string | null;
}

export interface QuestionSnapshot {
  question_id: string;
  question_text: string;
  explanation: string;
  answers: AnswerSnapshot[];
}

export interface AnswerSnapshot {
  answer_id: string;
  answer_text: string;
  is_correct: boolean;
}

export interface TriviaSessionAnswer {
  id: string;
  session_id: string;
  question_id: string;
  selected_answer_id: string;
  is_correct: boolean;
  time_to_answer_ms: number;
  answered_at: string;
}

export interface GameInstanceConfig {
  question_mode: 'fixed' | 'random';
  question_count: number;
  timer: {
    mode: TimerMode;
    seconds: number;
  };
  scoring_mode: 'accuracy_only';
  end_screen_rules: EndScreenRule[];
  lead_capture: LeadCaptureConfig;
  ui: {
    background_url: string;
  };
}

export interface EndScreenRule {
  min: number;
  max: number;
  text: string;
}

export type LeadFieldType = 'name' | 'email' | 'phone' | 'text';

export interface LeadField {
  type: LeadFieldType;
  name: string;
  label: string;
  placeholder: string;
  required: boolean;
}

export interface LeadTermsConfig {
  enabled: boolean;
  text: string;
  required: boolean;
}

export interface LeadCaptureConfig {
  enabled: boolean;
  headline: string;
  fields: LeadField[];
  terms: LeadTermsConfig;
  submit_label: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface StartSessionRequest {
  campaign_id: string;
  campaign_game_instance_id: string;
  lead_id?: string;
}

export interface StartSessionResponse {
  session_id: string;
  question: {
    question_text: string;
    answers: Array<{
      answer_id: string;
      answer_text: string;
    }>;
  };
  ui: {
    background_url: string;
  };
  lead_capture: LeadCaptureConfig;
  timer: {
    mode: TimerMode;
    seconds: number;
  };
  total_questions: number;
  current_question: number;
}

export interface NextQuestionResponse {
  question: {
    question_text: string;
    answers: Array<{
      answer_id: string;
      answer_text: string;
    }>;
  };
  current_question: number;
  total_questions: number;
  remaining_time_ms?: number;
}

export interface SubmitAnswerRequest {
  selected_answer_id: string;
  time_to_answer_ms?: number;
}

export interface SubmitAnswerResponse {
  correct: boolean;
  correct_answer_id: string;
  explanation: string;
  feedback_type: 'correct' | 'incorrect';
  score: number;
  is_last_question: boolean;
}

export interface CompleteSessionResponse {
  score: number;
  total: number;
  message: string;
  correct_answers: number;
}

export interface LeadCaptureRequest {
  data: Record<string, string>;
}

export interface LeadCaptureResponse {
  lead_id: string;
}
