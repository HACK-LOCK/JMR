import { Router } from 'express';
import { suppliersService } from '../../services';
import { requireAuth } from '../middleware/auth';
import { asyncRoute, param, sendData } from '../middleware/respond';
import { supplierCreateSchema, supplierUpdateSchema } from '../../validation/schemas';

export const suppliersRouter = Router();
suppliersRouter.use(requireAuth);

suppliersRouter.get(
  '/suppliers',
  asyncRoute(async (_req, res) => {
    sendData(res, suppliersService.listSuppliers());
  }),
);

suppliersRouter.post(
  '/suppliers',
  asyncRoute(async (req, res) => {
    const input = supplierCreateSchema.parse(req.body);
    const result = await suppliersService.createSupplier(input);
    res.status(201);
    sendData(res, result.data, result.warning);
  }),
);

suppliersRouter.get(
  '/suppliers/:id',
  asyncRoute(async (req, res) => {
    sendData(res, suppliersService.getSupplier(param(req, 'id')));
  }),
);

suppliersRouter.patch(
  '/suppliers/:id',
  asyncRoute(async (req, res) => {
    const patch = supplierUpdateSchema.parse(req.body);
    const result = await suppliersService.updateSupplier(param(req, 'id'), patch);
    sendData(res, result.data, result.warning);
  }),
);

suppliersRouter.delete(
  '/suppliers/:id',
  asyncRoute(async (req, res) => {
    const result = await suppliersService.deleteSupplier(param(req, 'id'));
    sendData(res, result.data, result.warning);
  }),
);
