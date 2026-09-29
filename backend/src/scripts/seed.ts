/**
 * Optional demo data so the app can be tried out immediately.
 * Run with:  npm run seed
 * Safe to run more than once - existing data is left alone.
 *
 * Refuses to run against a database. These are made up bills, parts and
 * suppliers, and the shop's real database has to start empty; a demo bill that
 * lands in the day's takings is not something anybody can notice later.
 */
import { env } from '../config/env';
import { initStore, getStore, isDatabaseConfigured } from '../data';
import { initUsers } from '../data/userStore';
import { mutate } from '../data/mutate';
import { nowIso } from '../core/id';
import type { Part, Supplier } from '../../../shared/domain';

async function main(): Promise<void> {
  if (isDatabaseConfigured()) {
    console.error(
      '\n  This is demo data and DATABASE_URL is set, so nothing was added.\n' +
        '  The shop database stays empty and is filled only by real bills.\n' +
        '  To try the app out, leave DATABASE_URL empty and run this again.\n',
    );
    process.exit(1);
  }

  await initStore();
  await initUsers();

  const existing = getStore().snapshot();
  if (existing.parts.length > 0 || existing.orders.length > 0) {
    console.log('Shop already has data. Nothing was added.');
    return;
  }

  await mutate((draft) => {
    const now = nowIso();
    const supplier: Supplier = {
      id: 'SUP-DEMO-1',
      name: 'Shreeji Mobile Parts',
      mobile: '9876543210',
      notes: 'Wholesale dealer, Modasa',
      createdAt: now,
      updatedAt: now,
    };
    draft.suppliers.push(supplier);

    const items: Part[] = [
      {
        id: 'PRT-DEMO-1',
        name: 'Samsung A55 Display',
        category: 'Repair Part',
        brand: 'Samsung',
        model: 'A55',
        quantity: 5,
        minQuantity: 2,
        purchaseCost: 2100,
        sellingPrice: 2900,
        supplierId: supplier.id,
        supplierName: supplier.name,
        consumeMode: 'PART_USED',
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'PRT-DEMO-2',
        name: 'Redmi Note 13 Battery',
        category: 'Repair Part',
        brand: 'Xiaomi',
        model: 'Note 13',
        quantity: 3,
        minQuantity: 2,
        purchaseCost: 550,
        sellingPrice: 850,
        supplierId: supplier.id,
        supplierName: supplier.name,
        consumeMode: 'PART_USED',
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'PRT-DEMO-3',
        name: 'Repair Folder',
        category: 'Folder',
        brand: '',
        model: '',
        quantity: 20,
        minQuantity: 10,
        purchaseCost: 12,
        sellingPrice: 0,
        supplierId: '',
        supplierName: '',
        consumeMode: 'DELIVERY',
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'PRT-DEMO-4',
        name: 'Mobile Tempered Glass',
        category: 'Accessory',
        brand: '',
        model: '',
        quantity: 40,
        minQuantity: 15,
        purchaseCost: 25,
        sellingPrice: 80,
        supplierId: supplier.id,
        supplierName: supplier.name,
        consumeMode: 'DELIVERY',
        active: true,
        createdAt: now,
        updatedAt: now,
      },
    ];
    draft.parts.push(...items);
    return null;
  });

  console.log('Demo stock and supplier added.');
  console.log(`Login with  ${env.owner.username} / ${env.owner.password}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
