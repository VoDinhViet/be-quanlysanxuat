import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schemas';
import { credentials } from '../schemas/identity-access/credentials';
import { ItemType, items } from '../schemas/items/items';
import { InventoryDocumentStatus } from '../schemas/inventory/inventory-documents';
import { supplierReturns } from '../schemas/inventory/supplier-returns';

type SeedDatabase = ReturnType<typeof drizzle<typeof schema>>;

// `GET /api/supplier-returns` has no create route yet (list-only, see the schema file's own doc
// comment) — this seed is the only way to see the screen with real rows. purchaseOrderId and
// inventoryReceiptId are left null on every row: the source tables are either still empty in a
// fresh dev DB or seeded independently (`pnpm db:seed:iqc`), and a null FK is also what exercises
// the list's "--" placeholder for Mã NK / PO.
const RETURN_COUNT = 24;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    await seedSupplierReturns(db);
  } finally {
    await client.end();
  }
}

async function seedSupplierReturns(db: SeedDatabase): Promise<void> {
  const admin = await db.query.credentials.findFirst({
    where: eq(credentials.username, 'admin'),
    columns: { userId: true },
  });

  if (!admin) {
    console.warn(
      'Credential "admin" not found — seeded returns will have createdBy = null. Run `pnpm db:seed:credentials` first for a complete seed.',
    );
  }

  const createdBy = admin?.userId ?? null;

  const supplierRows = await db.query.suppliers.findMany({
    columns: { id: true },
  });

  if (supplierRows.length === 0) {
    throw new Error('No suppliers found — run `pnpm db:seed:suppliers` first.');
  }

  const materialRows = await db.query.items.findMany({
    where: eq(items.type, ItemType.RM),
    columns: { id: true },
  });

  if (materialRows.length === 0) {
    throw new Error('No RM items found — run `pnpm db:seed:items` first.');
  }

  for (let index = 0; index < RETURN_COUNT; index++) {
    const code = `RT2406-${String(index + 1).padStart(3, '0')}`;

    const existing = await db.query.supplierReturns.findFirst({
      where: eq(supplierReturns.code, code),
      columns: { id: true },
    });

    if (existing) {
      console.log(`Supplier return "${code}" already exists. Skipping.`);
      continue;
    }

    const supplierId = supplierRows[index % supplierRows.length].id;
    const itemId = materialRows[index % materialRows.length].id;
    const returnDate = new Date();
    returnDate.setDate(returnDate.getDate() - index);

    await db.insert(supplierReturns).values({
      code,
      supplierId,
      itemId,
      quantity: 10 + index * 5,
      purchaseOrderId: null,
      inventoryReceiptId: null,
      returnDate,
      status:
        index % 2 === 0
          ? InventoryDocumentStatus.POSTED
          : InventoryDocumentStatus.DRAFT,
      createdBy,
    });

    console.log(`Supplier return "${code}" created.`);
  }
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to seed supplier returns:', error);
      process.exit(1);
    });
}
