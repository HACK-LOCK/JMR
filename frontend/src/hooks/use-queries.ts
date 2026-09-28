import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderStatus } from '@shared/domain';
import { api, type Envelope } from '@/lib/api';
import type {
  CustomerListItem,
  DatasetLabels,
  BillHistory,
  CustomerHistoryRow,
  OrderDateReport,
  OrderDetail,
  OrderListItem,
  PartDetail,
  PartListItem,
  SearchHit,
  StockSummary,
  SupplierListItem,
} from '@/lib/types';
import type {
  AuthUser,
  DashboardData,
  GoogleCheckReport,
  GoogleConnectResult,
  ShopSettings,
  SyncStatus,
  SyncResult,
} from '@shared/domain';

/** Small helper so every hook unwraps `{ data }` the same way. */
async function unwrap<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response: Envelope<T> = await api.get<T>(path, signal);
  return response.data;
}

export const useDashboard = () =>
  useQuery({
    queryKey: ['dashboard'],
    queryFn: ({ signal }) => unwrap<DashboardData>('/dashboard', signal),
  });

export const useOrder = (id: string | undefined) =>
  useQuery({
    queryKey: ['order', id],
    queryFn: ({ signal }) => unwrap<OrderDetail>(`/orders/${encodeURIComponent(id ?? '')}`, signal),
    enabled: Boolean(id),
  });

export const useNextOrderId = () =>
  useQuery({
    queryKey: ['order', 'next-id'],
    queryFn: ({ signal }) => unwrap<{ orderId: string }>('/orders/next-id', signal),
  });

export interface OrderFilters {
  scope: string;
  q: string;
  status?: OrderStatus;
  limit?: number;
}

export const useOrders = (filters: OrderFilters) =>
  useQuery({
    queryKey: ['orders', filters],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ scope: filters.scope, q: filters.q });
      if (filters.status) params.set('status', filters.status);
      if (filters.limit) params.set('limit', String(filters.limit));
      return unwrap<OrderListItem[]>(`/orders?${params.toString()}`, signal);
    },
    // Keep the previous list on screen while refetching - no flash of empty.
    placeholderData: (previous) => previous,
  });

export const useCustomers = (q: string) =>
  useQuery({
    queryKey: ['customers', q],
    queryFn: ({ signal }) => unwrap<CustomerListItem[]>(`/customers?q=${encodeURIComponent(q)}`, signal),
    placeholderData: (previous) => previous,
  });

export const useCustomer = (id: string | undefined) =>
  useQuery({
    queryKey: ['customer', id],
    queryFn: ({ signal }) => unwrap<CustomerListItem>(`/customers/${encodeURIComponent(id ?? '')}`, signal),
    enabled: Boolean(id),
  });

export const useCustomerOrders = (id: string | undefined) =>
  useQuery({
    queryKey: ['customer', id, 'orders'],
    queryFn: ({ signal }) => unwrap<OrderListItem[]>(`/orders?scope=all&q=${encodeURIComponent(id ?? '')}`, signal),
    enabled: Boolean(id),
  });

export const useParts = (q: string, lowOnly = false) =>
  useQuery({
    queryKey: ['parts', q, lowOnly],
    queryFn: ({ signal }) =>
      unwrap<PartListItem[]>(`/parts?q=${encodeURIComponent(q)}${lowOnly ? '&low=1' : ''}`, signal),
    placeholderData: (previous) => previous,
  });

export const usePart = (id: string | undefined) =>
  useQuery({
    queryKey: ['part', id],
    queryFn: ({ signal }) => unwrap<PartDetail>(`/parts/${encodeURIComponent(id ?? '')}`, signal),
    enabled: Boolean(id),
  });

export const useStockSummary = () =>
  useQuery({
    queryKey: ['parts', 'summary'],
    queryFn: ({ signal }) => unwrap<StockSummary>('/parts/summary', signal),
  });

export const useSuppliers = () =>
  useQuery({
    queryKey: ['suppliers'],
    queryFn: ({ signal }) => unwrap<SupplierListItem[]>('/suppliers', signal),
  });

export const useSearch = (q: string, scope: 'all' | 'billing' | 'stock' = 'all') =>
  useQuery({
    queryKey: ['search', q, scope],
    queryFn: ({ signal }) =>
      unwrap<SearchHit[]>(`/search?q=${encodeURIComponent(q)}&scope=${scope}`, signal),
    enabled: q.trim().length > 0,
    placeholderData: (previous) => previous,
  });

/** From Date / To Date totals for the All Bills screen. */
export const useOrderReport = (from: string, to: string) =>
  useQuery({
    queryKey: ['orders', 'report', from, to],
    queryFn: ({ signal }) =>
      unwrap<OrderDateReport>(
        `/orders/report/dates?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        signal,
      ),
    enabled: Boolean(from && to),
    placeholderData: (previous) => previous,
  });

/** Every bill written between two days, for the Bill History screen. */
export const useBillHistory = (from: string, to: string) =>
  useQuery({
    queryKey: ['orders', 'history', from, to],
    queryFn: ({ signal }) =>
      unwrap<BillHistory>(
        `/orders/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        signal,
      ),
    enabled: Boolean(from && to),
    placeholderData: (previous) => previous,
  });

/** One row per person, from the customers the app already keeps. */
export const useCustomerHistory = (q: string) =>
  useQuery({
    queryKey: ['customers', 'history', q],
    queryFn: ({ signal }) => unwrap<CustomerHistoryRow[]>(`/customers/history?q=${encodeURIComponent(q)}`, signal),
    placeholderData: (previous) => previous,
  });

export const useSettings = () =>
  useQuery({
    queryKey: ['settings'],
    queryFn: ({ signal }) => unwrap<ShopSettings>('/settings', signal),
  });

export const useSyncStatus = () =>
  useQuery({
    queryKey: ['sync', 'status'],
    queryFn: ({ signal }) => unwrap<SyncStatus>('/sync/status', signal),
    refetchInterval: 60_000,
  });

export const useSyncDatasets = () =>
  useQuery({
    queryKey: ['sync', 'datasets'],
    queryFn: ({ signal }) => unwrap<DatasetLabels[]>('/sync/datasets', signal),
  });

/**
 * Asks the server what is really connected. The links typed into the wizard
 * are passed along so the owner sees the answer for the link they just pasted,
 * not for the one saved earlier.
 */
export function useGoogleCheck(input: {
  spreadsheetId: string;
  driveFolderId: string;
  enabled: boolean;
}) {
  const { spreadsheetId, driveFolderId, enabled } = input;
  return useQuery({
    queryKey: ['sync', 'check', spreadsheetId, driveFolderId],
    enabled,
    queryFn: ({ signal }) => {
      const query = new URLSearchParams();
      if (spreadsheetId) query.set('spreadsheetId', spreadsheetId);
      if (driveFolderId) query.set('driveFolderId', driveFolderId);
      const suffix = query.toString();
      return unwrap<GoogleCheckReport>(`/sync/check${suffix ? `?${suffix}` : ''}`, signal);
    },
    retry: false,
  });
}

/** Connects (or only tests) a Google spreadsheet. */
export function useGoogleConnect() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      spreadsheetId: string;
      driveFolderId: string;
      shareWith: string[];
      testOnly?: boolean;
    }) =>
      api.post<GoogleConnectResult>('/sync/connect', {
        spreadsheetId: input.spreadsheetId,
        driveFolderId: input.driveFolderId,
        shareWith: input.shareWith,
        testOnly: input.testOnly ?? false,
      }),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}

export const useUsers = () =>
  useQuery({
    queryKey: ['users'],
    queryFn: ({ signal }) => unwrap<AuthUser[]>('/auth/users', signal),
  });

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

export function useCreateOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<OrderDetail>('/orders', body),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}

export function useUpdateOrder(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<OrderDetail>(`/orders/${id}`, body),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}

export function useChangeStatus(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (status: OrderStatus) => api.post<OrderDetail>(`/orders/${id}/status`, { status }),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}

export function useDeliverOrder(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (deliveredTo: string) => api.post<OrderDetail>(`/orders/${id}/deliver`, { deliveredTo }),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}

export function useRecordPayment(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { amount: number; mode: string; note?: string; idempotencyKey?: string }) =>
      api.post<OrderDetail>(`/orders/${id}/payments`, body),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}

export function useDeletePayment(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: string) => api.del<OrderDetail>(`/orders/${id}/payments/${paymentId}`),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}

export function useAddOrderPart(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { partId: string; quantity: number; unitPrice?: number }) =>
      api.post<OrderDetail>(`/orders/${id}/parts`, body),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}

export function useDeleteOrderPart(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (lineId: string) => api.del<OrderDetail>(`/orders/${id}/parts/${lineId}`),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}

export function useCreateCustomer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<CustomerListItem>('/customers', body),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}

export function useCreatePart() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<PartListItem>('/parts', body),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}

export function useUpdatePart(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<PartDetail>(`/parts/${id}`, body),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}

/**
 * Takes an item off the shelf. History is kept on the server, so old bills and
 * stock movements stay correct.
 */
export function useDeletePart() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ id: string }>(`/parts/${id}`),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}

export function useStockIn() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { partId: string; quantity: number; reason?: string; idempotencyKey?: string }) =>
      api.post<PartDetail>('/stock/in', body),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}

export function useStockOut() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { partId: string; quantity: number; reason?: string; orderId?: string; idempotencyKey?: string }) =>
      api.post<PartDetail>('/stock/out', body),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}

export function useStockReturn() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { partId: string; quantity: number; reason?: string; orderId?: string; idempotencyKey?: string }) =>
      api.post<PartDetail>('/stock/return', body),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}

export function useStockAdjust(partId: string) {
  const client = useQueryClient();
  return useMutation({
    // The part is already known by the screen that opens this sheet, so the
    // caller only has to send the new count and the reason.
    mutationFn: (body: { newQuantity: number; reason?: string }) =>
      api.post<PartDetail>('/stock/adjust', { partId, ...body }),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}

export function useCreateSupplier() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<SupplierListItem>('/suppliers', body),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}

export function useUpdateSupplier() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; body: Record<string, unknown> }) =>
      api.patch<SupplierListItem>(`/suppliers/${input.id}`, input.body),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}

export function useDeleteSupplier() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ id: string }>(`/suppliers/${id}`),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}

/**
 * Asks the server whether the stock PIN is right. The PIN is never stored in
 * the app - the answer comes back as a simple yes plus how long the unlock
 * lasts, so nothing about the PIN itself is kept on the phone.
 */
export function useStockUnlock() {
  return useMutation({
    mutationFn: (pin: string) =>
      api.post<{ unlocked: boolean; expiresInMinutes: number }>('/auth/stock/unlock', { pin }),
  });
}

/**
 * Checks the same shop PIN without unlocking the Stock area, so bringing the
 * hidden billing figures back cannot open anything else.
 */
export function useVerifyShopPin() {
  return useMutation({
    mutationFn: (pin: string) => api.post<{ verified: boolean }>('/auth/pin/verify', { pin }),
  });
}

export function useUpdateSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put<ShopSettings>('/settings', body),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}

export function useSyncAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { path: string; body?: unknown }) => api.post<SyncResult>(input.path, input.body),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}

export function useCreateUser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<AuthUser>('/auth/users', body),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}

/** Self-service: proves the current password before setting a new one. */
export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api.patch<{ changed: boolean }>('/auth/password', body),
  });
}
