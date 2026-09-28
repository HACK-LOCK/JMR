import { Router } from 'express';
import { partsService } from '../../services';
import { actorName, requireAuth } from '../middleware/auth';
import { asyncRoute, param, sendData } from '../middleware/respond';
import {
  partCreateSchema,
  partUpdateSchema,
  stockAdjustSchema,
  stockInSchema,
  stockOutSchema,
} from '../../validation/schemas';

export const partsRouter = Router();
partsRouter.use(requireAuth);

/* ------------------------------ items ------------------------------- */

partsRouter.get(
  '/parts',
  asyncRoute(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const lowOnly = req.query.low === '1' || req.query.low === 'true';
    sendData(res, partsService.listParts({ q, lowOnly }));
  }),
);

partsRouter.post(
  '/parts',
  asyncRoute(async (req, res) => {
    const input = partCreateSchema.parse(req.body);
    const result = await partsService.createPart(input, actorName(req));
    res.status(201);
    sendData(res, result.data, result.warning);
  }),
);

partsRouter.get(
  '/parts/summary',
  asyncRoute(async (_req, res) => {
    sendData(res, partsService.stockSummary());
  }),
);

partsRouter.get(
  '/parts/:id',
  asyncRoute(async (req, res) => {
    sendData(res, partsService.getPart(param(req, 'id')));
  }),
);

partsRouter.patch(
  '/parts/:id',
  asyncRoute(async (req, res) => {
    const patch = partUpdateSchema.parse(req.body);
    const result = await partsService.updatePart(param(req, 'id'), patch);
    sendData(res, result.data, result.warning);
  }),
);

partsRouter.delete(
  '/parts/:id',
  asyncRoute(async (req, res) => {
    const result = await partsService.deletePart(param(req, 'id'));
    sendData(res, result.data, result.warning);
  }),
);

/* ---------------------------- movements ----------------------------- */

partsRouter.get(
  '/stock/movements',
  asyncRoute(async (req, res) => {
    const partId = typeof req.query.partId === 'string' ? req.query.partId : undefined;
    const orderId = typeof req.query.orderId === 'string' ? req.query.orderId : undefined;
    sendData(res, partsService.listMovements({ partId, orderId }));
  }),
);

partsRouter.post(
  '/stock/in',
  asyncRoute(async (req, res) => {
    const input = stockInSchema.parse(req.body);
    const result = await partsService.stockIn(input, actorName(req));
    res.status(201);
    sendData(res, result.data, result.warning);
  }),
);

partsRouter.post(
  '/stock/out',
  asyncRoute(async (req, res) => {
    const input = stockOutSchema.parse(req.body);
    const result = await partsService.stockOut(input, actorName(req));
    res.status(201);
    sendData(res, result.data, result.warning);
  }),
);

partsRouter.post(
  '/stock/return',
  asyncRoute(async (req, res) => {
    const input = stockOutSchema.parse(req.body);
    const result = await partsService.stockReturn(
      { partId: input.partId, quantity: input.quantity, reason: input.reason, orderId: input.orderId },
      actorName(req),
    );
    res.status(201);
    sendData(res, result.data, result.warning);
  }),
);

partsRouter.post(
  '/stock/adjust',
  asyncRoute(async (req, res) => {
    const input = stockAdjustSchema.parse(req.body);
    const result = await partsService.stockAdjust(input, actorName(req));
    sendData(res, result.data, result.warning);
  }),
);
