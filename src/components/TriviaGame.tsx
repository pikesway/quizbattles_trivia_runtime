import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { GameStage, StageHeader, StageBody, StageFooter } from './runtime/GameStage';
import {
  StartSessionResponse,
  NextQuestionResponse,
  SubmitAnswerResponse,
  CompleteSessionResponse,
} from '../types/trivia';

type GameState = 'start' | 'playing' | 'answered' | 'completed';

export function TriviaGame() {
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

  async function startGame() {
    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.functions.invoke('trivia-start', {
        body: {
          campaign_id: 'demo-campaign',
          campaign_game_instance_id: 'demo-instance',
        },
      });

      if (error) throw error;

      const response = data.data as StartSessionResponse;
      setSessionId(response.session_id);
      setCurrentQuestion(response.question);
      setTotalQuestions(response.total_questions);
      setCurrentQuestionNum(response.current_question);
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
      const hashtags = (completionData.social_share.hashtags || []).join(',');
      const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}${hashtags ? `&hashtags=${encodeURIComponent(hashtags)}` : ''}`;
      window.open(twitterUrl, '_blank', 'width=550,height=420');
    }
  }

  const getBackgroundGradient = () => {
    if (gameState === 'start') return 'linear-gradient(to bottom right, #3B82F6, #2563EB)';
    if (gameState === 'completed') return 'linear-gradient(to bottom right, #10B981, #059669)';
    return 'linear-gradient(to bottom right, #3B82F6, #2563EB)';
  };

  if (gameState === 'start') {
    return (
      <GameStage>
        <div
          className="flex flex-col h-full"
          style={{ background: getBackgroundGradient() }}
        >
          <StageBody className="flex flex-col items-center justify-center px-6">
            <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-sm">
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-3 text-center">
                Trivia Challenge
              </h1>
              <p className="text-gray-600 mb-6 text-center text-sm sm:text-base">
                Test your knowledge across various topics!
              </p>
              <button
                onClick={startGame}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 sm:py-4 px-6 rounded-xl transition duration-200 disabled:opacity-50 active:scale-95"
              >
                {loading ? 'Starting...' : 'Start Game'}
              </button>
              {error && <p className="mt-4 text-red-600 text-center text-sm">{error}</p>}
            </div>
          </StageBody>
        </div>
      </GameStage>
    );
  }

  if (gameState === 'completed' && completionData) {
    return (
      <GameStage>
        <div
          className="flex flex-col h-full"
          style={{ background: getBackgroundGradient() }}
        >
          <StageBody className="flex flex-col items-center justify-center px-6">
            <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-sm text-center">
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-4">Game Complete!</h1>
              <div className="mb-4">
                <p className="text-5xl sm:text-6xl font-bold text-green-600 mb-2">
                  {completionData.score}/{completionData.total}
                </p>
                <p className="text-2xl font-bold text-green-500 mb-2">
                  {completionData.percentage}%
                </p>
                <p className="text-lg sm:text-xl text-gray-700">{completionData.message}</p>
              </div>
              <div className="space-y-3">
                {completionData.cta?.enabled && (
                  <button
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 sm:py-4 px-6 rounded-xl transition duration-200 active:scale-95"
                  >
                    {completionData.cta.label || 'Continue'}
                  </button>
                )}
                {completionData.social_share?.enabled && (
                  <button
                    onClick={handleShare}
                    className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 sm:py-4 px-6 rounded-xl transition duration-200 active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Share2 className="w-5 h-5" />
                    Share Results
                  </button>
                )}
                <button
                  onClick={resetGame}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 sm:py-4 px-6 rounded-xl transition duration-200 active:scale-95"
                >
                  Play Again
                </button>
              </div>
            </div>
          </StageBody>
        </div>
      </GameStage>
    );
  }

  return (
    <GameStage>
      <div
        className="flex flex-col h-full"
        style={{ background: getBackgroundGradient() }}
      >
        <StageHeader className="px-4 pt-4">
          <div className="bg-white rounded-xl p-3 shadow-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs sm:text-sm font-medium text-gray-600">
                Question {currentQuestionNum} of {totalQuestions}
              </span>
              {feedback && (
                <span className="text-xs sm:text-sm font-bold text-gray-800">Score: {feedback.score}</span>
              )}
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2">
              <div
                className="bg-blue-600 h-1.5 sm:h-2 rounded-full transition-all duration-300"
                style={{ width: `${(currentQuestionNum / totalQuestions) * 100}%` }}
              />
            </div>
          </div>
        </StageHeader>

        <StageBody className="flex flex-col px-4 py-4">
          {currentQuestion && (
            <div className="bg-white rounded-2xl shadow-2xl p-4 sm:p-6 flex-1 flex flex-col min-h-0">
              <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 flex-shrink-0 text-center">
                {currentQuestion.question_text}
              </h2>

              {gameState === 'playing' && (
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="flex-1 overflow-y-auto space-y-2 sm:space-y-3 mb-4">
                    {currentQuestion.answers.map((answer: any) => (
                      <button
                        key={answer.answer_id}
                        onClick={() => setSelectedAnswer(answer.answer_id)}
                        className={`w-full text-center p-3 sm:p-4 rounded-xl border-2 transition duration-200 text-sm sm:text-base ${
                          selectedAnswer === answer.answer_id
                            ? 'border-blue-600 bg-blue-50'
                            : 'border-gray-200 hover:border-blue-300'
                        }`}
                      >
                        {answer.answer_text}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={submitAnswer}
                    disabled={!selectedAnswer || loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 sm:py-4 px-6 rounded-xl transition duration-200 disabled:opacity-50 flex-shrink-0 active:scale-95"
                  >
                    {loading ? 'Submitting...' : 'Submit Answer'}
                  </button>
                </div>
              )}

              {gameState === 'answered' && feedback && (
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="flex-1 overflow-y-auto mb-4">
                    <div className={`p-4 rounded-xl ${feedback.correct ? 'bg-green-100' : 'bg-red-100'}`}>
                      <p className={`font-bold text-base sm:text-lg mb-2 ${feedback.correct ? 'text-green-800' : 'text-red-800'}`}>
                        {feedback.correct ? 'Correct!' : 'Incorrect'}
                      </p>
                      <p className="text-gray-700 text-sm sm:text-base">{feedback.explanation}</p>
                    </div>
                  </div>
                  <button
                    onClick={nextQuestion}
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 sm:py-4 px-6 rounded-xl transition duration-200 flex-shrink-0 active:scale-95"
                  >
                    {loading ? 'Loading...' : feedback?.is_last_question ? 'View Results' : 'Next Question'}
                  </button>
                </div>
              )}

              {error && <p className="mt-4 text-red-600 text-center text-sm">{error}</p>}
            </div>
          )}
        </StageBody>

        <StageFooter className="pb-4" />
      </div>
    </GameStage>
  );
}
