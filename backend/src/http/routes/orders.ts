import { Router, type Request } from 'express';
import { ORDER_STATUSES, type OrderStatus } from '../../../../shared/domain';
import { requireAuth, actorName } from '../middleware/auth';
import { asyncRoute, param, sendData } from '../middleware/respond';
import { billsService, dashboardService, exportsService, ordersService, searchService } from '../../services';
import { deviceLogService } from '../../services/deviceLogs';
import type { OrderScope } from '../../services/orders';
import type { SearchScope } from '../../services/search';
import {
  deliverSchema,
  orderCreateSchema,
  orderPartAddSchema,
  orderUpdateSchema,
  paymentCreateSchema,
  paymentUpdateSchema,
  statusChangeSchema,
} from '../../validation/schemas';

export const ordersRouter = Router();

ordersRouter.use(requireAuth);

ordersRouter.get(
  '/orders',
  asyncRoute(async (req, res) => {
    const scope = String(req.query.scope ?? 'all') as OrderScope;
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const status = typeof req.query.status === 'string' ? (req.query.status as OrderStatus) : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    sendData(res, ordersService.listOrders({ scope, q, status, limit }));
  }),
);

ordersRouter.get(
  '/orders/next-id',
  asyncRoute(async (_req, res) => {
    sendData(res, { orderId: ordersService.nextOrderIdPreview() });
  }),
);

ordersRouter.get(
  '/orders/report/dates',
  asyncRoute(async (req, res) => {
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    sendData(res, ordersService.orderDateReport({ from, to }));
  }),
);

/* --------------------------- bill history --------------------------- */

// Registered before "/orders/:id" so that the word "history" is read as a
// report and never as a bill number.
ordersRouter.get(
  '/orders/history',
  asyncRoute(async (req, res) => {
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    sendData(res, exportsService.billHistory({ from, to }));
  }),
);

ordersRouter.get(
  '/orders/history.xlsx',
  asyncRoute(async (req, res) => {
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    const file = exportsService.exportBills({ from, to });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.buffer);
  }),
);

/**
 * Brands and models this shop has actually repaired, for the new bill screen.
 *
 * Registered before `/orders/:id` so "device-hints" is not read as a bill number.
 */
ordersRouter.get(
  '/orders/device-hints',
  asyncRoute(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    sendData(res, ordersService.deviceHints({ q }));
  }),
);

function reqDeviceInfo(req: Request) {
  const devId = (req.headers['x-device-id'] as string) || 'UNKNOWN';
  const rawDevName = (req.headers['x-device-name'] as string) || 'Web Device';
  return { devId, devName: decodeURIComponent(rawDevName) };
}

ordersRouter.post(
  '/orders',
  asyncRoute(async (req, res) => {
    const input = orderCreateSchema.parse(req.body);
    const result = await ordersService.createOrder(input, actorName(req));
    const { devId, devName } = reqDeviceInfo(req);
    void deviceLogService.recordLog({
      devId,
      devName,
      user: actorName(req),
      action: 'NEW_BILL',
      tag: 'New Bill Added',
      orderId: result.data.id,
      detail: `${result.data.customerName} · ${result.data.brand} ${result.data.model}`,
    });
    res.status(201);
    sendData(res, result.data, result.warning);
  }),
);

ordersRouter.get(
  '/orders/:id',
  asyncRoute(async (req, res) => {
    sendData(res, ordersService.getOrderDetail(param(req, 'id')));
  }),
);

ordersRouter.patch(
  '/orders/:id',
  asyncRoute(async (req, res) => {
    const patch = orderUpdateSchema.parse(req.body);
    const orderId = param(req, 'id');
    const result = await ordersService.updateOrder(orderId, patch);
    const { devId, devName } = reqDeviceInfo(req);
    void deviceLogService.recordLog({
      devId,
      devName,
      user: actorName(req),
      action: 'EDIT_BILL',
      tag: 'Bill Modified',
      orderId,
    });
    sendData(res, result.data, result.warning);
  }),
);

ordersRouter.post(
  '/orders/:id/status',
  asyncRoute(async (req, res) => {
    const { status } = statusChangeSchema.parse(req.body);
    const orderId = param(req, 'id');
    const result = await ordersService.changeStatus(orderId, status, actorName(req));
    const { devId, devName } = reqDeviceInfo(req);
    void deviceLogService.recordLog({
      devId,
      devName,
      user: actorName(req),
      action: 'STATUS',
      tag: `Status -> ${status}`,
      orderId,
    });
    sendData(res, result.data, result.warning);
  }),
);

ordersRouter.post(
  '/orders/:id/deliver',
  asyncRoute(async (req, res) => {
    const { deliveredTo } = deliverSchema.parse(req.body ?? {});
    const orderId = param(req, 'id');
    const result = await ordersService.deliver(orderId, deliveredTo, actorName(req));
    const { devId, devName } = reqDeviceInfo(req);
    void deviceLogService.recordLog({
      devId,
      devName,
      user: actorName(req),
      action: 'STATUS',
      tag: 'Status -> Delivered',
      orderId,
      detail: deliveredTo ? `Given to ${deliveredTo}` : undefined,
    });
    sendData(res, result.data, result.warning);
  }),
);

/* ------------------------------ parts ------------------------------- */

ordersRouter.post(
  '/orders/:id/parts',
  asyncRoute(async (req, res) => {
    const input = orderPartAddSchema.parse(req.body);
    const orderId = param(req, 'id');
    const result = await ordersService.addOrderPart(orderId, input);
    const { devId, devName } = reqDeviceInfo(req);
    void deviceLogService.recordLog({
      devId,
      devName,
      user: actorName(req),
      action: 'PART',
      tag: 'Item Fitted',
      orderId,
      detail: input.name,
    });
    sendData(res, result.data, result.warning);
  }),
);

ordersRouter.delete(
  '/orders/:id/parts/:lineId',
  asyncRoute(async (req, res) => {
    const result = await ordersService.deleteOrderPart(param(req, 'id'), param(req, 'lineId'));
    sendData(res, result.data, result.warning);
  }),
);

ordersRouter.post(
  '/orders/:id/parts/:lineId/use',
  asyncRoute(async (req, res) => {
    const result = await ordersService.useOrderPart(param(req, 'id'), param(req, 'lineId'), actorName(req));
    sendData(res, result.data, result.warning);
  }),
);

ordersRouter.post(
  '/orders/:id/parts/:lineId/return',
  asyncRoute(async (req, res) => {
    const result = await ordersService.returnOrderPartStock(param(req, 'id'), param(req, 'lineId'), actorName(req));
    sendData(res, result.data, result.warning);
  }),
);

/* ----------------------------- payments ----------------------------- */

ordersRouter.post(
  '/orders/:id/payments',
  asyncRoute(async (req, res) => {
    const input = paymentCreateSchema.parse(req.body);
    const orderId = param(req, 'id');
    const result = await ordersService.recordPayment(orderId, input, actorName(req));
    const { devId, devName } = reqDeviceInfo(req);
    void deviceLogService.recordLog({
      devId,
      devName,
      user: actorName(req),
      action: 'PAYMENT',
      tag: `Payment Added (₹${input.amount})`,
      orderId,
      detail: input.mode,
    });
    res.status(201);
    sendData(res, result.data, result.warning);
  }),
);

ordersRouter.patch(
  '/orders/:id/payments/:paymentId',
  asyncRoute(async (req, res) => {
    const input = paymentUpdateSchema.parse(req.body);
    const result = await ordersService.updatePayment(
      param(req, 'id'),
      param(req, 'paymentId'),
      input,
    );
    sendData(res, result.data, result.warning);
  }),
);

ordersRouter.delete(
  '/orders/:id/payments/:paymentId',
  asyncRoute(async (req, res) => {
    const result = await ordersService.deletePayment(param(req, 'id'), param(req, 'paymentId'));
    sendData(res, result.data, result.warning);
  }),
);

/* ------------------------------- bill ------------------------------- */

ordersRouter.get(
  '/orders/:id/bill.pdf',
  asyncRoute(async (req, res) => {
    const pdf = await billsService.buildBillPdf(param(req, 'id'));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${param(req, 'id')}.pdf"`,
    );
    res.send(pdf);
  }),
);

ordersRouter.get(
  '/orders/:id/bill.txt',
  asyncRoute(async (req, res) => {
    res.type('text/plain').send(billsService.buildBillText(param(req, 'id')));
  }),
);

ordersRouter.post(
  '/orders/:id/bill/save',
  asyncRoute(async (req, res) => {
    const result = await billsService.ensureBill(param(req, 'id'));
    sendData(res, result);
  }),
);

/* ---------------------------- dashboard ----------------------------- */

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);
dashboardRouter.get(
  '/dashboard',
  asyncRoute(async (_req, res) => {
    sendData(res, dashboardService.getDashboard());
  }),
);

export const searchRouter = Router();
searchRouter.use(requireAuth);
searchRouter.get(
  '/search',
  asyncRoute(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const scope = String(req.query.scope ?? 'all') as SearchScope;
    sendData(res, searchService.search(q, 20, scope));
  }),
);

export const statusRouter = Router();
statusRouter.get('/statuses', (_req, res) => {
  sendData(res, ORDER_STATUSES);
});
