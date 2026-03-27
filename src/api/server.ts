import express from 'express';
import cors from 'cors';
import { createTriviaRoutes } from './routes/triviaRoutes';
import adminRoutes from './routes/adminRoutes';
import { WebhookIngestionService } from './services/webhookIngestionService';
import { successResponse, errorResponse } from './utils/response';
import { WebhookImportPayload } from '../types/authoring';
import { requireAuth, requireApiKey } from './middleware/authMiddleware';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/trivia', createTriviaRoutes());
app.use('/api/admin', requireAuth, adminRoutes);

app.post('/api/webhooks/questions', requireApiKey, async (req, res) => {
  try {
    const webhookService = new WebhookIngestionService();
    const payload: WebhookImportPayload = req.body;
    const result = await webhookService.ingestWebhook(payload);
    res.status(201).json(successResponse(result));
  } catch (error) {
    res.status(400).json(errorResponse('WEBHOOK_ERROR', (error as Error).message));
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Trivia Runtime Service' });
});

app.listen(PORT, () => {
  console.log(`Trivia Runtime Service running on port ${PORT}`);
});

export default app;
