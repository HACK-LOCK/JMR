import type { Supplier } from '../../../shared/domain';
import { newId, nowIso } from '../core/id';
import { NotFoundError } from '../core/errors';
import { mutate, read, type MutationResult } from '../data/mutate';
import type { z } from 'zod';
import type { supplierCreateSchema } from '../validation/schemas';

type SupplierInput = z.infer<typeof supplierCreateSchema>;

export interface SupplierListItem extends Supplier {
  itemCount: number;
  stockValue: number;
}

export function listSuppliers(): SupplierListItem[] {
  const db = read();
  return db.suppliers
    .map((supplier) => {
      const items = db.parts.filter((part) => part.supplierId === supplier.id);
      return {
        ...supplier,
        itemCount: items.length,
        stockValue: items.reduce((sum, part) => sum + part.quantity * part.purchaseCost, 0),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getSupplier(id: string): SupplierListItem {
  const db = read();
  const supplier = db.suppliers.find((item) => item.id === id);
  if (!supplier) throw new NotFoundError('Supplier not found.');
  const items = db.parts.filter((part) => part.supplierId === id);
  return {
    ...supplier,
    itemCount: items.length,
    stockValue: items.reduce((sum, part) => sum + part.quantity * part.purchaseCost, 0),
  };
}

export async function createSupplier(input: SupplierInput): Promise<MutationResult<Supplier>> {
  const now = nowIso();
  const supplier: Supplier = {
    id: newId('SUP'),
    name: input.name,
    mobile: input.mobile ?? '',
    notes: input.notes ?? '',
    createdAt: now,
    updatedAt: now,
  };
  return mutate((draft) => {
    draft.suppliers.push(supplier);
    return supplier;
  });
}

export async function updateSupplier(id: string, patch: Partial<SupplierInput>): Promise<MutationResult<Supplier>> {
  return mutate((draft) => {
    const supplier = draft.suppliers.find((item) => item.id === id);
    if (!supplier) throw new NotFoundError('Supplier not found.');
    if (patch.name !== undefined) supplier.name = patch.name;
    if (patch.mobile !== undefined) supplier.mobile = patch.mobile;
    if (patch.notes !== undefined) supplier.notes = patch.notes;
    supplier.updatedAt = nowIso();
    return supplier;
  });
}

export async function deleteSupplier(id: string): Promise<MutationResult<{ id: string }>> {
  return mutate((draft) => {
    const index = draft.suppliers.findIndex((item) => item.id === id);
    if (index === -1) throw new NotFoundError('Supplier not found.');
    draft.suppliers.splice(index, 1);
    // Keep the parts, just unlink them so no history is lost.
    draft.parts.forEach((part) => {
      if (part.supplierId === id) {
        part.supplierId = '';
        part.supplierName = '';
        part.updatedAt = nowIso();
      }
    });
    return { id };
  });
}
