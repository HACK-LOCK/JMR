import { Router } from 'express';
import { requireAuth, requireOwner } from '../middleware/auth';
import { asyncRoute, param, sendData } from '../middleware/respond';
import { syncAllToSupabase, syncOrderToSupabase, testSupabase } from '../../services/supabaseSync';

export const supabaseRouter = Router();
supabaseRouter.use(requireAuth);

supabaseRouter.get(
  '/supabase/status',
  asyncRoute(async (_req, res) => {
    sendData(res, await testSupabase());
  }),
);

supabaseRouter.post(
  '/supabase/test',
  asyncRoute(async (_req, res) => {
    sendData(res, await testSupabase());
  }),
);

supabaseRouter.post(
  '/supabase/sync',
  requireOwner,
  asyncRoute(async (_req, res) => {
    sendData(res, await syncAllToSupabase());
  }),
);

supabaseRouter.post(
  '/supabase/sync-order/:id',
  asyncRoute(async (req, res) => {
    const orderId = param(req, 'id');
    sendData(res, await syncOrderToSupabase(orderId));
  }),
);
