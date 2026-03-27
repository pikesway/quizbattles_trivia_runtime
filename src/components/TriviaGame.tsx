import { useState } from 'react';
import { supabase } from '../lib/supabase';
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

  if (gameState === 'start') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <h1 className="text-4xl font-bold text-gray-800 mb-4 text-center">Trivia Challenge</h1>
          <p className="text-gray-600 mb-8 text-center">Test your knowledge across various topics!</p>
          <button
            onClick={startGame}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-xl transition duration-200 disabled:opacity-50"
          >
            {loading ? 'Starting...' : 'Start Game'}
          </button>
          {error && <p className="mt-4 text-red-600 text-center">{error}</p>}
        </div>
      </div>
    );
  }

  if (gameState === 'completed' && completionData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">Game Complete!</h1>
          <div className="mb-6">
            <p className="text-6xl font-bold text-green-600 mb-2">
              {completionData.score}/{completionData.total}
            </p>
            <p className="text-xl text-gray-700">{completionData.message}</p>
          </div>
          <button
            onClick={resetGame}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-xl transition duration-200"
          >
            Play Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-pink-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-2xl w-full">
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-600">
              Question {currentQuestionNum} of {totalQuestions}
            </span>
            {feedback && (
              <span className="text-sm font-bold text-gray-800">Score: {feedback.score}</span>
            )}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(currentQuestionNum / totalQuestions) * 100}%` }}
            />
          </div>
        </div>

        {currentQuestion && (
          <>
            <h2 className="text-2xl font-bold text-gray-800 mb-6">{currentQuestion.question_text}</h2>

            {gameState === 'playing' && (
              <div className="space-y-3 mb-6">
                {currentQuestion.answers.map((answer: any) => (
                  <button
                    key={answer.answer_id}
                    onClick={() => setSelectedAnswer(answer.answer_id)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition duration-200 ${
                      selectedAnswer === answer.answer_id
                        ? 'border-indigo-600 bg-indigo-50'
                        : 'border-gray-200 hover:border-indigo-300'
                    }`}
                  >
                    {answer.answer_text}
                  </button>
                ))}
              </div>
            )}

            {gameState === 'answered' && feedback && (
              <div className="mb-6">
                <div className={`p-4 rounded-xl mb-4 ${feedback.correct ? 'bg-green-100' : 'bg-red-100'}`}>
                  <p className={`font-bold text-lg mb-2 ${feedback.correct ? 'text-green-800' : 'text-red-800'}`}>
                    {feedback.correct ? '✓ Correct!' : '✗ Incorrect'}
                  </p>
                  <p className="text-gray-700">{feedback.explanation}</p>
                </div>
              </div>
            )}
          </>
        )}

        {gameState === 'playing' && (
          <button
            onClick={submitAnswer}
            disabled={!selectedAnswer || loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-6 rounded-xl transition duration-200 disabled:opacity-50"
          >
            {loading ? 'Submitting...' : 'Submit Answer'}
          </button>
        )}

        {gameState === 'answered' && (
          <button
            onClick={nextQuestion}
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-6 rounded-xl transition duration-200"
          >
            {loading ? 'Loading...' : feedback?.is_last_question ? 'View Results' : 'Next Question'}
          </button>
        )}

        {error && <p className="mt-4 text-red-600 text-center">{error}</p>}
      </div>
    </div>
  );
}
