import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { read } from '../data/mutate';
import { round2 } from '../../../shared/domain';

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (client) return client;
  if (!env.supabase.url || !env.supabase.publishableKey) {
    return null;
  }
  try {
    client = createClient(env.supabase.url, env.supabase.publishableKey, {
      auth: { persistSession: false },
    });
    return client;
  } catch (err) {
    console.warn('[supabase] Failed to initialize client:', err);
    return null;
  }
}

export interface SupabaseStatus {
  configured: boolean;
  url: string;
  keyPreview: string;
  connected: boolean;
  tablesReady: boolean;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Check connection to Supabase and verify whether schema tables are ready.
 */
export async function testSupabase(): Promise<SupabaseStatus> {
  const sb = getSupabaseClient();
  const configured = Boolean(env.supabase.url && env.supabase.publishableKey);

  if (!configured || !sb) {
    return {
      configured: false,
      url: env.supabase.url,
      keyPreview: env.supabase.publishableKey ? `${env.supabase.publishableKey.slice(0, 14)}...` : '',
      connected: false,
      tablesReady: false,
      message: 'Supabase URL or Publishable Key is not configured in .env',
    };
  }

  const keyPreview = `${env.supabase.publishableKey.slice(0, 14)}...`;

  try {
    // 1. Check basic endpoint accessibility
    const { data: orderTest, error: orderErr } = await sb
      .from('orders')
      .select('id')
      .limit(1);

    if (orderErr) {
      if (orderErr.code === 'PGRST205' || orderErr.message.includes('Could not find the table')) {
        return {
          configured: true,
          url: env.supabase.url,
          keyPreview,
          connected: true,
          tablesReady: false,
          message: 'Connected to Supabase, but the "orders" table is not created yet. Run supabase-schema.sql in Supabase SQL Editor.',
          details: { error: orderErr },
        };
      }
      return {
        configured: true,
        url: env.supabase.url,
        keyPreview,
        connected: false,
        tablesReady: false,
        message: `Supabase query error: ${orderErr.message} (${orderErr.code})`,
        details: { error: orderErr },
      };
    }

    return {
      configured: true,
      url: env.supabase.url,
      keyPreview,
      connected: true,
      tablesReady: true,
      message: 'Supabase connected and tables verified successfully.',
      details: { sampleCount: orderTest?.length ?? 0 },
    };
  } catch (err) {
    return {
      configured: true,
      url: env.supabase.url,
      keyPreview,
      connected: false,
      tablesReady: false,
      message: err instanceof Error ? err.message : 'Unknown connection error',
    };
  }
}

/**
 * Sync a single order (bill) and its customer, payments, parts and history to Supabase.
 */
export async function syncOrderToSupabase(orderId: string): Promise<{ success: boolean; message: string }> {
  const sb = getSupabaseClient();
  if (!sb) {
    return { success: false, message: 'Supabase not configured' };
  }

  const db = read();
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) {
    return { success: false, message: `Order ${orderId} not found locally` };
  }

  try {
    // 1. Sync Customer
    if (order.customerId) {
      const customer = db.customers.find((c) => c.id === order.customerId);
      if (customer) {
        await sb.from('customers').upsert(
          {
            id: customer.id,
            name: customer.name,
            mobile: customer.mobile,
            alt_mobile: customer.altMobile ?? '',
            email: customer.email ?? '',
            address: customer.address ?? '',
            notes: customer.notes ?? '',
            updated_at: customer.updatedAt || new Date().toISOString(),
          },
          { onConflict: 'id' },
        );
      }
    }

    // 2. Sync Order
    const { error: orderErr } = await sb.from('orders').upsert(
      {
        id: order.id,
        customer_id: order.customerId,
        customer_name: order.customerName,
        mobile: order.mobile,
        device_type: order.deviceType,
        brand: order.brand,
        model: order.model,
        complaint: order.complaint,
        imei: order.imei,
        device_condition: order.deviceCondition,
        accessories: order.accessories,
        expected_delivery: order.expectedDelivery || null,
        technician: order.technician,
        notes: order.notes,
        photos: order.photos ?? [],
        status: order.status,
        received_at: order.receivedAt || new Date().toISOString(),
        delivered_at: order.deliveredAt || null,
        delivered_to: order.deliveredTo || '',
        estimated_amount: round2(order.estimatedAmount),
        final_amount: round2(order.finalAmount),
        discount: round2(order.discount),
        paid_amount: round2(order.paidAmount),
        payment_status: order.paymentStatus,
        payment_mode: order.paymentMode,
        bill_drive_file_id: order.billDriveFileId || '',
        bill_drive_link: order.billDriveLink || '',
        bill_printed_at: order.billPrintedAt || null,
        created_by: order.createdBy,
        created_at: order.createdAt || new Date().toISOString(),
        updated_at: order.updatedAt || new Date().toISOString(),
        pending_sync: false,
      },
      { onConflict: 'id' },
    );

    if (orderErr) {
      console.warn(`[supabase] Failed to upsert order ${order.id}:`, orderErr.message);
      return { success: false, message: orderErr.message };
    }

    // 3. Sync Payments for this order
    const payments = db.payments.filter((p) => p.orderId === orderId);
    if (payments.length > 0) {
      const paymentRows = payments.map((p) => ({
        id: p.id,
        order_id: p.orderId,
        amount: round2(p.amount),
        mode: p.mode,
        status: p.status,
        note: p.note,
        date: p.date || new Date().toISOString(),
        user_name: p.user || '',
        idempotency_key: p.idempotencyKey || '',
        created_at: p.createdAt || new Date().toISOString(),
        updated_at: p.updatedAt || new Date().toISOString(),
      }));
      await sb.from('payments').upsert(paymentRows, { onConflict: 'id' });
    }

    // 4. Sync Order Parts for this order
    const parts = db.orderParts.filter((p) => p.orderId === orderId);
    if (parts.length > 0) {
      const partRows = parts.map((p) => ({
        id: p.id,
        order_id: p.orderId,
        part_id: p.partId,
        part_name: p.partName,
        quantity: p.quantity,
        unit_price: round2(p.unitPrice),
        consumed: p.consumed,
        consumed_at: p.consumedAt || null,
        consume_mode: p.consumeMode,
        created_at: p.createdAt || new Date().toISOString(),
        updated_at: p.updatedAt || new Date().toISOString(),
      }));
      await sb.from('order_parts').upsert(partRows, { onConflict: 'id' });
    }

    // 5. Sync Status History
    const history = db.statusHistory.filter((h) => h.orderId === orderId);
    if (history.length > 0) {
      const historyRows = history.map((h) => ({
        id: h.id,
        order_id: h.orderId,
        from_status: h.fromStatus,
        to_status: h.toStatus,
        at: h.at || new Date().toISOString(),
        user_name: h.user || '',
      }));
      await sb.from('status_history').upsert(historyRows, { onConflict: 'id' });
    }

    console.log(`[supabase] Successfully synced order ${order.id} to Supabase`);
    return { success: true, message: `Order ${order.id} synced to Supabase` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[supabase] Exception syncing order ${orderId}:`, message);
    return { success: false, message };
  }
}

/**
 * Sync all bills and related data from local database to Supabase.
 */
export async function syncAllToSupabase(): Promise<{
  ordersCount: number;
  customersCount: number;
  paymentsCount: number;
  errors: string[];
}> {
  const sb = getSupabaseClient();
  if (!sb) {
    throw new Error('Supabase is not configured');
  }

  const db = read();
  const errors: string[] = [];

  // Sync Customers
  let customersCount = 0;
  if (db.customers.length > 0) {
    const customerRows = db.customers.map((c) => ({
      id: c.id,
      name: c.name,
      mobile: c.mobile,
      alt_mobile: c.altMobile ?? '',
      email: c.email ?? '',
      address: c.address ?? '',
      notes: c.notes ?? '',
      created_at: c.createdAt || new Date().toISOString(),
      updated_at: c.updatedAt || new Date().toISOString(),
    }));
    const { error } = await sb.from('customers').upsert(customerRows, { onConflict: 'id' });
    if (error) errors.push(`Customers sync error: ${error.message}`);
    else customersCount = customerRows.length;
  }

  // Sync Orders
  let ordersCount = 0;
  if (db.orders.length > 0) {
    const orderRows = db.orders.map((order) => ({
      id: order.id,
      customer_id: order.customerId,
      customer_name: order.customerName,
      mobile: order.mobile,
      device_type: order.deviceType,
      brand: order.brand,
      model: order.model,
      complaint: order.complaint,
      imei: order.imei,
      device_condition: order.deviceCondition,
      accessories: order.accessories,
      expected_delivery: order.expectedDelivery || null,
      technician: order.technician,
      notes: order.notes,
      photos: order.photos ?? [],
      status: order.status,
      received_at: order.receivedAt || new Date().toISOString(),
      delivered_at: order.deliveredAt || null,
      delivered_to: order.deliveredTo || '',
      estimated_amount: round2(order.estimatedAmount),
      final_amount: round2(order.finalAmount),
      discount: round2(order.discount),
      paid_amount: round2(order.paidAmount),
      payment_status: order.paymentStatus,
      payment_mode: order.paymentMode,
      bill_drive_file_id: order.billDriveFileId || '',
      bill_drive_link: order.billDriveLink || '',
      bill_printed_at: order.billPrintedAt || null,
      created_by: order.createdBy,
      created_at: order.createdAt || new Date().toISOString(),
      updated_at: order.updatedAt || new Date().toISOString(),
      pending_sync: false,
    }));
    const { error } = await sb.from('orders').upsert(orderRows, { onConflict: 'id' });
    if (error) errors.push(`Orders sync error: ${error.message}`);
    else ordersCount = orderRows.length;
  }

  // Sync Payments
  let paymentsCount = 0;
  if (db.payments.length > 0) {
    const paymentRows = db.payments.map((p) => ({
      id: p.id,
      order_id: p.orderId,
      amount: round2(p.amount),
      mode: p.mode,
      status: p.status,
      note: p.note,
      date: p.date || new Date().toISOString(),
      user_name: p.user || '',
      idempotency_key: p.idempotencyKey || '',
      created_at: p.createdAt || new Date().toISOString(),
      updated_at: p.updatedAt || new Date().toISOString(),
    }));
    const { error } = await sb.from('payments').upsert(paymentRows, { onConflict: 'id' });
    if (error) errors.push(`Payments sync error: ${error.message}`);
    else paymentsCount = paymentRows.length;
  }

  // Sync Order Parts
  if (db.orderParts.length > 0) {
    const partRows = db.orderParts.map((p) => ({
      id: p.id,
      order_id: p.orderId,
      part_id: p.partId,
      part_name: p.partName,
      quantity: p.quantity,
      unit_price: round2(p.unitPrice),
      consumed: p.consumed,
      consumed_at: p.consumedAt || null,
      consume_mode: p.consumeMode,
      created_at: p.createdAt || new Date().toISOString(),
      updated_at: p.updatedAt || new Date().toISOString(),
    }));
    const { error } = await sb.from('order_parts').upsert(partRows, { onConflict: 'id' });
    if (error) errors.push(`Order parts sync error: ${error.message}`);
  }

  // Sync Status History
  if (db.statusHistory.length > 0) {
    const historyRows = db.statusHistory.map((h) => ({
      id: h.id,
      order_id: h.orderId,
      from_status: h.fromStatus,
      to_status: h.toStatus,
      at: h.at || new Date().toISOString(),
      user_name: h.user || '',
    }));
    const { error } = await sb.from('status_history').upsert(historyRows, { onConflict: 'id' });
    if (error) errors.push(`Status history sync error: ${error.message}`);
  }

  return { ordersCount, customersCount, paymentsCount, errors };
}
