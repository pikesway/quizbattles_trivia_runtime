import { Router } from 'express';
import { TriviaController } from '../controllers/triviaController';

export function createTriviaRoutes(): Router {
  const router = Router();
  const controller = new TriviaController();

  router.post('/start', (req, res) => controller.startSession(req, res));
  router.get('/:sessionId/next', (req, res) => controller.getNextQuestion(req, res));
  router.post('/:sessionId/answer', (req, res) => controller.submitAnswer(req, res));
  router.post('/:sessionId/complete', (req, res) => controller.completeSession(req, res));
  router.post('/:sessionId/lead', (req, res) => controller.captureLead(req, res));

  return router;
}
