import { Router } from 'express';
import { customersService, exportsService } from '../../services';
import { requireAuth } from '../middleware/auth';
import { asyncRoute, param, sendData } from '../middleware/respond';
import { customerCreateSchema, customerUpdateSchema } from '../../validation/schemas';

export const customersRouter = Router();
customersRouter.use(requireAuth);

customersRouter.get(
  '/customers',
  asyncRoute(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    sendData(res, customersService.listCustomers(q, limit));
  }),
);

/* -------------------------- customer history ------------------------ */

// Registered before "/customers/:id" for the same reason as the bill history.
customersRouter.get(
  '/customers/history',
  asyncRoute(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    sendData(res, exportsService.customerHistory(q));
  }),
);

customersRouter.get(
  '/customers/history.xlsx',
  asyncRoute(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const file = exportsService.exportCustomers(q, exportsService.parseCustomerExportColumns(req.query.cols));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.buffer);
  }),
);

// The same rows and the same ticked columns as the spreadsheet, printed. It is
// an attachment rather than a tab, because this list is a list to keep and
// share, not a bill to read on screen.
customersRouter.get(
  '/customers/history.pdf',
  asyncRoute(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const file = await exportsService.exportCustomersPdf(
      q,
      exportsService.parseCustomerExportColumns(req.query.cols),
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.buffer);
  }),
);

customersRouter.post(
  '/customers',
  asyncRoute(async (req, res) => {
    const input = customerCreateSchema.parse(req.body);
    const result = await customersService.createCustomer(input);
    res.status(201);
    sendData(res, result.data, result.warning);
  }),
);

customersRouter.get(
  '/customers/:id',
  asyncRoute(async (req, res) => {
    sendData(res, customersService.getCustomer(param(req, 'id')));
  }),
);

customersRouter.patch(
  '/customers/:id',
  asyncRoute(async (req, res) => {
    const patch = customerUpdateSchema.parse(req.body);
    const result = await customersService.updateCustomer(param(req, 'id'), patch);
    sendData(res, result.data, result.warning);
  }),
);
