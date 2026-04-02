import { useState, useEffect } from 'react';
import { Share2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { GameStage, StageHeader, StageBody, StageFooter } from './runtime/GameStage';
import {
  StartSessionResponse,
  NextQuestionResponse,
  SubmitAnswerResponse,
  CompleteSessionResponse,
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
      return { spacerHeight: height, answerGap: 'space-y-1.5' };
    } else if (height >= 32) {
      return { spacerHeight: height, answerGap: 'space-y-4' };
    }
    return { spacerHeight: height, answerGap: 'space-y-2 sm:space-y-3' };
  }
  switch (spacing) {
    case 'compact':
      return { spacerHeight: SPACING_PRESETS.compact, answerGap: 'space-y-1.5' };
    case 'spacious':
      return { spacerHeight: SPACING_PRESETS.spacious, answerGap: 'space-y-4' };
    default:
      return { spacerHeight: SPACING_PRESETS.comfortable, answerGap: 'space-y-2 sm:space-y-3' };
  }
}

const SPACING_CONFIG = getSpacingConfig('comfortable');

type GameState = 'start' | 'playing' | 'answered' | 'completed';

interface TriviaGameProps {
  campaign_id?: string;
  template_id?: string;
  return_url?: string;
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
      end?: string | null;
    };
    screens?: {
      start?: { headline?: string; body?: string; button_label?: string };
      game?: { show_progress_bar?: boolean; show_question_number?: boolean; spacing?: GameScreenSpacing; custom_spacing_value?: number };
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

      setGameState('playing');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function submitAnswer() {
    if (!selectedAnswer) return;

    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.functions.invoke('trivia-answer', {
        body: {
          session_id: sessionId,
          selected_answer_id: selectedAnswer,
        },
      });

      if (error) throw error;

      if (!data.success) {
        setError(data.error || 'Failed to submit answer');
        return;
      }

      const response = data.data as SubmitAnswerResponse;
      setFeedback(response);
      setGameState('answered');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function nextQuestion() {
    if (feedback?.is_last_question) {
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
    if (gameState === 'completed' && backgrounds?.end) return backgrounds.end;
    return backgrounds?.default || 'https://images.pexels.com/photos/1939485/pexels-photo-1939485.jpeg';
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
              {screens?.start?.headline || shellData?.internal_name || 'Trivia Challenge'}
            </h1>
            <p
              className="mb-6 text-base sm:text-lg max-w-md"
              style={{ color: theme?.secondary_text_color || '#e5e7eb' }}
            >
              {screens?.start?.body || shellData?.topic || 'Test your knowledge across various topics!'}
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
      <div className="flex flex-col h-full" style={{ fontFamily: theme?.font_family || 'inherit' }}>
        <StageHeader className="px-4 pt-4">
          <div
            className="rounded-xl p-3 backdrop-blur-sm"
            style={{ backgroundColor: 'rgba(255,255,255,0.9)' }}
          >
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs sm:text-sm font-medium text-gray-600">
                Question {currentQuestionNum} of {totalQuestions}
              </span>
              {feedback && (
                <span className="text-xs sm:text-sm font-bold text-gray-800">Score: {feedback.score}</span>
              )}
            </div>
            {screens?.game?.show_progress_bar !== false && (
              <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2">
                <div
                  className="h-1.5 sm:h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${(currentQuestionNum / totalQuestions) * 100}%`,
                    backgroundColor: theme?.button_fill_color || '#3b82f6',
                  }}
                />
              </div>
            )}
          </div>
        </StageHeader>

        <StageBody className="flex flex-col px-4 py-4">
          {currentQuestion && (
            <div
              className="rounded-2xl p-4 sm:p-6 flex-1 flex flex-col min-h-0 backdrop-blur-sm"
              style={{ backgroundColor: 'rgba(255,255,255,0.95)' }}
            >
              {gameState === 'playing' && (
                <div className="flex-1 flex flex-col justify-center min-h-0">
                  <div className="flex flex-col flex-shrink-0">
                    <h2 className="text-lg sm:text-xl font-bold text-gray-800 text-center flex-shrink-0">
                      {currentQuestion.question_text}
                    </h2>

                    <div
                      className="game-spacer"
                      style={{
                        height: spacingConfig.spacerHeight,
                      }}
                    />

                    <div className={`${spacingConfig.answerGap} flex-shrink-0`}>
                      {currentQuestion.answers.map((answer: any) => (
                        <button
                          key={answer.answer_id}
                          onClick={() => setSelectedAnswer(answer.answer_id)}
                          className="w-full text-center p-3 sm:p-4 rounded-xl border-2 transition duration-200 text-sm sm:text-base"
                          style={{
                            borderColor: selectedAnswer === answer.answer_id
                              ? (theme?.button_fill_color || '#3b82f6')
                              : '#e5e7eb',
                            backgroundColor: selectedAnswer === answer.answer_id
                              ? 'rgba(59, 130, 246, 0.1)'
                              : 'transparent',
                          }}
                        >
                          {answer.answer_text}
                        </button>
                      ))}
                    </div>

                    <div
                      className="game-spacer"
                      style={{
                        height: spacingConfig.spacerHeight,
                      }}
                    />

                    <button
                      onClick={submitAnswer}
                      disabled={!selectedAnswer || loading}
                      className="w-full font-bold py-3 sm:py-4 px-6 rounded-xl transition-transform disabled:opacity-50 flex-shrink-0 active:scale-95"
                      style={{
                        backgroundColor: theme?.button_fill_color || '#3b82f6',
                        color: theme?.button_text_color || '#ffffff',
                      }}
                    >
                      {loading ? 'Submitting...' : 'Submit Answer'}
                    </button>
                  </div>
                </div>
              )}

              {gameState === 'answered' && feedback && (
                <div className="flex-1 flex flex-col justify-center min-h-0">
                  <div className="flex flex-col flex-shrink-0">
                    <h2 className="text-lg sm:text-xl font-bold text-gray-800 text-center flex-shrink-0">
                      {currentQuestion.question_text}
                    </h2>

                    <div
                      className="game-spacer"
                      style={{
                        height: spacingConfig.spacerHeight,
                      }}
                    />

                    <div
                      className="p-4 rounded-xl"
                      style={{
                        backgroundColor: feedback.correct
                          ? 'rgba(72, 187, 120, 0.15)'
                          : 'rgba(245, 101, 101, 0.15)',
                      }}
                    >
                      <p
                        className="font-bold text-base sm:text-lg mb-2"
                        style={{
                          color: feedback.correct
                            ? (theme?.correct_feedback_accent || '#16a34a')
                            : (theme?.incorrect_feedback_accent || '#dc2626'),
                        }}
                      >
                        {feedback.correct ? 'Correct!' : 'Incorrect'}
                      </p>
                      <p className="text-gray-700 text-sm sm:text-base">{feedback.explanation}</p>
                    </div>

                    <div
                      className="game-spacer"
                      style={{
                        height: spacingConfig.spacerHeight,
                      }}
                    />

                    <button
                      onClick={nextQuestion}
                      disabled={loading}
                      className="w-full font-bold py-3 sm:py-4 px-6 rounded-xl transition-transform flex-shrink-0 active:scale-95"
                      style={{
                        backgroundColor: theme?.button_fill_color || '#3b82f6',
                        color: theme?.button_text_color || '#ffffff',
                      }}
                    >
                      {loading ? 'Loading...' : feedback?.is_last_question ? 'View Results' : 'Next Question'}
                    </button>
                  </div>
                </div>
              )}

              {error && <p className="mt-4 text-red-600 text-center text-sm bg-white px-4 py-2 rounded-lg">{error}</p>}
            </div>
          )}
        </StageBody>

        <StageFooter className="pb-4" />
      </div>
    </GameStage>
  );
}
