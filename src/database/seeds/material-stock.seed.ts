import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { and, eq, inArray, isNull, like, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schemas';
import { credentials } from '../schemas/identity-access/credentials';
import { ItemType, items } from '../schemas/items/items';
import { inventoryBalances } from '../schemas/inventory/inventory-balances';
import {
  InventoryReceiptType,
  inventoryReceipts,
} from '../schemas/inventory/inventory-receipts';
import { inventoryReceiptItems } from '../schemas/inventory/inventory-receipt-items';
import { InventoryDocumentStatus } from '../schemas/inventory/inventory-documents';
import {
  InventoryReferenceType,
  InventoryTransactionType,
  inventoryTransactions,
} from '../schemas/inventory/inventory-transactions';
import { suppliers } from '../schemas/suppliers/suppliers';
import { warehouses, WarehouseStatus } from '../schemas/inventory/warehouses';

type SeedDatabase = ReturnType<typeof drizzle<typeof schema>>;

// Đi đúng đường nghiệp vụ (phiếu nhập POSTED → bút toán → balance), không ghi thẳng
// `inventory_balances`: seed chạy bằng ts-node, không dựng Nest context nên không gọi được
// `InventoryPostingService`, phải tự replay đúng thứ tự `applyLine` (balance trước, bút toán sau).
// Cố tình KHÔNG seed tồn FG/WIP — có tồn FG sẽ làm `ProductionOrdersService` tụt SL đề xuất sản
// xuất (thậm chí về 0, không sinh Job nào), phá luôn kịch bản test đường tự sinh đề xuất mua hàng.
// Không đảo ngược được: `KHO-NVL` sau khi có dòng sẽ không xoá được nữa (`E095`), và
// `inventory_transactions` append-only — gỡ sạch phải DELETE tay theo `reference_id`.
interface MaterialStockSeed {
  code: string;
  quantity: number;
  minStock: number;
}

const MATERIAL_STOCK: MaterialStockSeed[] = [
  { code: 'THEP-TAM-5', quantity: 120, minStock: 20 },
  { code: 'THEP-TAM-10', quantity: 80, minStock: 15 },
  { code: 'THEP-CUON-2', quantity: 500, minStock: 100 },
  { code: 'ONG-INOX-D21', quantity: 2, minStock: 15 },
  { code: 'ONG-INOX-D27', quantity: 4, minStock: 20 },
  { code: 'BULONG-M10', quantity: 25, minStock: 200 },
  { code: 'NHOM-TAM-3', quantity: 60, minStock: 10 },
  { code: 'SON-TRANG', quantity: 40, minStock: 10 },
  { code: 'BULONG-M8', quantity: 0, minStock: 300 },
  { code: 'SON-DEN', quantity: 0, minStock: 25 },
];

interface ReceiptLineSeed {
  code: string;
  unitPrice: number;
}

interface ReceiptSeed {
  supplierCode: string;
  daysAgo: number;
  lines: ReceiptLineSeed[];
}

// 3 phiếu, 3 ngày lùi khác nhau — đủ 4 mốc `asOfDate` phân biệt khi test màn tồn kho vật tư (trước
// mọi phiếu / sau PN#1 / sau PN#2 / hiện tại). `quantity` không lặp ở đây, tra ngược từ
// MATERIAL_STOCK theo `code`.
const RECEIPTS: ReceiptSeed[] = [
  {
    supplierCode: 'THEP-VIET-NHAT',
    daysAgo: 20,
    lines: [
      { code: 'THEP-TAM-5', unitPrice: 850_000 },
      { code: 'THEP-TAM-10', unitPrice: 1_650_000 },
      { code: 'THEP-CUON-2', unitPrice: 22_000 },
    ],
  },
  {
    supplierCode: 'CKMN-LINHKIEN',
    daysAgo: 12,
    lines: [
      { code: 'ONG-INOX-D21', unitPrice: 185_000 },
      { code: 'ONG-INOX-D27', unitPrice: 240_000 },
      { code: 'BULONG-M10', unitPrice: 3_500 },
    ],
  },
  {
    supplierCode: 'NVL-DONG-A',
    daysAgo: 5,
    lines: [
      { code: 'NHOM-TAM-3', unitPrice: 1_200_000 },
      { code: 'SON-TRANG', unitPrice: 165_000 },
    ],
  },
];

// Giờ 00:00 UTC — `date({mode:'date'})` của Drizzle map ra driver bằng `toISOString()`, nên dựng
// bằng `new Date(y,m,d)` (giờ địa phương) sẽ lệch một ngày ở TZ dương (đã xảy ra ở
// `supplier-returns.seed.ts`). Ngày chứng từ ở seed này còn dùng để verify `asOfDate` nên không
// được lệch.
function daysAgoUtc(days: number): Date {
  const now = new Date();
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );

  return new Date(todayUtc - days * 86_400_000);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    await seedMaterialStock(db);
  } finally {
    await client.end();
  }
}

async function seedMaterialStock(db: SeedDatabase): Promise<void> {
  const admin = await db.query.credentials.findFirst({
    where: eq(credentials.username, 'admin'),
    columns: { userId: true },
  });

  if (!admin) {
    console.warn(
      'Credential "admin" not found — seeded receipts will have createdBy/postedBy = null. Run `pnpm db:seed:credentials` first for a complete seed.',
    );
  }

  const userId = admin?.userId ?? null;

  const warehouse = await db.query.warehouses.findFirst({
    where: eq(warehouses.code, 'KHO-NVL'),
  });

  if (!warehouse) {
    throw new Error(
      'Warehouse "KHO-NVL" not found — run `pnpm db:seed:warehouses` first.',
    );
  }

  if (warehouse.status !== WarehouseStatus.ACTIVE) {
    console.warn(
      'Warehouse "KHO-NVL" is not ACTIVE — seeded balances will still be written, but the app blocks new receipts against an inactive warehouse (E094).',
    );
  }

  const materialCodes = MATERIAL_STOCK.map((m) => m.code);
  const materialRows = await db.query.items.findMany({
    where: and(
      eq(items.type, ItemType.RM),
      isNull(items.deletedAt),
      inArray(items.code, materialCodes),
    ),
    columns: { id: true, code: true, minStock: true },
  });

  if (materialRows.length === 0) {
    throw new Error(
      'No RM items found among the expected codes — run `pnpm db:seed:items` first.',
    );
  }

  const itemByCode = new Map(materialRows.map((row) => [row.code, row]));

  for (const code of materialCodes) {
    if (!itemByCode.has(code)) {
      console.warn(`Material item "${code}" not found. Skipping.`);
    }
  }

  const supplierCodes = [...new Set(RECEIPTS.map((r) => r.supplierCode))];
  const supplierRows = await db.query.suppliers.findMany({
    where: and(
      isNull(suppliers.deletedAt),
      inArray(suppliers.code, supplierCodes),
    ),
    columns: { id: true, code: true },
  });
  const supplierIdByCode = new Map(supplierRows.map((s) => [s.code, s.id]));

  for (const code of supplierCodes) {
    if (!supplierIdByCode.has(code)) {
      console.warn(
        `Supplier "${code}" not found — receipt will have supplierId = null.`,
      );
    }
  }

  // Pass A — minStock, chạy cho cả 10 mã, độc lập với pass B (tồn kho): tách riêng để một DB đã có
  // sẵn tồn cho vài mã không khiến những mã đó mãi mãi minStock = 0.
  for (const spec of MATERIAL_STOCK) {
    const item = itemByCode.get(spec.code);

    if (!item) {
      continue;
    }

    if (item.minStock !== 0) {
      console.log(
        `Item "${spec.code}" already has minStock = ${item.minStock}. Skipping.`,
      );
      continue;
    }

    await db
      .update(items)
      .set({ minStock: spec.minStock })
      .where(eq(items.id, item.id));

    console.log(`Item "${spec.code}" minStock set to ${spec.minStock}.`);
  }

  // Pass B — tồn kho. Khoá idempotency là unique thật (warehouseId, itemId) trên
  // inventory_balances, không phải mã phiếu — mã phiếu do app tạo độc lập, dùng nó làm khoá dễ đụng
  // hàng của app.
  const quantityByCode = new Map(
    MATERIAL_STOCK.filter((m) => m.quantity > 0).map((m) => [
      m.code,
      m.quantity,
    ]),
  );

  const codesNeedingStock = new Set<string>();
  for (const [code, item] of itemByCode) {
    if (!quantityByCode.has(code)) {
      continue;
    }

    const existingBalance = await db.query.inventoryBalances.findFirst({
      where: and(
        eq(inventoryBalances.warehouseId, warehouse.id),
        eq(inventoryBalances.itemId, item.id),
      ),
      columns: { quantity: true },
    });

    if (existingBalance) {
      console.log(
        `Balance for "${code}" already exists (qty=${existingBalance.quantity}). Skipping.`,
      );
      continue;
    }

    codesNeedingStock.add(code);
  }

  const maxSeqByYear = new Map<number, number>();

  async function nextReceiptCode(receiptDate: Date): Promise<string> {
    const year = receiptDate.getUTCFullYear();
    let maxSeq = maxSeqByYear.get(year);

    if (maxSeq === undefined) {
      const [row] = await db
        .select({
          maxNumber:
            sql<number>`coalesce(max(substring(${inventoryReceipts.code} from ${`^PNK-${year}-([0-9]+)$`})::int), 0)`.mapWith(
              Number,
            ),
        })
        .from(inventoryReceipts)
        .where(like(inventoryReceipts.code, `PNK-${year}-%`));
      maxSeq = row?.maxNumber ?? 0;
    }

    maxSeq += 1;
    maxSeqByYear.set(year, maxSeq);

    return `PNK-${year}-${String(maxSeq).padStart(5, '0')}`;
  }

  for (const receiptSpec of RECEIPTS) {
    const lines = receiptSpec.lines.filter((line) =>
      codesNeedingStock.has(line.code),
    );

    if (!lines.length) {
      continue;
    }

    const receiptDate = daysAgoUtc(receiptSpec.daysAgo);
    const code = await nextReceiptCode(receiptDate);
    const supplierId = supplierIdByCode.get(receiptSpec.supplierCode) ?? null;

    await db.transaction(async (tx) => {
      const [receipt] = await tx
        .insert(inventoryReceipts)
        .values({
          code,
          warehouseId: warehouse.id,
          receiptType: InventoryReceiptType.PURCHASE,
          status: InventoryDocumentStatus.POSTED,
          receiptDate,
          supplierId,
          postedBy: userId,
          postedAt: new Date(),
          createdBy: userId,
        })
        .returning({ id: inventoryReceipts.id });

      for (const line of lines) {
        const item = itemByCode.get(line.code)!;
        const quantity = quantityByCode.get(line.code)!;

        await tx.insert(inventoryReceiptItems).values({
          receiptId: receipt.id,
          itemId: item.id,
          quantity,
          unitPrice: line.unitPrice,
        });

        await tx.insert(inventoryBalances).values({
          warehouseId: warehouse.id,
          itemId: item.id,
          quantity,
        });

        await tx.insert(inventoryTransactions).values({
          warehouseId: warehouse.id,
          itemId: item.id,
          type: InventoryTransactionType.RECEIPT,
          quantity,
          referenceType: InventoryReferenceType.INVENTORY_RECEIPT,
          referenceId: receipt.id,
          transactionDate: receiptDate,
          createdBy: userId,
        });
      }

      console.log(
        `Inventory receipt "${code}" created and posted with ${lines.length} line(s).`,
      );
    });
  }
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to seed material stock:', error);
      process.exit(1);
    });
}
