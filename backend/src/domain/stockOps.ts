import type { OrderPart, Part, StockMovement, StockMovementType } from '../../../shared/domain';
import { round2 } from '../../../shared/domain';
import type { Database } from '../data/database';
import { ConflictError, NotFoundError, ValidationError } from '../core/errors';
import { newId, nowIso } from '../core/id';

/**
 * Stock rules. Every function here is PURE: it takes the database draft and
 * changes it in place. Nothing is written anywhere, so stock maths can be
 * reasoned about (and reused) independently of Google Sheets.
 *
 * Invariants enforced here:
 *  - a movement always records Movement ID, Item ID, Order ID, quantity, type,
 *    reason, date/time, user and the resulting balance
 *  - quantity is always a positive whole number
 *  - stock never goes below zero unless the owner explicitly allows it
 *  - the same request can never be applied twice (idempotency key)
 */

export interface MovementInput {
  partId: string;
  quantity: number;
  type: StockMovementType;
  reason: string;
  orderId?: string;
  user: string;
  idempotencyKey?: string;
}

function findPart(draft: Database, partId: string): Part {
  const part = draft.parts.find((item) => item.id === partId);
  if (!part) throw new NotFoundError('Item not found in stock.');
  return part;
}

function assertQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new ValidationError('Quantity must be a whole number of at least 1.');
  }
}

function assertNoDuplicate(draft: Database, idempotencyKey: string | undefined): void {
  if (!idempotencyKey) return;
  const exists = draft.stockMovements.some((row) => row.idempotencyKey === idempotencyKey);
  if (exists) throw new ConflictError('This stock change was already recorded.');
}

function record(draft: Database, part: Part, input: MovementInput, delta: number): StockMovement {
  const now = nowIso();
  const nextQuantity = round2(part.quantity + delta);
  const allowNegative = draft.settings.allowNegativeStock;
  if (nextQuantity < 0 && !allowNegative) {
    throw new ValidationError(
      `Not enough stock. ${part.name} has only ${part.quantity} available.`,
      [`Available: ${part.quantity}`, `Requested: ${input.quantity}`],
    );
  }

  const movement: StockMovement = {
    id: newId('MOV'),
    partId: part.id,
    partName: part.name,
    orderId: input.orderId ?? '',
    type: input.type,
    quantity: input.quantity,
    reason: input.reason.trim() || 'No reason given',
    balanceAfter: nextQuantity,
    date: now,
    user: input.user,
    idempotencyKey: input.idempotencyKey ?? '',
    createdAt: now,
  };

  part.quantity = nextQuantity;
  part.updatedAt = now;
  draft.stockMovements.push(movement);
  return movement;
}

export function applyStockIn(
  draft: Database,
  input: MovementInput,
): { movement: StockMovement; part: Part } {
  assertQuantity(input.quantity);
  assertNoDuplicate(draft, input.idempotencyKey);
  const part = findPart(draft, input.partId);
  const movement = record(draft, part, { ...input, type: 'IN' }, input.quantity);
  return { movement, part };
}

export function applyStockOut(
  draft: Database,
  input: MovementInput,
): { movement: StockMovement; part: Part } {
  assertQuantity(input.quantity);
  assertNoDuplicate(draft, input.idempotencyKey);
  const part = findPart(draft, input.partId);
  const movement = record(draft, part, { ...input, type: 'OUT' }, -input.quantity);
  return { movement, part };
}

export function applyReturn(
  draft: Database,
  input: MovementInput,
): { movement: StockMovement; part: Part } {
  assertQuantity(input.quantity);
  assertNoDuplicate(draft, input.idempotencyKey);
  const part = findPart(draft, input.partId);
  const movement = record(draft, part, { ...input, type: 'RETURN' }, input.quantity);
  return { movement, part };
}

/** Manual correction, e.g. stock count found a difference. */
export function applyAdjust(
  draft: Database,
  input: { partId: string; newQuantity: number; reason: string; user: string },
): { movement: StockMovement; part: Part } {
  const part = findPart(draft, input.partId);
  if (!Number.isInteger(input.newQuantity) || input.newQuantity < 0) {
    throw new ValidationError('Quantity must be 0 or more.');
  }
  const delta = input.newQuantity - part.quantity;
  if (delta === 0) {
    throw new ValidationError('Stock is already this much. Nothing to correct.');
  }
  const now = nowIso();
  const movement: StockMovement = {
    id: newId('MOV'),
    partId: part.id,
    partName: part.name,
    orderId: '',
    type: 'ADJUST',
    quantity: Math.abs(delta),
    reason: input.reason.trim() || 'Stock corrected',
    balanceAfter: input.newQuantity,
    date: now,
    user: input.user,
    idempotencyKey: '',
    createdAt: now,
  };
  part.quantity = input.newQuantity;
  part.updatedAt = now;
  draft.stockMovements.push(movement);
  return { movement, part };
}

/* ------------------------------------------------------------------ */
/* Order part reservation (no stock change until the part is consumed) */
/* ------------------------------------------------------------------ */

export function reserveOrderPart(
  draft: Database,
  input: { orderId: string; partId: string; quantity: number; unitPrice: number },
): OrderPart {
  assertQuantity(input.quantity);
  const part = findPart(draft, input.partId);
  if (input.unitPrice < 0) throw new ValidationError('Price cannot be negative.');

  const now = nowIso();
  const line: OrderPart = {
    id: newId('OP'),
    orderId: input.orderId,
    partId: part.id,
    partName: part.name,
    quantity: input.quantity,
    unitPrice: round2(input.unitPrice),
    consumed: false,
    consumedAt: '',
    consumeMode: part.consumeMode,
    createdAt: now,
    updatedAt: now,
  };
  draft.orderParts.push(line);
  return line;
}

export function removeOrderPart(draft: Database, orderId: string, lineId: string): void {
  const index = draft.orderParts.findIndex((line) => line.id === lineId && line.orderId === orderId);
  if (index === -1) throw new NotFoundError('Part line not found on this order.');
  const line = draft.orderParts[index];
  if (line && line.consumed) {
    throw new ConflictError('This part is already used. Return it first, then remove it.');
  }
  draft.orderParts.splice(index, 1);
}

/**
 * "Part Used" - the ONLY moment stock leaves for a repair part.
 * Idempotent: confirming twice does not double-deduct.
 */
export function consumeOrderPart(
  draft: Database,
  input: { orderId: string; lineId: string; user: string },
): { line: OrderPart; part: Part; movement: StockMovement } {
  const line = draft.orderParts.find((item) => item.id === input.lineId && item.orderId === input.orderId);
  if (!line) throw new NotFoundError('Part line not found on this order.');
  if (line.consumed) throw new ConflictError('This part is already marked as used.');

  const part = findPart(draft, line.partId);
  const { movement } = applyStockOut(draft, {
    partId: line.partId,
    quantity: line.quantity,
    type: 'OUT',
    reason: 'Used for repair',
    orderId: input.orderId,
    user: input.user,
  });
  line.consumed = true;
  line.consumedAt = nowIso();
  line.updatedAt = line.consumedAt;
  return { line, part, movement };
}

/** Consumed part came back unused: 4 -> 5 */
export function returnOrderPart(
  draft: Database,
  input: { orderId: string; lineId: string; user: string; quantity?: number },
): { line: OrderPart; part: Part; movement: StockMovement } {
  const line = draft.orderParts.find((item) => item.id === input.lineId && item.orderId === input.orderId);
  if (!line) throw new NotFoundError('Part line not found on this order.');
  if (!line.consumed) throw new ConflictError('This part is not marked as used yet.');
  const quantity = input.quantity ?? line.quantity;
  assertQuantity(quantity);

  const part = findPart(draft, line.partId);
  const { movement } = applyReturn(draft, {
    partId: line.partId,
    quantity,
    type: 'RETURN',
    reason: 'Part returned unused',
    orderId: input.orderId,
    user: input.user,
  });
  line.consumed = false;
  line.consumedAt = '';
  line.quantity = Math.max(0, line.quantity - quantity);
  line.updatedAt = nowIso();
  return { line, part, movement };
}

/**
 * Consumables marked "Consume On Delivery" leave stock at the moment the
 * customer collects the device - never when the order is created.
 */
export function consumeDeliveryConsumables(
  draft: Database,
  input: { orderId: string; user: string },
): { part: Part; movement: StockMovement }[] {
  const lines = draft.orderParts.filter(
    (line) => line.orderId === input.orderId && !line.consumed && line.consumeMode === 'DELIVERY',
  );
  const done: { part: Part; movement: StockMovement }[] = [];
  for (const line of lines) {
    const part = findPart(draft, line.partId);
    const { movement } = applyStockOut(draft, {
      partId: line.partId,
      quantity: line.quantity,
      type: 'OUT',
      reason: 'Given with device on delivery',
      orderId: input.orderId,
      user: input.user,
    });
    line.consumed = true;
    line.consumedAt = nowIso();
    line.updatedAt = line.consumedAt;
    done.push({ part, movement });
  }
  return done;
}
