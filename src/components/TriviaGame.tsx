import { useState, useEffect } from 'react';
import { Share2, CheckCircle, XCircle, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { GameStage, StageHeader, StageBody, StageFooter } from './runtime/GameStage';
import {
  StartSessionResponse,
  NextQuestionResponse,
  SubmitAnswerResponse,
  CompleteSessionResponse,
  TimerMode,
} from '../types/trivia';

type GameScreenSpacingPreset = 'compact' | 'comfortable' | 'spacious';
type GameScreenSpacing = GameScreenSpacingPreset | 'custom';

const SPACING_PRESETS: Record<GameScreenSpacingPreset, number> = {
  compact: 12,
  comfortable: 24,
  spacious: 40,
};

function getSpacingConfig(spacing: GameScreenSpacing = 'comfortable', customValue?: number) {
  if (spacing === 'custom' && customValue !== undefined) {
    const height = Math.max(8, Math.min(60, customValue));
    if (height <= 16) {
      return { spacerHeight: height, answerGap: 'space-y-1.5', answerPadding: 'p-2.5 sm:p-3' };
    } else if (height >= 32) {
      return { spacerHeight: height, answerGap: 'space-y-4', answerPadding: 'p-4 sm:p-5' };
    }
    return { spacerHeight: height, answerGap: 'space-y-2 sm:space-y-3', answerPadding: 'p-3 sm:p-4' };
  }
  switch (spacing) {
    case 'compact':
      return { spacerHeight: SPACING_PRESETS.compact, answerGap: 'space-y-1.5', answerPadding: 'p-2.5 sm:p-3' };
    case 'spacious':
      return { spacerHeight: SPACING_PRESETS.spacious, answerGap: 'space-y-4', answerPadding: 'p-4 sm:p-5' };
    default:
      return { spacerHeight: SPACING_PRESETS.comfortable, answerGap: 'space-y-2 sm:space-y-3', answerPadding: 'p-3 sm:p-4' };
  }
}

const SPACING_CONFIG = getSpacingConfig('comfortable');

type GameState = 'start' | 'playing' | 'answered' | 'lead_form' | 'completed';

interface TriviaGameProps {
  campaign_id?: string;
  template_id?: string;
  return_url?: string;
}

interface LeadFormField {
  type: 'name' | 'email' | 'phone' | 'text';
  name: string;
  label: string;
  placeholder: string;
  required: boolean;
  enabled?: boolean;
}

interface LeadFormTerms {
  enabled: boolean;
  text: string;
  required: boolean;
}

interface LeadFormConfig {
  enabled?: boolean;
  headline?: string;
  fields?: LeadFormField[];
  terms?: LeadFormTerms;
  submit_label?: string;
}

interface ShellData {
  internal_name: string;
  topic: string;
  config: {
    theme?: {
      font_family?: string;
      primary_text_color?: string;
      secondary_text_color?: string;
      button_fill_color?: string;
      button_text_color?: string;
      overlay_tint?: string;
      correct_feedback_accent?: string;
      incorrect_feedback_accent?: string;
    };
    backgrounds?: {
      default?: string;
      start?: string | null;
      game?: string | null;
      lead?: string | null;
      end?: string | null;
    };
    screens?: {
      start?: { headline?: string; body?: string; button_label?: string };
      game?: { show_progress_bar?: boolean; show_question_number?: boolean; spacing?: GameScreenSpacing; custom_spacing_value?: number };
      feedback?: { correct_headline?: string; incorrect_headline?: string; show_explanation?: boolean };
      lead?: LeadFormConfig;
      end?: {
        headline_template?: string;
        show_score_breakdown?: boolean;
        cta?: { enabled: boolean; label: string };
        social_share?: {
          enabled: boolean;
          share_text_template: string;
          share_image_url: string;
          hashtags: string[];
          fallback_url: string;
        };
      };
    };
  };
}

export function TriviaGame({ campaign_id, template_id, return_url }: TriviaGameProps) {
  const [gameState, setGameState] = useState<GameState>('start');
  const [sessionId, setSessionId] = useState<string>('');
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string>('');
  const [feedback, setFeedback] = useState<SubmitAnswerResponse | null>(null);
  const [completionData, setCompletionData] = useState<CompleteSessionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [currentQuestionNum, setCurrentQuestionNum] = useState(0);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [validationError, setValidationError] = useState<string>('');
  const [shellData, setShellData] = useState<ShellData | null>(null);
  const [timerMode, setTimerMode] = useState<TimerMode>('per_question');
  const [timerSeconds, setTimerSeconds] = useState<number>(15);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [timerActive, setTimerActive] = useState(false);
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null);
  const [leadFormData, setLeadFormData] = useState<Record<string, string>>({});
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [leadFormErrors, setLeadFormErrors] = useState<Record<string, string>>({});

  // Pre-load shell data on mount for start screen background
  useEffect(() => {
    async function loadShellData() {
      if (!template_id) {
        setValidationError('Invalid or missing game link.');
        return;
      }

      try {
        const { data: shell, error } = await supabase
          .from('trivia_shells')
          .select('internal_name, topic, config')
          .eq('id', template_id)
          .maybeSingle();

        if (error) throw error;
        if (shell) {
          setShellData(shell as ShellData);
        }
      } catch (err) {
        console.error('Error loading shell data:', err);
      }
    }

    loadShellData();
  }, [template_id]);

  // Timer countdown effect
  useEffect(() => {
    if (!timerActive || timeRemaining <= 0 || timerMode === 'none') return;

    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timerActive, timeRemaining, timerMode]);

  async function startGame() {
    if (!template_id) {
      setValidationError('Invalid or missing game link.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.functions.invoke('trivia-start', {
        body: {
          template_id,
          campaign_id: campaign_id || 'standalone-play',
          campaign_game_instance_id: 'standalone-instance',
        },
      });

      if (error) throw error;

      if (!data.success) {
        setError(data.error || 'Failed to start game');
        return;
      }

      const response = data.data as StartSessionResponse;
      setSessionId(response.session_id);
      setCurrentQuestion(response.question);
      setTotalQuestions(response.total_questions);
      setCurrentQuestionNum(response.current_question);

      if (response.shell) {
        setShellData(response.shell);
      }

      // Set timer configuration
      if (response.timer) {
        setTimerMode(response.timer.mode);
        setTimerSeconds(response.timer.seconds);
        setTimeRemaining(response.timer.seconds);
        setTimerActive(response.timer.mode !== 'none');
      }

      setGameState('playing');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAnswerSelect(answerId: string) {
    if (selectedAnswer || loading) return; // Prevent multiple selections

    setSelectedAnswer(answerId);
    setTimerActive(false);

    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.functions.invoke('trivia-answer', {
        body: {
          session_id: sessionId,
          selected_answer_id: answerId,
          time_to_answer_ms: timerMode !== 'none' ? (timerSeconds - timeRemaining) * 1000 : undefined,
        },
      });

      if (error) throw error;

      if (!data.success) {
        setError(data.error || 'Failed to submit answer');
        setLoading(false);
        return;
      }

      const response = data.data as SubmitAnswerResponse;
      setFeedback(response);
      setLastAnswerCorrect(response.correct);

      // Check if we should show feedback screen or auto-advance
      if (shellData?.config?.screens?.feedback?.show_explanation && response.explanation) {
        setGameState('answered');
        setLoading(false);
      } else {
        // Auto-advance after brief delay
        setTimeout(() => {
          setLoading(false);
          moveToNext();
        }, 500);
      }
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  async function handleTimeUp() {
    if (selectedAnswer || loading) return; // Already answered or processing

    setTimerActive(false);
    setSelectedAnswer('TIME_UP'); // Mark as timed out
    setLastAnswerCorrect(false);
    setLoading(true);

    try {
      // Submit time-up as incorrect answer
      const { data, error } = await supabase.functions.invoke('trivia-answer', {
        body: {
          session_id: sessionId,
          selected_answer_id: null, // No answer selected
          time_to_answer_ms: timerSeconds * 1000,
        },
      });

      if (error) throw error;

      if (!data.success) {
        setError(data.error || 'Failed to submit answer');
        setLoading(false);
        return;
      }

      const response = data.data as SubmitAnswerResponse;
      setFeedback(response);

      // Check if we should show feedback screen or auto-advance
      if (shellData?.config?.screens?.feedback?.show_explanation && response.explanation) {
        setGameState('answered');
        setLoading(false);
      } else {
        // Auto-advance after brief delay
        setTimeout(() => {
          setLoading(false);
          moveToNext();
        }, 500);
      }
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  async function moveToNext() {
    if (feedback?.is_last_question) {
      // Check if lead form is enabled and should be shown
      const leadConfig = shellData?.config?.screens?.lead;
      const hasEnabledFields = leadConfig?.fields?.some(field => field.enabled !== false);

      if (leadConfig && hasEnabledFields) {
        // Transition to lead form before completing
        setGameState('lead_form');
        setLoading(false);
        return;
      }

      // No lead form, go directly to completion
      await completeGame();
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.functions.invoke('trivia-next', {
        body: { session_id: sessionId },
      });

      if (error) throw error;

      if (!data.success) {
        setError(data.error || 'Failed to load next question');
        return;
      }

      const response = data.data as NextQuestionResponse;
      setCurrentQuestion(response.question);
      setCurrentQuestionNum(response.current_question);
      setSelectedAnswer('');
      setFeedback(null);
      setLastAnswerCorrect(null);
      setTimeRemaining(timerSeconds);
      setTimerActive(timerMode !== 'none');
      setGameState('playing');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function completeGame() {
    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.functions.invoke('trivia-complete', {
        body: { session_id: sessionId },
      });

      if (error) throw error;

      if (!data.success) {
        setError(data.error || 'Failed to complete game');
        return;
      }

      const response = data.data as CompleteSessionResponse;
      setCompletionData(response);
      setGameState('completed');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  function validatePhone(phone: string): boolean {
    const digitsOnly = phone.replace(/\D/g, '');
    return digitsOnly.length === 10;
  }

  async function handleLeadFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLeadFormErrors({});
    setError('');

    const leadConfig = shellData?.config?.screens?.lead;
    if (!leadConfig?.fields) return;

    // Validate form fields
    const errors: Record<string, string> = {};
    const enabledFields = leadConfig.fields.filter(field => field.enabled !== false);

    for (const field of enabledFields) {
      const value = leadFormData[field.name]?.trim() || '';

      if (field.required && !value) {
        errors[field.name] = `${field.label} is required`;
        continue;
      }

      if (value) {
        if (field.type === 'email' && !validateEmail(value)) {
          errors[field.name] = 'Please enter a valid email address';
        }

        if (field.type === 'phone' && !validatePhone(value)) {
          errors[field.name] = 'Please enter a valid 10 digit phone number';
        }
      }
    }

    // Validate terms if required
    if (leadConfig.terms?.enabled && leadConfig.terms?.required && !termsAccepted) {
      errors.terms = 'You must accept the terms to continue';
    }

    if (Object.keys(errors).length > 0) {
      setLeadFormErrors(errors);
      return;
    }

    // Submit lead data
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('trivia-lead', {
        body: {
          session_id: sessionId,
          data: leadFormData,
          terms_accepted: termsAccepted,
        },
      });

      if (error) throw error;

      if (!data.success) {
        if (data.error?.details) {
          const validationErrors: Record<string, string> = {};
          for (const detail of data.error.details) {
            validationErrors[detail.field] = detail.message;
          }
          setLeadFormErrors(validationErrors);
        } else {
          setError(data.error?.message || 'Failed to submit lead form');
        }
        return;
      }

      // Lead captured successfully, proceed to completion
      await completeGame();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function resetGame() {
    setGameState('start');
    setSessionId('');
    setCurrentQuestion(null);
    setSelectedAnswer('');
    setFeedback(null);
    setCompletionData(null);
    setError('');
  }

  async function handleShare() {
    if (!completionData?.social_share?.enabled) return;

    const shareText = completionData.social_share.share_text;
    const url = completionData.social_share.fallback_url || window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Quiz Results',
          text: shareText,
          url,
        });
      } catch {
      }
    } else {
      setShowShareMenu(true);
    }
  }

  function handleShareTwitter() {
    if (!completionData?.social_share) return;
    const shareText = completionData.social_share.share_text;
    const url = completionData.social_share.fallback_url || window.location.href;
    const hashtags = (completionData.social_share.hashtags || []).join(',');
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}${hashtags ? `&hashtags=${encodeURIComponent(hashtags)}` : ''}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
    setShowShareMenu(false);
  }

  function handleShareFacebook() {
    if (!completionData?.social_share) return;
    const url = completionData.social_share.fallback_url || window.location.href;
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
    window.open(facebookUrl, '_blank', 'width=580,height=400');
    setShowShareMenu(false);
  }

  async function handleCopyLink() {
    if (!completionData?.social_share) return;
    const shareText = completionData.social_share.share_text;
    const url = completionData.social_share.fallback_url || window.location.href;
    try {
      await navigator.clipboard.writeText(`${shareText} ${url}`);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = `${shareText} ${url}`;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setShowShareMenu(false);
  }

  function handleViewLeaderboard() {
    if (return_url) {
      window.location.href = return_url;
    }
  }

  const theme = shellData?.config?.theme;
  const backgrounds = shellData?.config?.backgrounds;
  const screens = shellData?.config?.screens;

  const getBackground = () => {
    if (gameState === 'start' && backgrounds?.start) return backgrounds.start;
    if ((gameState === 'playing' || gameState === 'answered') && backgrounds?.game) return backgrounds.game;
    if (gameState === 'lead_form' && backgrounds?.lead) return backgrounds.lead;
    if (gameState === 'completed' && backgrounds?.end) return backgrounds.end;
    return backgrounds?.default || '#000000';
  };

  const spacingConfig = getSpacingConfig(screens?.game?.spacing, screens?.game?.custom_spacing_value);

  if (validationError) {
    return (
      <GameStage backgroundImage={getBackground()} overlayColor={theme?.overlay_tint || 'rgba(0,0,0,0.5)'}>
        <div className="flex flex-col h-full" style={{ fontFamily: theme?.font_family || 'inherit' }}>
          <StageBody className="flex flex-col items-center justify-center px-6">
            <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-sm">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-3 text-center">
                Invalid Game Link
              </h1>
              <p className="text-gray-600 text-center text-sm sm:text-base">
                {validationError}
              </p>
            </div>
          </StageBody>
        </div>
      </GameStage>
    );
  }

  if (gameState === 'start') {
    return (
      <GameStage backgroundImage={getBackground()} overlayColor={theme?.overlay_tint || 'rgba(0,0,0,0.5)'}>
        <div className="flex flex-col h-full" style={{ fontFamily: theme?.font_family || 'inherit' }}>
          <StageBody className="flex flex-col items-center justify-center px-6 text-center">
            <h1
              className="text-3xl sm:text-4xl font-bold mb-3"
              style={{ color: theme?.primary_text_color || '#ffffff' }}
            >
              {shellData?.config?.screens?.start?.headline || shellData?.topic || 'Ready to Play?'}
            </h1>
            <p
              className="mb-6 text-base sm:text-lg max-w-md"
              style={{ color: theme?.secondary_text_color || '#e5e7eb' }}
            >
              {screens?.start?.body || 'Test your knowledge!'}
            </p>
            <button
              onClick={startGame}
              disabled={loading}
              className="px-8 py-3 sm:py-4 text-base font-bold rounded-xl transition-transform disabled:opacity-50 active:scale-95"
              style={{
                backgroundColor: theme?.button_fill_color || '#3b82f6',
                color: theme?.button_text_color || '#ffffff',
              }}
            >
              {loading ? 'Starting...' : (screens?.start?.button_label || 'Start Quiz')}
            </button>
            {error && <p className="mt-4 text-red-600 text-center text-sm bg-white px-4 py-2 rounded-lg">{error}</p>}
          </StageBody>
        </div>
      </GameStage>
    );
  }

  if (gameState === 'lead_form') {
    const leadConfig = shellData?.config?.screens?.lead;
    const enabledFields = leadConfig?.fields?.filter(field => field.enabled !== false) || [];

    return (
      <GameStage backgroundImage={getBackground()} overlayColor={theme?.overlay_tint || 'rgba(0,0,0,0.5)'}>
        <div className="flex flex-col h-full" style={{ fontFamily: theme?.font_family || 'inherit' }}>
          <StageBody className="flex flex-col items-center justify-center px-6">
            <div className="w-full max-w-md">
              <h1
                className="text-2xl sm:text-3xl font-bold mb-6 text-center"
                style={{ color: theme?.primary_text_color || '#ffffff' }}
              >
                {leadConfig?.headline || 'Complete Your Entry'}
              </h1>

              <form onSubmit={handleLeadFormSubmit} className="space-y-4">
                {enabledFields.map((field) => (
                  <div key={field.name}>
                    <label
                      htmlFor={field.name}
                      className="block text-sm font-medium mb-2"
                      style={{ color: theme?.secondary_text_color || '#e5e7eb' }}
                    >
                      {field.label}
                      {field.required && <span className="text-red-400 ml-1">*</span>}
                    </label>
                    <input
                      type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
                      id={field.name}
                      name={field.name}
                      placeholder={field.placeholder}
                      value={leadFormData[field.name] || ''}
                      onChange={(e) => setLeadFormData({ ...leadFormData, [field.name]: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg bg-white/10 backdrop-blur-sm border-2 focus:outline-none focus:ring-2 transition-all"
                      style={{
                        borderColor: leadFormErrors[field.name] ? '#f56565' : 'rgba(255,255,255,0.2)',
                        color: theme?.primary_text_color || '#ffffff',
                      }}
                    />
                    {leadFormErrors[field.name] && (
                      <p className="mt-1 text-sm text-red-400">{leadFormErrors[field.name]}</p>
                    )}
                  </div>
                ))}

                {leadConfig?.terms?.enabled && (
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="terms"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      className="mt-1 w-4 h-4 rounded border-2 focus:ring-2 transition-all"
                      style={{
                        borderColor: leadFormErrors.terms ? '#f56565' : 'rgba(255,255,255,0.4)',
                      }}
                    />
                    <div>
                      <label
                        htmlFor="terms"
                        className="text-sm cursor-pointer"
                        style={{ color: theme?.secondary_text_color || '#e5e7eb' }}
                      >
                        {leadConfig.terms.text}
                        {leadConfig.terms.required && <span className="text-red-400 ml-1">*</span>}
                      </label>
                      {leadFormErrors.terms && (
                        <p className="mt-1 text-sm text-red-400">{leadFormErrors.terms}</p>
                      )}
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 sm:py-4 text-base font-bold rounded-xl transition-transform disabled:opacity-50 active:scale-95"
                  style={{
                    backgroundColor: theme?.button_fill_color || '#3b82f6',
                    color: theme?.button_text_color || '#ffffff',
                  }}
                >
                  {loading ? 'Submitting...' : (leadConfig?.submit_label || 'Submit')}
                </button>

                {error && (
                  <p className="text-red-400 text-center text-sm bg-white/10 backdrop-blur-sm px-4 py-2 rounded-lg">
                    {error}
                  </p>
                )}
              </form>
            </div>
          </StageBody>
        </div>
      </GameStage>
    );
  }

  if (gameState === 'completed' && completionData) {
    return (
      <GameStage backgroundImage={getBackground()} overlayColor={theme?.overlay_tint || 'rgba(0,0,0,0.5)'}>
        <div className="flex flex-col h-full" style={{ fontFamily: theme?.font_family || 'inherit' }}>
          <StageBody className="flex flex-col items-center justify-center px-6 text-center">
            <h1
              className="text-3xl sm:text-4xl font-bold mb-4"
              style={{ color: theme?.primary_text_color || '#ffffff' }}
            >
              Game Complete!
            </h1>
            <div className="mb-6">
              <p
                className="text-5xl sm:text-6xl font-bold mb-2"
                style={{ color: theme?.correct_feedback_accent || '#10b981' }}
              >
                {completionData.score}/{completionData.total}
              </p>
              <p
                className="text-2xl font-bold mb-2"
                style={{ color: theme?.correct_feedback_accent || '#10b981' }}
              >
                {completionData.percentage}%
              </p>
              <p
                className="text-lg sm:text-xl"
                style={{ color: theme?.secondary_text_color || '#e5e7eb' }}
              >
                {completionData.message}
              </p>
            </div>
            <div className="space-y-3 w-full max-w-sm">
              {return_url && (
                <button
                  onClick={handleViewLeaderboard}
                  className="w-full font-bold py-3 sm:py-4 px-6 rounded-xl transition-transform active:scale-95"
                  style={{
                    backgroundColor: theme?.button_fill_color || '#3b82f6',
                    color: theme?.button_text_color || '#ffffff',
                  }}
                >
                  View Live Leaderboard
                </button>
              )}
              {!return_url && completionData.cta?.enabled && (
                <button
                  className="w-full font-bold py-3 sm:py-4 px-6 rounded-xl transition-transform active:scale-95"
                  style={{
                    backgroundColor: theme?.button_fill_color || '#3b82f6',
                    color: theme?.button_text_color || '#ffffff',
                  }}
                >
                  {completionData.cta.label || 'Continue'}
                </button>
              )}
              {completionData.social_share?.enabled && (
                <button
                  onClick={handleShare}
                  className="w-full font-bold py-3 sm:py-4 px-6 rounded-xl transition-transform active:scale-95 flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    color: theme?.primary_text_color || '#ffffff',
                  }}
                >
                  <Share2 className="w-5 h-5" />
                  Share Results
                </button>
              )}
              <button
                onClick={resetGame}
                className="w-full font-bold py-3 sm:py-4 px-6 rounded-xl transition-transform active:scale-95"
                style={{
                  backgroundColor: theme?.correct_feedback_accent || '#10b981',
                  color: '#ffffff',
                }}
              >
                Play Again
              </button>
            </div>
          </StageBody>
        </div>

        {showShareMenu && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onClick={() => setShowShareMenu(false)}
          >
            <div
              className="w-full max-w-sm bg-white rounded-t-2xl p-4 pb-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
              <h3 className="text-base font-semibold text-gray-900 mb-4 text-center">Share Results</h3>
              <div className="space-y-2">
                <button
                  onClick={handleShareTwitter}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-gray-900">Share on X (Twitter)</span>
                </button>
                <button
                  onClick={handleShareFacebook}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-gray-900">Share on Facebook</span>
                </button>
                <button
                  onClick={handleCopyLink}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <Share2 className="w-5 h-5 text-gray-600" />
                  </div>
                  <span className="text-sm font-medium text-gray-900">Copy to clipboard</span>
                </button>
              </div>
              <button
                onClick={() => setShowShareMenu(false)}
                className="w-full mt-4 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </GameStage>
    );
  }

  return (
    <GameStage backgroundImage={getBackground()} overlayColor={theme?.overlay_tint || 'rgba(0,0,0,0.5)'}>
      <div className="flex flex-col h-full" style={{ fontFamily: theme?.font_family || 'Inter' }}>
        <StageHeader className="px-4 pt-3 pb-2" />

        <StageBody className="flex flex-col px-4">
          {gameState === 'playing' && currentQuestion && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-shrink-0 mb-3">
                <div
                  className="flex justify-between text-xs sm:text-sm mb-2"
                  style={{ color: theme?.secondary_text_color }}
                >
                  <span>Question {currentQuestionNum} of {totalQuestions}</span>
                  {timerMode !== 'none' && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {timeRemaining}s
                    </span>
                  )}
                </div>
                {screens?.game?.show_progress_bar !== false && (
                  <div className="w-full bg-gray-600 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full transition-all"
                      style={{
                        width: `${(currentQuestionNum / totalQuestions) * 100}%`,
                        backgroundColor: theme?.button_fill_color,
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="flex-1 flex flex-col justify-center min-h-0">
                <div className="flex flex-col flex-shrink-0">
                  <h2
                    className="text-lg sm:text-xl font-medium text-center flex-shrink-0"
                    style={{ color: theme?.primary_text_color }}
                  >
                    {currentQuestion.question_text}
                  </h2>

                  <div
                    className="game-spacer"
                    style={{
                      height: spacingConfig.spacerHeight,
                    }}
                  />

                  <div className={`${spacingConfig.answerGap} flex-shrink-0`}>
                    {currentQuestion.answers.map((answer: any) => {
                      const isSelected = selectedAnswer === answer.answer_id;
                      const showResult = feedback !== null;
                      const isCorrect = showResult && answer.answer_id === feedback.correct_answer_id;

                      let borderColor = 'rgba(255,255,255,0.2)';
                      let bgColor = 'transparent';

                      if (showResult) {
                        if (isCorrect) {
                          borderColor = theme?.correct_feedback_accent || '#48BB78';
                          bgColor = 'rgba(72, 187, 120, 0.2)';
                        } else if (isSelected && !isCorrect) {
                          borderColor = theme?.incorrect_feedback_accent || '#F56565';
                          bgColor = 'rgba(245, 101, 101, 0.2)';
                        }
                      } else if (isSelected) {
                        borderColor = theme?.button_fill_color || '#3182CE';
                        bgColor = 'rgba(255,255,255,0.1)';
                      }

                      return (
                        <button
                          key={answer.answer_id}
                          onClick={() => handleAnswerSelect(answer.answer_id)}
                          disabled={selectedAnswer !== '' || loading}
                          className={`w-full ${spacingConfig.answerPadding} rounded-lg text-center border-2 transition-all disabled:cursor-default text-sm sm:text-base`}
                          style={{
                            borderColor,
                            backgroundColor: bgColor,
                            color: theme?.primary_text_color,
                          }}
                        >
                          <div className="flex items-center justify-center gap-2">
                            <span>{answer.answer_text}</span>
                            {showResult && isCorrect && (
                              <CheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: theme?.correct_feedback_accent }} />
                            )}
                            {showResult && isSelected && !isCorrect && (
                              <XCircle className="w-5 h-5 flex-shrink-0" style={{ color: theme?.incorrect_feedback_accent }} />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {gameState === 'answered' && feedback && (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
              {lastAnswerCorrect ? (
                <CheckCircle
                  className="w-14 h-14 sm:w-16 sm:h-16 mb-4"
                  style={{ color: theme?.correct_feedback_accent }}
                />
              ) : (
                <XCircle
                  className="w-14 h-14 sm:w-16 sm:h-16 mb-4"
                  style={{ color: theme?.incorrect_feedback_accent }}
                />
              )}
              <h2
                className="text-xl sm:text-2xl font-bold mb-3"
                style={{ color: theme?.primary_text_color }}
              >
                {lastAnswerCorrect
                  ? (screens?.feedback?.correct_headline || 'Correct!')
                  : (screens?.feedback?.incorrect_headline || 'Incorrect')}
              </h2>
              {screens?.feedback?.show_explanation && feedback.explanation && (
                <p
                  className="text-sm sm:text-base mb-6 max-w-sm"
                  style={{ color: theme?.secondary_text_color }}
                >
                  {feedback.explanation}
                </p>
              )}
              <button
                onClick={moveToNext}
                disabled={loading}
                className="px-6 py-3 font-medium rounded-lg transition-transform active:scale-95"
                style={{
                  backgroundColor: theme?.button_fill_color,
                  color: theme?.button_text_color,
                }}
              >
                {loading ? 'Loading...' : (feedback?.is_last_question ? 'See Results' : 'Next Question')}
              </button>
            </div>
          )}

          {error && <p className="mt-4 text-red-600 text-center text-sm bg-white px-4 py-2 rounded-lg">{error}</p>}
        </StageBody>

        <StageFooter className="pb-4" />
      </div>
    </GameStage>
  );
}
