import type { Customer, RepairOrder } from '../../../shared/domain';
import { normalizeMobile } from '../core/id';
import { newId, nowIso } from '../core/id';
import { NotFoundError } from '../core/errors';
import { mutate, read, type MutationResult } from '../data/mutate';
import type { z } from 'zod';
import type { customerCreateSchema } from '../validation/schemas';

type CustomerInput = z.infer<typeof customerCreateSchema>;

export interface CustomerListItem extends Customer {
  orderCount: number;
  lastOrderAt: string;
  totalBilled: number;
  balanceDue: number;
}

function decorate(customer: Customer, orders: RepairOrder[]): CustomerListItem {
  const own = orders.filter((order) => order.customerId === customer.id);
  const lastOrderAt = own.reduce(
    (latest, order) => (order.receivedAt > latest ? order.receivedAt : latest),
    '',
  );
  return {
    ...customer,
    orderCount: own.length,
    lastOrderAt,
    totalBilled: own
      .filter((order) => order.status !== 'Cancelled')
      .reduce((sum, order) => sum + order.finalAmount, 0),
    balanceDue: own
      .filter((order) => order.status !== 'Cancelled')
      .reduce((sum, order) => sum + Math.max(0, order.finalAmount - order.discount - order.paidAmount), 0),
  };
}

export function listCustomers(query: string, limit = 50): CustomerListItem[] {
  const db = read();
  const q = query.trim().toLowerCase();
  const digits = normalizeMobile(q);

  let items = db.customers;
  if (q) {
    items = items.filter((customer) => {
      if (customer.id.toLowerCase().includes(q)) return true;
      if (customer.name.toLowerCase().includes(q)) return true;
      if (customer.mobile.includes(digits) && digits.length >= 3) return true;
      if (customer.altMobile.includes(digits) && digits.length >= 3) return true;
      return false;
    });
  }

  return items
    .slice()
    .sort((a, b) => (a.name.localeCompare(b.name) || b.createdAt.localeCompare(a.createdAt)))
    .slice(0, limit)
    .map((customer) => decorate(customer, db.orders));
}

export function getCustomer(id: string): { customer: CustomerListItem; orders: RepairOrder[] } {
  const db = read();
  const customer = db.customers.find((item) => item.id === id);
  if (!customer) throw new NotFoundError('Customer not found.');
  const orders = db.orders
    .filter((order) => order.customerId === id)
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  return { customer: decorate(customer, db.orders), orders };
}

/**
 * Customers are matched on mobile number, so the same person is never entered
 * twice by two different employees.
 */
export async function findOrCreateCustomer(input: {
  name: string;
  mobile: string;
  address?: string;
}): Promise<{ customer: Customer; created: boolean }> {
  const mobile = normalizeMobile(input.mobile);
  const existing = read().customers.find(
    (customer) => customer.mobile === mobile || customer.altMobile === mobile,
  );
  if (existing) return { customer: existing, created: false };

  const now = nowIso();
  const customer: Customer = {
    id: newId('CUS'),
    name: input.name.trim(),
    mobile,
    altMobile: '',
    email: '',
    address: input.address ?? '',
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
  await mutate((draft) => {
    draft.customers.push(customer);
    return null;
  });
  return { customer, created: true };
}

export async function createCustomer(input: CustomerInput): Promise<MutationResult<Customer>> {
  const now = nowIso();
  const customer: Customer = {
    id: newId('CUS'),
    name: input.name,
    mobile: normalizeMobile(input.mobile),
    altMobile: input.altMobile ?? '',
    email: input.email ?? '',
    address: input.address ?? '',
    notes: input.notes ?? '',
    createdAt: now,
    updatedAt: now,
  };
  return mutate((draft) => {
    draft.customers.push(customer);
    return customer;
  });
}

export async function updateCustomer(id: string, patch: Partial<CustomerInput>): Promise<MutationResult<Customer>> {
  return mutate((draft) => {
    const customer = draft.customers.find((item) => item.id === id);
    if (!customer) throw new NotFoundError('Customer not found.');
    if (patch.name !== undefined) customer.name = patch.name;
    if (patch.mobile !== undefined) customer.mobile = normalizeMobile(patch.mobile);
    if (patch.altMobile !== undefined) customer.altMobile = patch.altMobile;
    if (patch.email !== undefined) customer.email = patch.email;
    if (patch.address !== undefined) customer.address = patch.address;
    if (patch.notes !== undefined) customer.notes = patch.notes;
    customer.updatedAt = nowIso();
    return customer;
  });
}
