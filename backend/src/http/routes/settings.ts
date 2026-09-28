import { Router } from 'express';
import { settingsService, syncService } from '../../services';
import { getStore } from '../../data';
import { requireAuth, requireOwner } from '../middleware/auth';
import { asyncRoute, param, sendData } from '../middleware/respond';
import { DATASETS, type DatasetKey } from '../../../../shared/domain';
import { ValidationError } from '../../core/errors';
import { importSchema, settingsUpdateSchema } from '../../validation/schemas';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get(
  '/settings',
  asyncRoute(async (_req, res) => {
    sendData(res, settingsService.getSettings());
  }),
);

settingsRouter.put(
  '/settings',
  asyncRoute(async (req, res) => {
    const patch = settingsUpdateSchema.parse(req.body);
    const result = await settingsService.updateSettings(patch);
    sendData(res, result.data, result.warning);
  }),
);

export const syncRouter = Router();
syncRouter.use(requireAuth);

syncRouter.get(
  '/sync/status',
  asyncRoute(async (_req, res) => {
    sendData(res, await syncService.syncStatus());
  }),
);

syncRouter.get(
  '/sync/check',
  requireOwner,
  asyncRoute(async (req, res) => {
    const spreadsheetId = typeof req.query.spreadsheetId === 'string' ? req.query.spreadsheetId : '';
    const driveFolderId = typeof req.query.driveFolderId === 'string' ? req.query.driveFolderId : '';
    sendData(res, await syncService.googleCheck({ spreadsheetId, driveFolderId }));
  }),
);

syncRouter.get(
  '/sync/datasets',
  asyncRoute(async (_req, res) => {
    sendData(res, syncService.datasetLabels());
  }),
);

syncRouter.post(
  '/sync/pull',
  requireOwner,
  asyncRoute(async (req, res) => {
    const dataset = String(req.body?.dataset ?? '') as DatasetKey;
    if (!DATASETS.includes(dataset)) throw new ValidationError('Choose what to read from the sheet.');
    sendData(res, await syncService.syncPull(dataset));
  }),
);

syncRouter.post(
  '/sync/push',
  requireOwner,
  asyncRoute(async (req, res) => {
    const dataset = String(req.body?.dataset ?? '') as DatasetKey;
    if (!DATASETS.includes(dataset)) throw new ValidationError('Choose what to send to the sheet.');
    sendData(res, await syncService.syncPush(dataset));
  }),
);

syncRouter.post(
  '/sync/retry',
  requireOwner,
  asyncRoute(async (_req, res) => {
    sendData(res, await syncService.retryPending());
  }),
);

syncRouter.get(
  '/sync/export/:dataset',
  asyncRoute(async (req, res) => {
    const dataset = String(param(req, 'dataset')) as DatasetKey;
    if (!DATASETS.includes(dataset)) throw new ValidationError('Unknown data set.');
    const file = syncService.exportDataset(dataset);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.csv);
  }),
);

syncRouter.post(
  '/sync/import',
  requireOwner,
  asyncRoute(async (req, res) => {
    const input = importSchema.parse(req.body);
    sendData(res, await syncService.importRows(input));
  }),
);

syncRouter.post(
  '/sync/connect',
  requireOwner,
  asyncRoute(async (req, res) => {
    const spreadsheetId = String(req.body?.spreadsheetId ?? '');
    const driveFolderId = String(req.body?.driveFolderId ?? '');
    const shareWith = Array.isArray(req.body?.shareWith)
      ? (req.body.shareWith as string[]).map(String)
      : [];
    const testOnly = req.body?.testOnly === true;
    sendData(res, await syncService.setupGoogle({ spreadsheetId, driveFolderId, shareWith, testOnly }));
  }),
);

syncRouter.post(
  '/sync/disconnect',
  requireOwner,
  asyncRoute(async (_req, res) => {
    sendData(res, await syncService.disconnectGoogle());
  }),
);

syncRouter.get(
  '/sync/columns',
  asyncRoute(async (_req, res) => {
    sendData(res, getStore().location());
  }),
);
