import {
  isLowStock,
  round2,
  type ConsumeMode,
  type Part,
  type StockMovement,
} from '../../../shared/domain';
import { NotFoundError, ValidationError } from '../core/errors';
import { newId, nowIso } from '../core/id';
import { mutate, read, type MutationResult } from '../data/mutate';
import { applyAdjust, applyStockIn, applyStockOut, applyReturn } from '../domain/stockOps';
import type { z } from 'zod';
import type { partCreateSchema } from '../validation/schemas';

type PartInput = z.infer<typeof partCreateSchema>;

export interface PartListItem extends Part {
  low: boolean;
  stockValue: number;
  usedInOpenOrders: number;
}

export interface PartDetail extends Part {
  low: boolean;
  stockValue: number;
  movements: StockMovement[];
  openOrderLines: { orderId: string; quantity: number }[];
}

function decorate(part: Part, movements: StockMovement[], openLines: { orderId: string; quantity: number }[]): PartDetail {
  return {
    ...part,
    low: isLowStock(part),
    stockValue: round2(part.quantity * part.purchaseCost),
    movements,
    openOrderLines: openLines,
  };
}

function openLinesFor(partId: string): { orderId: string; quantity: number }[] {
  return read().orderParts
    .filter((line) => line.partId === partId && !line.consumed)
    .map((line) => ({ orderId: line.orderId, quantity: line.quantity }));
}

export function listParts(input: { q?: string; lowOnly?: boolean; includeInactive?: boolean } = {}): PartListItem[] {
  const db = read();
  const q = (input.q ?? '').trim().toLowerCase();
  const openByPart = new Map<string, number>();
  for (const line of db.orderParts) {
    if (line.consumed) continue;
    openByPart.set(line.partId, (openByPart.get(line.partId) ?? 0) + line.quantity);
  }

  return db.parts
    .filter((part) => (input.includeInactive ? true : part.active))
    .filter((part) => (input.lowOnly ? isLowStock(part) : true))
    .filter((part) =>
      q
        ? part.name.toLowerCase().includes(q) ||
          part.brand.toLowerCase().includes(q) ||
          part.model.toLowerCase().includes(q) ||
          part.id.toLowerCase().includes(q)
        : true,
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((part) => ({
      ...part,
      low: isLowStock(part),
      stockValue: round2(part.quantity * part.purchaseCost),
      usedInOpenOrders: openByPart.get(part.id) ?? 0,
    }));
}

export function getPart(id: string): PartDetail {
  const db = read();
  const part = db.parts.find((item) => item.id === id);
  if (!part) throw new NotFoundError('Item not found.');
  const movements = db.stockMovements
    .filter((row) => row.partId === id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 100);
  return decorate(part, movements, openLinesFor(id));
}

/** A brand new item. Opening quantity is recorded as a proper Stock In. */
export async function createPart(
  input: PartInput,
  user: string,
): Promise<MutationResult<PartDetail>> {
  const now = nowIso();
  const partId = newId('PRT');
  const supplier = input.supplierId
    ? read().suppliers.find((item) => item.id === input.supplierId)
    : undefined;

  return mutate((draft) => {
    const part: Part = {
      id: partId,
      name: input.name,
      category: input.category,
      brand: input.brand,
      model: input.model,
      quantity: 0,
      minQuantity: input.minQuantity,
      purchaseCost: round2(input.purchaseCost),
      sellingPrice: round2(input.sellingPrice),
      supplierId: supplier?.id ?? '',
      supplierName: supplier?.name ?? '',
      consumeMode: input.consumeMode as ConsumeMode,
      active: input.active,
      createdAt: now,
      updatedAt: now,
    };
    draft.parts.push(part);

    if (input.quantity > 0) {
      applyStockIn(draft, {
        partId,
        quantity: input.quantity,
        type: 'IN',
        reason: 'Opening stock',
        user,
      });
    }
    return part.id;
  }).then((result) => ({
    data: getPart(result.data),
    ...(result.warning ? { warning: result.warning } : {}),
  }));
}

export async function updatePart(
  id: string,
  patch: Partial<PartInput>,
): Promise<MutationResult<PartDetail>> {
  return mutate((draft) => {
    const part = draft.parts.find((item) => item.id === id);
    if (!part) throw new NotFoundError('Item not found.');
    if (patch.name !== undefined) part.name = patch.name;
    if (patch.category !== undefined) part.category = patch.category;
    if (patch.brand !== undefined) part.brand = patch.brand;
    if (patch.model !== undefined) part.model = patch.model;
    if (patch.minQuantity !== undefined) part.minQuantity = patch.minQuantity;
    if (patch.purchaseCost !== undefined) part.purchaseCost = round2(patch.purchaseCost);
    if (patch.sellingPrice !== undefined) part.sellingPrice = round2(patch.sellingPrice);
    if (patch.consumeMode !== undefined) part.consumeMode = patch.consumeMode;
    if (patch.active !== undefined) part.active = patch.active;
    if (patch.supplierId !== undefined) {
      const supplier = draft.suppliers.find((item) => item.id === patch.supplierId);
      part.supplierId = supplier?.id ?? '';
      part.supplierName = supplier?.name ?? '';
    }
    if (patch.quantity !== undefined && patch.quantity !== part.quantity) {
      throw new ValidationError('Use Stock In, Stock Out or Stock Correct to change quantity.');
    }
    part.updatedAt = nowIso();
    return part.id;
  }).then((result) => ({
    data: getPart(result.data),
    ...(result.warning ? { warning: result.warning } : {}),
  }));
}

/**
 * Removes an item from the shop without touching history. Old bills and stock
 * movements keep referring to it, so the item is only marked inactive - it
 * disappears from the lists but the numbers on past bills stay correct.
 */
export async function deletePart(id: string): Promise<MutationResult<{ id: string }>> {
  return mutate((draft) => {
    const part = draft.parts.find((item) => item.id === id);
    if (!part) throw new NotFoundError('Item not found.');
    part.active = false;
    part.updatedAt = nowIso();
    return { id };
  });
}

export async function stockIn(
  input: { partId: string; quantity: number; reason: string; idempotencyKey: string },
  user: string,
): Promise<MutationResult<{ movement: StockMovement; part: Part }>> {
  return mutate((draft) => {
    const { movement, part } = applyStockIn(draft, { ...input, type: 'IN', user });
    return { movement, part };
  });
}

export async function stockOut(
  input: {
    partId: string;
    quantity: number;
    reason: string;
    orderId: string;
    idempotencyKey: string;
  },
  user: string,
): Promise<MutationResult<{ movement: StockMovement; part: Part }>> {
  return mutate((draft) => {
    const { movement, part } = applyStockOut(draft, { ...input, type: 'OUT', user });
    return { movement, part };
  });
}

export async function stockReturn(
  input: { partId: string; quantity: number; reason: string; orderId: string },
  user: string,
): Promise<MutationResult<{ movement: StockMovement; part: Part }>> {
  return mutate((draft) => {
    const { movement, part } = applyReturn(draft, { ...input, type: 'RETURN', user });
    return { movement, part };
  });
}

export async function stockAdjust(
  input: { partId: string; newQuantity: number; reason: string },
  user: string,
): Promise<MutationResult<{ movement: StockMovement; part: Part }>> {
  return mutate((draft) => {
    const { movement, part } = applyAdjust(draft, { ...input, user });
    return { movement, part };
  });
}

export function listMovements(input: {
  partId?: string;
  orderId?: string;
  limit?: number;
} = {}): StockMovement[] {
  const db = read();
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  return db.stockMovements
    .filter((row) => (input.partId ? row.partId === input.partId : true))
    .filter((row) => (input.orderId ? row.orderId === input.orderId : true))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

export function lowStockItems(): PartListItem[] {
  return listParts({ lowOnly: true });
}

export function stockSummary(): {
  items: number;
  units: number;
  value: number;
  low: number;
} {
  const items = read().parts.filter((part) => part.active);
  return {
    items: items.length,
    units: items.reduce((sum, part) => sum + part.quantity, 0),
    value: round2(items.reduce((sum, part) => sum + part.quantity * part.purchaseCost, 0)),
    low: items.filter(isLowStock).length,
  };
}
