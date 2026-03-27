import { QuestionRepository } from '../repositories/questionRepository';
import { QuestionSnapshot, GameInstanceConfig } from '../../types/trivia';

export class QuestionService {
  private questionRepo: QuestionRepository;

  constructor() {
    this.questionRepo = new QuestionRepository();
  }

  async buildQuestionSet(config: GameInstanceConfig): Promise<QuestionSnapshot[]> {
    let questions;

    if (config.question_mode === 'random') {
      questions = await this.questionRepo.getRandomQuestions(config.question_count);
    } else {
      questions = await this.questionRepo.getFixedQuestions(config.question_count);
    }

    if (questions.length < config.question_count) {
      throw new Error(`Not enough questions available. Needed ${config.question_count}, found ${questions.length}`);
    }

    const questionIds = questions.map(q => q.id);
    const answersMap = await this.questionRepo.getAnswersForQuestions(questionIds);

    const questionSet: QuestionSnapshot[] = questions.map(question => {
      const answers = answersMap.get(question.id) || [];

      if (answers.length === 0) {
        throw new Error(`No answers found for question ${question.id}`);
      }

      const correctCount = answers.filter(a => a.is_correct).length;
      if (correctCount !== 1) {
        throw new Error(`Question ${question.id} must have exactly one correct answer`);
      }

      return {
        question_id: question.id,
        question_text: question.question_text,
        explanation: question.explanation,
        answers: answers.map(answer => ({
          answer_id: answer.id,
          answer_text: answer.answer_text,
          is_correct: answer.is_correct,
        })),
      };
    });

    return questionSet;
  }

  shuffleAnswers(answers: Array<{ answer_id: string; answer_text: string }>): Array<{ answer_id: string; answer_text: string }> {
    const shuffled = [...answers];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}
