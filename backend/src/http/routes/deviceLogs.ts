import { Router } from 'express';
import { deviceLogService } from '../../services/deviceLogs';
import { requireAuth } from '../middleware/auth';
import { asyncRoute, sendData } from '../middleware/respond';

export const deviceLogsRouter = Router();
deviceLogsRouter.use(requireAuth);

deviceLogsRouter.get(
  '/device-logs',
  asyncRoute(async (_req, res) => {
    const logs = await deviceLogService.getLogs();
    sendData(res, logs);
  }),
);

deviceLogsRouter.post(
  '/device-logs',
  asyncRoute(async (req, res) => {
    const body = req.body || {};
    const devId = (req.headers['x-device-id'] as string) || body.devId || 'UNKNOWN';
    const rawDevName = (req.headers['x-device-name'] as string) || body.devName || 'Unknown Device';
    const devName = decodeURIComponent(rawDevName);

    const entry = await deviceLogService.recordLog({
      devId,
      devName,
      user: body.user || 'admin',
      action: body.action || 'OTHER',
      tag: body.tag || 'Action',
      orderId: body.orderId,
      detail: body.detail,
    });

    sendData(res, entry);
  }),
);
