import { Request, Response } from 'express';
import { SessionService } from '../services/sessionService';
import { PlatformService } from '../services/platformService';
import { ConfigService } from '../services/configService';
import { successResponse, errorResponse } from '../utils/response';
import {
  StartSessionRequest,
  SubmitAnswerRequest,
  LeadCaptureRequest,
} from '../../types/trivia';

export class TriviaController {
  private sessionService: SessionService;
  private platformService: PlatformService;
  private configService: ConfigService;

  constructor() {
    this.sessionService = new SessionService();
    this.platformService = new PlatformService();
    this.configService = new ConfigService();
  }

  async startSession(req: Request, res: Response): Promise<void> {
    try {
      const { campaign_id, campaign_game_instance_id, lead_id } = req.body as StartSessionRequest;

      if (!campaign_id || !campaign_game_instance_id) {
        res.status(400).json(errorResponse('INVALID_REQUEST', 'Missing required fields'));
        return;
      }

      const config = await this.configService.getConfig(campaign_game_instance_id);
      const response = await this.sessionService.startSession(
        campaign_id,
        campaign_game_instance_id,
        lead_id,
        config
      );

      res.json(successResponse(response));
    } catch (error) {
      console.error('Start session error:', error);
      res.status(500).json(errorResponse('START_SESSION_FAILED', (error as Error).message));
    }
  }

  async getNextQuestion(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = req.params.sessionId as string;

      if (!sessionId) {
        res.status(400).json(errorResponse('INVALID_REQUEST', 'Session ID required'));
        return;
      }

      const response = await this.sessionService.getNextQuestion(sessionId);
      res.json(successResponse(response));
    } catch (error) {
      console.error('Get next question error:', error);
      res.status(500).json(errorResponse('GET_QUESTION_FAILED', (error as Error).message));
    }
  }

  async submitAnswer(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = req.params.sessionId as string;
      const { selected_answer_id, time_to_answer_ms } = req.body as SubmitAnswerRequest;

      if (!sessionId || !selected_answer_id) {
        res.status(400).json(errorResponse('INVALID_REQUEST', 'Missing required fields'));
        return;
      }

      const response = await this.sessionService.submitAnswer(
        sessionId,
        selected_answer_id,
        time_to_answer_ms || 0
      );

      res.json(successResponse(response));
    } catch (error) {
      console.error('Submit answer error:', error);
      res.status(500).json(errorResponse('SUBMIT_ANSWER_FAILED', (error as Error).message));
    }
  }

  async completeSession(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = req.params.sessionId as string;

      if (!sessionId) {
        res.status(400).json(errorResponse('INVALID_REQUEST', 'Session ID required'));
        return;
      }

      const session = await this.sessionService.getSession(sessionId);
      if (!session) {
        res.status(404).json(errorResponse('SESSION_NOT_FOUND', 'Session not found'));
        return;
      }

      const response = await this.sessionService.completeSession(sessionId);

      if (session.lead_id) {
        const completionTime = Date.now() - new Date(session.started_at).getTime();

        await this.platformService.recordGamePlayOnPlatform({
          campaign_id: session.campaign_id,
          campaign_game_instance_id: session.campaign_game_instance_id,
          lead_id: session.lead_id,
          score: session.score,
          completion_time_ms: completionTime,
          session_id: sessionId,
        });
      }

      res.json(successResponse(response));
    } catch (error) {
      console.error('Complete session error:', error);
      const errMessage = (error as Error).message;
      if (errMessage === 'Session is already completed') {
        res.status(400).json(errorResponse('SESSION_ALREADY_COMPLETED', errMessage));
        return;
      }
      res.status(500).json(errorResponse('COMPLETE_SESSION_FAILED', errMessage));
    }
  }

  async captureLead(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = req.params.sessionId as string;
      const { data } = req.body as LeadCaptureRequest;

      if (!sessionId || !data) {
        res.status(400).json(errorResponse('INVALID_REQUEST', 'Missing required fields'));
        return;
      }

      const session = await this.sessionService.getSession(sessionId);
      if (!session) {
        res.status(404).json(errorResponse('SESSION_NOT_FOUND', 'Session not found'));
        return;
      }

      const platformResponse = await this.platformService.captureLeadOnPlatform({
        campaign_id: session.campaign_id,
        data,
      });

      await this.sessionService.attachLead(sessionId, platformResponse.lead_id);

      res.json(successResponse(platformResponse));
    } catch (error) {
      console.error('Capture lead error:', error);
      res.status(500).json(errorResponse('CAPTURE_LEAD_FAILED', (error as Error).message));
    }
  }
}
