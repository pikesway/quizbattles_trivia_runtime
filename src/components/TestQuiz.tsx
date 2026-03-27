import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface TestQuizProps {
  token: string;
}

interface ShellConfig {
  theme: {
    font_family: string;
    primary_text_color: string;
    secondary_text_color: string;
    button_fill_color: string;
    button_text_color: string;
    overlay_tint: string;
    correct_feedback_accent: string;
    incorrect_feedback_accent: string;
  };
  backgrounds: {
    default: string;
    start: string | null;
    game: string | null;
    end: string | null;
  };
  screens: {
    start: { headline: string; body: string; button_label: string };
    game: { show_progress_bar: boolean; show_question_number: boolean };
    end: { headline_template: string; show_score_breakdown: boolean };
    feedback: { correct_headline: string; incorrect_headline: string; show_explanation: boolean };
  };
  score_range_messages: Array<{ min: number; max: number; message: string }>;
}

interface Shell {
  id: string;
  internal_name: string;
  default_timer_mode: string;
  default_timer_seconds: number;
  default_question_count: number;
  default_difficulty_mix: { easy: number; medium: number; hard: number };
  default_selection_mode: string;
  is_start_screen_enabled: boolean;
  topic: string;
  tags: string[];
  config: ShellConfig;
}

interface Question {
  id: string;
  question_text: string;
  explanation: string;
  answers: Array<{
    id: string;
    answer_text: string;
    is_correct: boolean;
  }>;
}

interface TestSession {
  id: string;
  shell_id: string;
  status: string;
  score: number;
  total_questions: number;
  correct_answers: number;
  question_set: Question[];
  config: ShellConfig;
  current_index: number;
  current_question_started_at: string | null;
}

type Screen = 'loading' | 'error' | 'start' | 'game' | 'feedback' | 'end';

export function TestQuiz({ token }: TestQuizProps) {
  const [screen, setScreen] = useState<Screen>('loading');
  const [error, setError] = useState<string>('');
  const [shell, setShell] = useState<Shell | null>(null);
  const [session, setSession] = useState<TestSession | null>(null);
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null);
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [timerActive, setTimerActive] = useState(false);

  const loadTestData = useCallback(async () => {
    try {
      const { data: tokenData, error: tokenError } = await supabase
        .from('trivia_test_tokens')
        .select('*')
        .eq('token', token)
        .eq('is_active', true)
        .maybeSingle();

      if (tokenError) throw tokenError;
      if (!tokenData) {
        setError('Invalid or expired test link');
        setScreen('error');
        return;
      }

      if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
        setError('This test link has expired');
        setScreen('error');
        return;
      }

      const { data: shellData, error: shellError } = await supabase
        .from('trivia_shells')
        .select('*')
        .eq('id', tokenData.shell_id)
        .single();

      if (shellError) throw shellError;
      if (!shellData) {
        setError('Shell not found');
        setScreen('error');
        return;
      }

      setShell(shellData);
      setScreen(shellData.is_start_screen_enabled ? 'start' : 'game');

      if (!shellData.is_start_screen_enabled) {
        await startTestSession(shellData, tokenData.id);
      }
    } catch (err) {
      setError((err as Error).message);
      setScreen('error');
    }
  }, [token]);

  useEffect(() => {
    loadTestData();
  }, [loadTestData]);

  useEffect(() => {
    if (!timerActive || timeRemaining <= 0) return;

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
  }, [timerActive, timeRemaining]);

  async function startTestSession(shellData: Shell, tokenId: string) {
    const questions = await selectQuestions(shellData);

    if (questions.length === 0) {
      setError('No questions available for this quiz');
      setScreen('error');
      return;
    }

    const { data: newSession, error: sessionError } = await supabase
      .from('trivia_test_sessions')
      .insert({
        shell_id: shellData.id,
        test_token_id: tokenId,
        status: 'in_progress',
        total_questions: questions.length,
        question_set: questions,
        config: shellData.config,
        current_index: 0,
        current_question_started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (sessionError) throw sessionError;

    setSession(newSession);
    setTimeRemaining(shellData.default_timer_seconds);
    setTimerActive(true);
    setScreen('game');
  }

  async function selectQuestions(shellData: Shell): Promise<Question[]> {
    const count = shellData.default_question_count;
    const mix = shellData.default_difficulty_mix;

    const easyCount = Math.round((mix.easy / 100) * count);
    const hardCount = Math.round((mix.hard / 100) * count);
    const mediumCount = count - easyCount - hardCount;

    const questions: Question[] = [];

    for (const [level, needed] of [['easy', easyCount], ['medium', mediumCount], ['hard', hardCount]] as const) {
      if (needed <= 0) continue;

      let query = supabase
        .from('trivia_questions')
        .select('id, question_text, explanation')
        .eq('is_active', true)
        .eq('review_state', 'approved')
        .eq('difficulty_level', level);

      if (shellData.topic) {
        query = query.eq('topic', shellData.topic);
      }

      const { data: levelQuestions } = await query.limit(needed * 3);

      if (levelQuestions && levelQuestions.length > 0) {
        const shuffled = levelQuestions.sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, needed);

        for (const q of selected) {
          const { data: answers } = await supabase
            .from('trivia_answers')
            .select('id, answer_text, is_correct')
            .eq('question_id', q.id)
            .order('display_order');

          questions.push({
            ...q,
            answers: (answers || []).sort(() => Math.random() - 0.5),
          });
        }
      }
    }

    return questions.sort(() => Math.random() - 0.5);
  }

  async function handleStartClick() {
    if (!shell) return;

    const { data: tokenData } = await supabase
      .from('trivia_test_tokens')
      .select('id')
      .eq('token', token)
      .single();

    if (tokenData) {
      await startTestSession(shell, tokenData.id);
    }
  }

  async function handleAnswerSelect(answerId: string) {
    if (!session || selectedAnswerId) return;

    setSelectedAnswerId(answerId);
    setTimerActive(false);

    const currentQuestion = session.question_set[session.current_index];
    const selectedAnswer = currentQuestion.answers.find(a => a.id === answerId);
    const isCorrect = selectedAnswer?.is_correct || false;

    setLastAnswerCorrect(isCorrect);

    await supabase.from('trivia_test_session_answers').insert({
      test_session_id: session.id,
      question_id: currentQuestion.id,
      selected_answer_id: answerId,
      is_correct: isCorrect,
      time_to_answer_ms: (shell?.default_timer_seconds || 15) * 1000 - timeRemaining * 1000,
    });

    const newScore = session.score + (isCorrect ? 100 : 0);
    const newCorrect = session.correct_answers + (isCorrect ? 1 : 0);

    await supabase
      .from('trivia_test_sessions')
      .update({
        score: newScore,
        correct_answers: newCorrect,
      })
      .eq('id', session.id);

    setSession(prev => prev ? {
      ...prev,
      score: newScore,
      correct_answers: newCorrect,
    } : null);

    if (session.config.screens.feedback.show_explanation) {
      setScreen('feedback');
    } else {
      setTimeout(() => moveToNext(), 500);
    }
  }

  function handleTimeUp() {
    if (!session || selectedAnswerId) return;
    setTimerActive(false);
    setLastAnswerCorrect(false);

    const currentQuestion = session.question_set[session.current_index];

    supabase.from('trivia_test_session_answers').insert({
      test_session_id: session.id,
      question_id: currentQuestion.id,
      selected_answer_id: null,
      is_correct: false,
      time_to_answer_ms: (shell?.default_timer_seconds || 15) * 1000,
    });

    if (session.config.screens.feedback.show_explanation) {
      setScreen('feedback');
    } else {
      moveToNext();
    }
  }

  async function moveToNext() {
    if (!session || !shell) return;

    const nextIndex = session.current_index + 1;

    if (nextIndex >= session.question_set.length) {
      await supabase
        .from('trivia_test_sessions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', session.id);

      setSession(prev => prev ? { ...prev, status: 'completed' } : null);
      setScreen('end');
    } else {
      await supabase
        .from('trivia_test_sessions')
        .update({
          current_index: nextIndex,
          current_question_started_at: new Date().toISOString(),
        })
        .eq('id', session.id);

      setSession(prev => prev ? { ...prev, current_index: nextIndex } : null);
      setSelectedAnswerId(null);
      setLastAnswerCorrect(null);
      setTimeRemaining(shell.default_timer_seconds);
      setTimerActive(true);
      setScreen('game');
    }
  }

  const config = session?.config || shell?.config;
  const theme = config?.theme;
  const backgrounds = config?.backgrounds;
  const screens = config?.screens;

  const getBackground = () => {
    if (screen === 'start' && backgrounds?.start) return backgrounds.start;
    if ((screen === 'game' || screen === 'feedback') && backgrounds?.game) return backgrounds.game;
    if (screen === 'end' && backgrounds?.end) return backgrounds.end;
    return backgrounds?.default || 'https://images.pexels.com/photos/1939485/pexels-photo-1939485.jpeg';
  };

  if (screen === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-white text-center">
          <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full mx-auto mb-4" />
          <p>Loading test quiz...</p>
        </div>
      </div>
    );
  }

  if (screen === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <div className="bg-white rounded-lg p-6 max-w-md text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Unable to Load Quiz</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundImage: `url(${getBackground()})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        fontFamily: theme?.font_family || 'Inter',
      }}
    >
      <div className="absolute top-4 left-4 z-10">
        <span className="px-3 py-1 bg-orange-500 text-white text-xs font-medium rounded-full">
          TEST MODE
        </span>
      </div>

      <div
        className="flex-1 flex flex-col items-center justify-center p-4"
        style={{ backgroundColor: theme?.overlay_tint || 'rgba(0,0,0,0.5)' }}
      >
        {screen === 'start' && screens && (
          <div className="text-center max-w-md">
            <h1
              className="text-3xl font-bold mb-4"
              style={{ color: theme?.primary_text_color }}
            >
              {screens.start.headline}
            </h1>
            <p
              className="text-lg mb-8"
              style={{ color: theme?.secondary_text_color }}
            >
              {screens.start.body}
            </p>
            <button
              onClick={handleStartClick}
              className="px-8 py-3 text-lg font-medium rounded-lg transition-transform hover:scale-105"
              style={{
                backgroundColor: theme?.button_fill_color,
                color: theme?.button_text_color,
              }}
            >
              {screens.start.button_label}
            </button>
          </div>
        )}

        {screen === 'game' && session && (
          <div className="w-full max-w-lg">
            <div className="mb-6">
              <div
                className="flex justify-between text-sm mb-2"
                style={{ color: theme?.secondary_text_color }}
              >
                <span>Question {session.current_index + 1} of {session.total_questions}</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {timeRemaining}s
                </span>
              </div>
              {screens?.game.show_progress_bar && (
                <div className="w-full bg-gray-600 rounded-full h-2">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${((session.current_index + 1) / session.total_questions) * 100}%`,
                      backgroundColor: theme?.button_fill_color,
                    }}
                  />
                </div>
              )}
            </div>

            <h2
              className="text-xl font-medium mb-6"
              style={{ color: theme?.primary_text_color }}
            >
              {session.question_set[session.current_index].question_text}
            </h2>

            <div className="space-y-3">
              {session.question_set[session.current_index].answers.map(answer => {
                const isSelected = selectedAnswerId === answer.id;
                const showResult = selectedAnswerId !== null;
                const isCorrect = answer.is_correct;

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
                    key={answer.id}
                    onClick={() => handleAnswerSelect(answer.id)}
                    disabled={selectedAnswerId !== null}
                    className="w-full p-4 rounded-lg text-left border-2 transition-all disabled:cursor-default"
                    style={{
                      borderColor,
                      backgroundColor: bgColor,
                      color: theme?.primary_text_color,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span>{answer.answer_text}</span>
                      {showResult && isCorrect && (
                        <CheckCircle className="w-5 h-5" style={{ color: theme?.correct_feedback_accent }} />
                      )}
                      {showResult && isSelected && !isCorrect && (
                        <XCircle className="w-5 h-5" style={{ color: theme?.incorrect_feedback_accent }} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {screen === 'feedback' && session && screens && (
          <div className="text-center max-w-md">
            {lastAnswerCorrect ? (
              <CheckCircle
                className="w-16 h-16 mx-auto mb-4"
                style={{ color: theme?.correct_feedback_accent }}
              />
            ) : (
              <XCircle
                className="w-16 h-16 mx-auto mb-4"
                style={{ color: theme?.incorrect_feedback_accent }}
              />
            )}
            <h2
              className="text-2xl font-bold mb-4"
              style={{ color: theme?.primary_text_color }}
            >
              {lastAnswerCorrect
                ? screens.feedback.correct_headline
                : screens.feedback.incorrect_headline}
            </h2>
            {screens.feedback.show_explanation && session.question_set[session.current_index].explanation && (
              <p
                className="mb-6"
                style={{ color: theme?.secondary_text_color }}
              >
                {session.question_set[session.current_index].explanation}
              </p>
            )}
            <button
              onClick={moveToNext}
              className="px-6 py-3 font-medium rounded-lg"
              style={{
                backgroundColor: theme?.button_fill_color,
                color: theme?.button_text_color,
              }}
            >
              {session.current_index + 1 >= session.total_questions ? 'See Results' : 'Next Question'}
            </button>
          </div>
        )}

        {screen === 'end' && session && screens && (
          <div className="text-center max-w-md">
            <h2
              className="text-3xl font-bold mb-4"
              style={{ color: theme?.primary_text_color }}
            >
              {screens.end.headline_template
                .replace('{score}', String(session.correct_answers))
                .replace('{total}', String(session.total_questions))}
            </h2>
            <p
              className="text-5xl font-bold mb-4"
              style={{ color: theme?.correct_feedback_accent }}
            >
              {Math.round((session.correct_answers / session.total_questions) * 100)}%
            </p>
            {config?.score_range_messages && (
              <p
                className="text-lg mb-8"
                style={{ color: theme?.secondary_text_color }}
              >
                {config.score_range_messages.find(
                  m => {
                    const pct = Math.round((session.correct_answers / session.total_questions) * 100);
                    return pct >= m.min && pct <= m.max;
                  }
                )?.message || 'Great job!'}
              </p>
            )}
            {screens.end.show_score_breakdown && (
              <div
                className="p-4 rounded-lg mb-6"
                style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
              >
                <p style={{ color: theme?.secondary_text_color }}>
                  Correct: {session.correct_answers} | Wrong: {session.total_questions - session.correct_answers}
                </p>
              </div>
            )}
            <p
              className="text-sm"
              style={{ color: theme?.secondary_text_color }}
            >
              This was a test session. Results are not recorded.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
