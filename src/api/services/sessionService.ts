import { SessionRepository } from '../repositories/sessionRepository';
import { QuestionService } from './questionService';
import {
  GameInstanceConfig,
  StartSessionResponse,
  NextQuestionResponse,
  SubmitAnswerResponse,
  CompleteSessionResponse,
  QuestionSnapshot,
} from '../../types/trivia';

export class SessionService {
  private sessionRepo: SessionRepository;
  private questionService: QuestionService;

  constructor() {
    this.sessionRepo = new SessionRepository();
    this.questionService = new QuestionService();
  }

  async startSession(
    campaignId: string,
    campaignGameInstanceId: string,
    leadId: string | undefined,
    config: GameInstanceConfig
  ): Promise<StartSessionResponse> {
    const questionSet = await this.questionService.buildQuestionSet(config);

    const session = await this.sessionRepo.createSession({
      campaign_id: campaignId,
      campaign_game_instance_id: campaignGameInstanceId,
      lead_id: leadId || null,
      status: 'in_progress',
      score: 0,
      total_questions: config.question_count,
      correct_answers: 0,
      timer_mode: config.timer.mode,
      timer_seconds: config.timer.seconds,
      question_set: questionSet as any,
      current_index: 0,
      started_at: new Date().toISOString(),
      config: config as any,
      current_question_started_at: new Date().toISOString(),
    });

    const firstQuestion = questionSet[0];
    const shuffledAnswers = this.questionService.shuffleAnswers(
      firstQuestion.answers.map(a => ({ answer_id: a.answer_id, answer_text: a.answer_text }))
    );

    return {
      session_id: session.id,
      question: {
        question_text: firstQuestion.question_text,
        answers: shuffledAnswers,
      },
      ui: config.ui,
      lead_capture: config.lead_capture,
      timer: config.timer,
      total_questions: config.question_count,
      current_question: 1,
    };
  }

  async getSession(sessionId: string) {
    return this.sessionRepo.getSession(sessionId);
  }

  async getNextQuestion(sessionId: string): Promise<NextQuestionResponse> {
    const session = await this.sessionRepo.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.status !== 'in_progress') {
      throw new Error('Session is not in progress');
    }

    const questionSet = session.question_set as unknown as QuestionSnapshot[];

    if (session.current_index >= questionSet.length) {
      throw new Error('No more questions available');
    }

    const question = questionSet[session.current_index];
    const shuffledAnswers = this.questionService.shuffleAnswers(
      question.answers.map(a => ({ answer_id: a.answer_id, answer_text: a.answer_text }))
    );

    await this.sessionRepo.updateSession(sessionId, {
      current_question_started_at: new Date().toISOString(),
    });

    const response: NextQuestionResponse = {
      question: {
        question_text: question.question_text,
        answers: shuffledAnswers,
      },
      current_question: session.current_index + 1,
      total_questions: session.total_questions,
    };

    if (session.timer_mode === 'per_quiz') {
      const elapsed = Date.now() - new Date(session.started_at).getTime();
      const totalTime = session.timer_seconds * 1000;
      response.remaining_time_ms = Math.max(0, totalTime - elapsed);
    } else if (session.timer_mode === 'per_question') {
      response.remaining_time_ms = session.timer_seconds * 1000;
    }

    return response;
  }

  async submitAnswer(
    sessionId: string,
    selectedAnswerId: string,
    timeToAnswerMs: number = 0
  ): Promise<SubmitAnswerResponse> {
    const session = await this.sessionRepo.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.status !== 'in_progress') {
      throw new Error('Session is not in progress');
    }

    if (session.timer_mode === 'per_question' && session.current_question_started_at) {
      const elapsed = Date.now() - new Date(session.current_question_started_at).getTime();
      const allowedTime = session.timer_seconds * 1000;
      const gracePeriodMs = 1000;
      if (elapsed > allowedTime + gracePeriodMs) {
        throw new Error('Answer submitted after time limit');
      }
    }

    if (session.timer_mode === 'per_quiz') {
      const elapsed = Date.now() - new Date(session.started_at).getTime();
      const totalTime = session.timer_seconds * 1000;
      const gracePeriodMs = 1000;
      if (elapsed > totalTime + gracePeriodMs) {
        throw new Error('Quiz time has expired');
      }
    }

    const questionSet = session.question_set as unknown as QuestionSnapshot[];
    const currentQuestion = questionSet[session.current_index];

    const hasAnswered = await this.sessionRepo.hasAnsweredQuestion(sessionId, currentQuestion.question_id);
    if (hasAnswered) {
      throw new Error('Question already answered');
    }

    const correctAnswer = currentQuestion.answers.find(a => a.is_correct);
    if (!correctAnswer) {
      throw new Error('No correct answer found for question');
    }

    const isCorrect = selectedAnswerId === correctAnswer.answer_id;

    await this.sessionRepo.recordAnswer({
      session_id: sessionId,
      question_id: currentQuestion.question_id,
      selected_answer_id: selectedAnswerId,
      is_correct: isCorrect,
      time_to_answer_ms: timeToAnswerMs,
    });

    const newScore = isCorrect ? session.score + 1 : session.score;
    const newCorrectAnswers = isCorrect ? session.correct_answers + 1 : session.correct_answers;

    await this.sessionRepo.updateScore(sessionId, newScore, newCorrectAnswers);
    await this.sessionRepo.incrementSessionIndex(sessionId);

    const isLastQuestion = session.current_index + 1 >= session.total_questions;

    if (isLastQuestion) {
      await this.sessionRepo.updateSessionStatus(sessionId, 'completed');
    }

    return {
      correct: isCorrect,
      correct_answer_id: correctAnswer.answer_id,
      explanation: currentQuestion.explanation,
      feedback_type: isCorrect ? 'correct' : 'incorrect',
      score: newScore,
      is_last_question: isLastQuestion,
    };
  }

  async completeSession(sessionId: string): Promise<CompleteSessionResponse> {
    const session = await this.sessionRepo.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.status === 'completed') {
      throw new Error('Session is already completed');
    }

    if (session.status !== 'in_progress') {
      throw new Error('Session cannot be completed from current state');
    }

    await this.sessionRepo.updateSessionStatus(sessionId, 'completed');

    const score = session.score;
    const total = session.total_questions;
    const sessionConfig = session.config as GameInstanceConfig | null;

    const defaultEndScreenRules = [
      { min: 0, max: 0, text: 'Try again! Better luck next time.' },
      { min: 1, max: 4, text: 'Not bad! Keep practicing.' },
      { min: 5, max: 7, text: 'Good job! You know your stuff.' },
      { min: 8, max: 9, text: 'Excellent! Almost perfect.' },
      { min: 10, max: 100, text: 'Legend! Perfect score!' },
    ];

    const endScreenRules = sessionConfig?.end_screen_rules || defaultEndScreenRules;

    let message = 'Game completed!';
    for (const rule of endScreenRules) {
      if (score >= rule.min && score <= rule.max) {
        message = rule.text;
        break;
      }
    }

    return {
      score,
      total,
      message,
      correct_answers: session.correct_answers,
    };
  }

  async attachLead(sessionId: string, leadId: string): Promise<void> {
    await this.sessionRepo.attachLeadToSession(sessionId, leadId);
  }
}
