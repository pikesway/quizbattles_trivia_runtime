import { Router, Response } from 'express';
import { AdminController } from '../controllers/adminController';
import { UserController } from '../controllers/userController';
import { requireAdminRole, AuthenticatedRequest } from '../middleware/authMiddleware';

const router = Router();
const controller = new AdminController();
const userController = new UserController();

router.get('/shells', (req, res) => controller.listShells(req, res));
router.post('/shells', (req, res) => controller.createShell(req, res));
router.get('/shells/:id', (req, res) => controller.getShell(req, res));
router.put('/shells/:id', (req, res) => controller.updateShell(req, res));
router.patch('/shells/:id/status', (req, res) => controller.updateShellStatus(req, res));
router.post('/shells/:id/clone', (req, res) => controller.cloneShell(req, res));
router.post('/shells/:id/archive', (req, res) => controller.archiveShell(req, res));
router.delete('/shells/:id', (req, res) => controller.deleteShell(req, res));
router.get('/shells/:id/validate', (req, res) => controller.validateShell(req, res));

router.get('/shells/:id/questions', (req, res) => controller.getShellQuestions(req, res));
router.post('/shells/:id/questions', (req, res) => controller.addShellQuestion(req, res));
router.delete('/shells/:id/questions/:questionId', (req, res) => controller.removeShellQuestion(req, res));
router.put('/shells/:id/questions/reorder', (req, res) => controller.reorderShellQuestions(req, res));

router.get('/questions', (req, res) => controller.listQuestions(req, res));
router.post('/questions', (req, res) => controller.createQuestion(req, res));
router.get('/questions/topics', (req, res) => controller.getTopics(req, res));
router.get('/questions/tags', (req, res) => controller.getTags(req, res));
router.get('/questions/:id', (req, res) => controller.getQuestion(req, res));
router.get('/questions/:id/reviews', (req, res) => controller.getReviewHistory(req, res));

router.get('/reviews', (req, res) => controller.getReviewQueue(req, res));
router.post('/reviews/:id/approve', (req, res) => controller.approveQuestion(req, res));
router.post('/reviews/:id/reject', (req, res) => controller.rejectQuestion(req, res));
router.post('/reviews/bulk-approve', (req, res) => controller.bulkApprove(req, res));
router.post('/reviews/bulk-reject', (req, res) => controller.bulkReject(req, res));

router.get('/imports', (req, res) => controller.listImportBatches(req, res));
router.get('/imports/:id', (req, res) => controller.getImportBatch(req, res));
router.post('/imports/csv', (req, res) => controller.importCSV(req, res));

router.get('/webhooks/logs', (req, res) => controller.listWebhookLogs(req, res));

router.get('/users', requireAdminRole, (req, res: Response) => userController.listUsers(req as AuthenticatedRequest, res));
router.post('/users', requireAdminRole, (req, res: Response) => userController.createUser(req as AuthenticatedRequest, res));
router.get('/users/:id', requireAdminRole, (req, res: Response) => userController.getUser(req as AuthenticatedRequest, res));
router.put('/users/:id', requireAdminRole, (req, res: Response) => userController.updateUser(req as AuthenticatedRequest, res));
router.patch('/users/:id/deactivate', requireAdminRole, (req, res: Response) => userController.deactivateUser(req as AuthenticatedRequest, res));
router.patch('/users/:id/activate', requireAdminRole, (req, res: Response) => userController.activateUser(req as AuthenticatedRequest, res));

export default router;
