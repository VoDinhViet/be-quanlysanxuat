import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schemas';
import { credentials } from '../schemas/identity-access/credentials';
import { ItemType, items } from '../schemas/items/items';
import {
  IqcDisposition,
  IqcResult,
  IqcStatus,
  QualityInspectionDecision,
  QualityInspectionOriginType,
  QualityInspectionType,
} from '../schemas/quality/quality-enums';
import { qualityInspectionResults } from '../schemas/quality/quality-inspection-results';
import { qualityInspections } from '../schemas/quality/quality-inspections';
import { mapToQualityInspectionStatus } from '../../api/iqc/quality-inspection-status.util';

type SeedDatabase = ReturnType<typeof drizzle<typeof schema>>;

// Phủ đủ mọi tổ hợp `result`/`disposition`/`status` cùng lúc (xem `IqcService.resolveIqcStatus`);
// chỉ 2 dòng đầu gắn `inventoryReceiptId`/`purchaseOrderId` thật vì dev DB chỉ có vài phiếu nhập/PO.
const IQC_COUNT = 20;

const PATTERNS: {
  result: IqcResult | undefined;
  disposition: IqcDisposition | undefined;
  status: IqcStatus;
}[] = [
  {
    result: undefined,
    disposition: undefined,
    status: IqcStatus.NOT_INSPECTED,
  },
  {
    result: IqcResult.PASS,
    disposition: undefined,
    status: IqcStatus.COMPLETED,
  },
  { result: IqcResult.FAIL, disposition: undefined, status: IqcStatus.PENDING },
  {
    result: IqcResult.FAIL,
    disposition: IqcDisposition.CONCESSION,
    status: IqcStatus.COMPLETED,
  },
  {
    result: IqcResult.FAIL,
    disposition: IqcDisposition.SORT,
    status: IqcStatus.WAITING_RETURN,
  },
  {
    result: IqcResult.FAIL,
    disposition: IqcDisposition.RETURN,
    status: IqcStatus.WAITING_RETURN,
  },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    await seedIqcInspections(db);
  } finally {
    await client.end();
  }
}

async function seedIqcInspections(db: SeedDatabase): Promise<void> {
  const admin = await db.query.credentials.findFirst({
    where: eq(credentials.username, 'admin'),
    columns: { userId: true },
  });

  if (!admin) {
    console.warn(
      'Credential "admin" not found — seeded inspections will have createdBy = null. Run `pnpm db:seed:credentials` first for a complete seed.',
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

  const receipt = await db.query.inventoryReceipts.findFirst({
    columns: { id: true },
    orderBy: (row, { asc }) => asc(row.createdAt),
  });

  const purchaseOrder = await db.query.purchaseOrders.findFirst({
    columns: { id: true },
    orderBy: (row, { asc }) => asc(row.createdAt),
  });

  const year = new Date().getFullYear();

  for (let index = 0; index < IQC_COUNT; index++) {
    const code = `IQC-${year}-${String(index + 1).padStart(5, '0')}`;

    const existing = await db.query.qualityInspections.findFirst({
      where: and(
        eq(qualityInspections.inspectionType, QualityInspectionType.IQC),
        eq(qualityInspections.inspectionNo, code),
      ),
      columns: { id: true },
    });

    if (existing) {
      console.log(`IQC inspection "${code}" already exists. Skipping.`);
      continue;
    }

    const { result, disposition, status } = PATTERNS[index % PATTERNS.length];
    const supplierId = supplierRows[index % supplierRows.length].id;
    const itemId = materialRows[index % materialRows.length].id;
    const inspectionDate = new Date();
    inspectionDate.setDate(inspectionDate.getDate() - index);

    const inventoryReceiptId = index === 0 ? (receipt?.id ?? null) : null;
    const purchaseOrderId = index === 1 ? (purchaseOrder?.id ?? null) : null;
    const quantity = 10 + index * 5;
    const dbStatus = mapToQualityInspectionStatus(status);
    const dbDecision = result as string as
      | QualityInspectionDecision
      | undefined;

    await db.transaction(async (tx) => {
      const [inspection] = await tx
        .insert(qualityInspections)
        .values({
          inspectionNo: code,
          inspectionType: QualityInspectionType.IQC,
          originType: inventoryReceiptId
            ? QualityInspectionOriginType.INVENTORY_RECEIPT
            : QualityInspectionOriginType.MANUAL,
          originId: inventoryReceiptId,
          purchaseOrderId,
          supplierId,
          itemId,
          quantity,
          requestedAt: inspectionDate,
          decision: dbDecision,
          disposition,
          status: dbStatus,
          reason: purchaseOrderId ? null : 'Kiểm tra định kỳ theo lô',
          attemptCount: result ? 1 : 0,
          createdBy,
        })
        .returning({ id: qualityInspections.id });

      if (result) {
        await tx.insert(qualityInspectionResults).values({
          qualityInspectionId: inspection.id,
          inspectionType: QualityInspectionType.IQC,
          quantity,
          attemptNo: 1,
          inspectedAt: inspectionDate,
          decision: dbDecision!,
          disposition,
          resultingStatus: dbStatus,
          inspectedBy: createdBy,
        });
      }
    });

    console.log(`IQC inspection "${code}" created.`);
  }
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to seed IQC inspections:', error);
      process.exit(1);
    });
}
