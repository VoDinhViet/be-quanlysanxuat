import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schemas';
import {
  bomLines,
  clients,
  operations,
  productRevisions,
  products,
  productTypes,
  ProductItemType,
  ProductStatus,
  routingSteps,
  units,
} from '../schemas';

const fakeUnits = [
  { code: 'PCS', name: 'Cái', note: 'Đơn vị đếm rời' },
  { code: 'SET', name: 'Bộ', note: 'Bộ sản phẩm/cụm lắp ráp' },
  { code: 'M', name: 'Mét', note: 'Chiều dài vật tư' },
  { code: 'KG', name: 'Kilogram', note: 'Khối lượng vật tư' },
  { code: 'M2', name: 'Mét vuông', note: 'Diện tích tấm' },
] as const;

const fakeProductTypes = [
  { code: 'fg', name: 'Thành phẩm', description: 'Sản phẩm hoàn chỉnh giao khách' },
  { code: 'wip', name: 'Bán thành phẩm', description: 'Cụm/part trung gian dùng trong BOM' },
  { code: 'rm', name: 'Nguyên vật liệu', description: 'Vật tư đầu vào sản xuất' },
  { code: 'consumable', name: 'Vật tư phụ', description: 'Vật tư tiêu hao trong sản xuất' },
] as const;

const fakeOperations = [
  { code: 'CUT', name: 'Cắt phôi', note: 'Cắt vật tư theo bản vẽ' },
  { code: 'CNC', name: 'Gia công CNC', note: 'Phay/khoan/taro chính xác' },
  { code: 'WELD', name: 'Hàn kết cấu', note: 'Hàn MIG/TIG theo jig' },
  { code: 'GRIND', name: 'Mài hoàn thiện', note: 'Mài ba via và xử lý bề mặt' },
  { code: 'PAINT', name: 'Sơn tĩnh điện', note: 'Sơn phủ hoàn thiện' },
  { code: 'ASSY', name: 'Lắp ráp', note: 'Lắp cụm và thành phẩm' },
  { code: 'QC', name: 'Kiểm tra chất lượng', note: 'Kiểm tra kích thước và ngoại quan' },
] as const;

const fakeProducts = [
  {
    code: 'TH-FG-001',
    name: 'Khung chân bàn nâng hạ 1200mm',
    itemType: ProductItemType.Fg,
    unitCode: 'SET',
    clientCode: 'KH001',
    note: 'Thành phẩm khung thép sơn tĩnh điện, dùng cho bàn nâng hạ văn phòng.',
  },
  {
    code: 'TH-FG-002',
    name: 'Tủ điện inox IP54 600x800',
    itemType: ProductItemType.Fg,
    unitCode: 'PCS',
    clientCode: 'KH003',
    note: 'Vỏ tủ điện inox 304 có ron chống bụi, sản xuất theo bản vẽ khách hàng.',
  },
  {
    code: 'TH-FG-003',
    name: 'Băng tải con lăn 2m',
    itemType: ProductItemType.Fg,
    unitCode: 'SET',
    clientCode: 'KH005',
    note: 'Băng tải con lăn tự do cho line đóng gói, chiều dài 2m.',
  },
  {
    code: 'TH-WIP-001',
    name: 'Cụm khung hàn chân bàn',
    itemType: ProductItemType.Wip,
    unitCode: 'SET',
    clientCode: null,
    note: 'Cụm hàn trung gian trước công đoạn mài và sơn.',
  },
  {
    code: 'TH-WIP-002',
    name: 'Cụm trục con lăn D50',
    itemType: ProductItemType.Wip,
    unitCode: 'PCS',
    clientCode: null,
    note: 'Cụm con lăn đã gia công trục và bạc đỡ.',
  },
  {
    code: 'TH-WIP-003',
    name: 'Cánh cửa tủ điện inox',
    itemType: ProductItemType.Wip,
    unitCode: 'PCS',
    clientCode: null,
    note: 'Cánh cửa chấn gấp từ inox 304, chưa lắp phụ kiện.',
  },
  {
    code: 'TH-RM-001',
    name: 'Thép hộp 40x40x1.4',
    itemType: ProductItemType.Rm,
    unitCode: 'M',
    clientCode: null,
    note: 'Thép hộp mạ kẽm dùng làm khung chân bàn và khung băng tải.',
  },
  {
    code: 'TH-RM-002',
    name: 'Tấm inox 304 dày 1.5mm',
    itemType: ProductItemType.Rm,
    unitCode: 'M2',
    clientCode: null,
    note: 'Tấm inox 304 bề mặt hairline dùng cho vỏ tủ điện.',
  },
  {
    code: 'TH-RM-003',
    name: 'Ống thép D50 mạ kẽm',
    itemType: ProductItemType.Rm,
    unitCode: 'M',
    clientCode: null,
    note: 'Ống thép đường kính 50mm dùng gia công con lăn.',
  },
  {
    code: 'TH-CONS-001',
    name: 'Sơn tĩnh điện màu đen nhám',
    itemType: ProductItemType.Consumable,
    unitCode: 'KG',
    clientCode: null,
    note: 'Bột sơn tĩnh điện màu đen nhám dùng cho khung thép.',
  },
] as const;

const fakeBomLines = [
  { parentCode: 'TH-FG-001', childCode: 'TH-WIP-001', qty: '1', unitCode: 'SET', sortOrder: 1 },
  { parentCode: 'TH-FG-001', childCode: 'TH-CONS-001', qty: '0.25', unitCode: 'KG', sortOrder: 2 },
  { parentCode: 'TH-WIP-001', childCode: 'TH-RM-001', qty: '6.2', unitCode: 'M', sortOrder: 1 },
  { parentCode: 'TH-FG-002', childCode: 'TH-WIP-003', qty: '1', unitCode: 'PCS', sortOrder: 1 },
  { parentCode: 'TH-FG-002', childCode: 'TH-RM-002', qty: '2.4', unitCode: 'M2', sortOrder: 2 },
  { parentCode: 'TH-WIP-003', childCode: 'TH-RM-002', qty: '1.1', unitCode: 'M2', sortOrder: 1 },
  { parentCode: 'TH-FG-003', childCode: 'TH-WIP-002', qty: '8', unitCode: 'PCS', sortOrder: 1 },
  { parentCode: 'TH-FG-003', childCode: 'TH-RM-001', qty: '4', unitCode: 'M', sortOrder: 2 },
  { parentCode: 'TH-WIP-002', childCode: 'TH-RM-003', qty: '0.55', unitCode: 'M', sortOrder: 1 },
] as const;

const fakeRoutingSteps = [
  { itemCode: 'TH-FG-001', stepNo: 10, operationCode: 'ASSY', note: 'Lắp cụm khung vào bộ gá.' },
  {
    itemCode: 'TH-FG-001',
    stepNo: 20,
    operationCode: 'QC',
    note: 'Kiểm tra độ phẳng và ngoại quan sơn.',
  },
  { itemCode: 'TH-WIP-001', stepNo: 10, operationCode: 'CUT', note: 'Cắt thép hộp theo bản vẽ.' },
  {
    itemCode: 'TH-WIP-001',
    stepNo: 20,
    operationCode: 'WELD',
    note: 'Hàn khung bằng jig cố định.',
  },
  {
    itemCode: 'TH-WIP-001',
    stepNo: 30,
    operationCode: 'GRIND',
    note: 'Mài mối hàn trước khi sơn.',
  },
  { itemCode: 'TH-FG-002', stepNo: 10, operationCode: 'ASSY', note: 'Lắp ron và phụ kiện cửa tủ.' },
  {
    itemCode: 'TH-FG-002',
    stepNo: 20,
    operationCode: 'QC',
    note: 'Kiểm tra kích thước và độ kín.',
  },
  { itemCode: 'TH-WIP-003', stepNo: 10, operationCode: 'CNC', note: 'Cắt laser/chấn cánh cửa.' },
  { itemCode: 'TH-WIP-003', stepNo: 20, operationCode: 'GRIND', note: 'Xử lý ba via cạnh chấn.' },
  {
    itemCode: 'TH-FG-003',
    stepNo: 10,
    operationCode: 'ASSY',
    note: 'Lắp con lăn vào khung băng tải.',
  },
  { itemCode: 'TH-FG-003', stepNo: 20, operationCode: 'QC', note: 'Chạy thử quay con lăn.' },
  { itemCode: 'TH-WIP-002', stepNo: 10, operationCode: 'CNC', note: 'Gia công ống và đầu trục.' },
] as const;

type Db = ReturnType<typeof drizzle<typeof schema>>;

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    await seedFakeProducts(db);
  } finally {
    await client.end();
  }
}

async function seedFakeProducts(db: Db): Promise<void> {
  await seedReferenceData(db);

  const clientCodes = fakeProducts.reduce<string[]>((codes, product) => {
    if (product.clientCode) {
      codes.push(product.clientCode);
    }

    return codes;
  }, []);
  const [unitMap, clientMap] = await Promise.all([
    getUnitMap(
      db,
      fakeUnits.map((unit) => unit.code),
    ),
    getClientMap(db, clientCodes),
  ]);

  await seedProducts(db, unitMap, clientMap);

  const [productMap, revisionMap, operationMap] = await Promise.all([
    getProductMap(
      db,
      fakeProducts.map((product) => product.code),
    ),
    getRevisionMap(db),
    getOperationMap(
      db,
      fakeOperations.map((operation) => operation.code),
    ),
  ]);

  await seedBomLines(db, productMap, revisionMap, unitMap);
  await seedRoutingSteps(db, productMap, revisionMap, operationMap);
}

async function seedReferenceData(db: Db): Promise<void> {
  await seedMissingUnits(db);
  await seedMissingProductTypes(db);
  await seedMissingOperations(db);
}

async function seedProducts(
  db: Db,
  unitMap: Map<string, typeof units.$inferSelect>,
  clientMap: Map<string, typeof clients.$inferSelect>,
): Promise<void> {
  const existingProductMap = await getProductMap(
    db,
    fakeProducts.map((product) => product.code),
  );
  const productRows = fakeProducts
    .filter((product) => !existingProductMap.has(product.code))
    .map((product) => {
      const unit = unitMap.get(product.unitCode);

      if (!unit) {
        throw new Error(`Missing unit ${product.unitCode}`);
      }

      return {
        code: product.code,
        name: product.name,
        itemType: product.itemType,
        unitId: unit.id,
        clientId: product.clientCode ? clientMap.get(product.clientCode)?.id : null,
        status: ProductStatus.Active,
        note: product.note,
      };
    });

  if (productRows.length > 0) {
    await db.insert(products).values(productRows);
  }

  const currentProductMap = await getProductMap(
    db,
    fakeProducts.map((product) => product.code),
  );
  const revisions = await db
    .select({ productId: productRevisions.productId, revisionNo: productRevisions.revisionNo })
    .from(productRevisions)
    .where(
      inArray(
        productRevisions.productId,
        [...currentProductMap.values()].map((product) => product.id),
      ),
    );
  const existingRevisionKeys = new Set(
    revisions.map((revision) => `${revision.productId}:${revision.revisionNo}`),
  );
  const revisionRows = [...currentProductMap.values()]
    .filter((product) => !existingRevisionKeys.has(`${product.id}:R1`))
    .map((product) => ({
      productId: product.id,
      revisionNo: 'R1',
      note: 'Revision mẫu ban đầu',
    }));

  if (revisionRows.length > 0) {
    await db.insert(productRevisions).values(revisionRows);
  }
}

async function seedBomLines(
  db: Db,
  productMap: Map<string, typeof products.$inferSelect>,
  revisionMap: Map<string, typeof productRevisions.$inferSelect>,
  unitMap: Map<string, typeof units.$inferSelect>,
): Promise<void> {
  const existingLines = await db
    .select({
      productRevisionId: bomLines.productRevisionId,
      parentItemId: bomLines.parentItemId,
      childItemId: bomLines.childItemId,
    })
    .from(bomLines)
    .where(isNull(bomLines.deletedAt));
  const existingLineKeys = new Set(
    existingLines.map(
      (line) => `${line.productRevisionId}:${line.parentItemId}:${line.childItemId}`,
    ),
  );
  const rows = fakeBomLines
    .map((line) => {
      const parent = productMap.get(line.parentCode);
      const child = productMap.get(line.childCode);
      const revision = revisionMap.get(line.parentCode);
      const unit = unitMap.get(line.unitCode);

      if (!parent || !child || !revision || !unit) {
        throw new Error(`Missing BOM dependency for ${line.parentCode} -> ${line.childCode}`);
      }

      const key = `${revision.id}:${parent.id}:${child.id}`;

      if (existingLineKeys.has(key)) {
        return null;
      }

      return {
        productRevisionId: revision.id,
        parentItemId: parent.id,
        childItemId: child.id,
        qty: line.qty,
        unitId: unit.id,
        scrapRate: '0',
        level: parent.itemType === ProductItemType.Fg ? 1 : 2,
        sortOrder: line.sortOrder,
        note: 'BOM mẫu phục vụ demo sản xuất',
      };
    })
    .filter((line): line is NonNullable<typeof line> => Boolean(line));

  if (rows.length > 0) {
    await db.insert(bomLines).values(rows);
  }
}

async function seedRoutingSteps(
  db: Db,
  productMap: Map<string, typeof products.$inferSelect>,
  revisionMap: Map<string, typeof productRevisions.$inferSelect>,
  operationMap: Map<string, typeof operations.$inferSelect>,
): Promise<void> {
  const existingSteps = await db
    .select({
      productRevisionId: routingSteps.productRevisionId,
      itemId: routingSteps.itemId,
      stepNo: routingSteps.stepNo,
    })
    .from(routingSteps)
    .where(isNull(routingSteps.deletedAt));
  const existingStepKeys = new Set(
    existingSteps.map((step) => `${step.productRevisionId}:${step.itemId}:${step.stepNo}`),
  );
  const rows = fakeRoutingSteps
    .map((step) => {
      const product = productMap.get(step.itemCode);
      const revision = revisionMap.get(step.itemCode);
      const operation = operationMap.get(step.operationCode);

      if (!product || !revision || !operation) {
        throw new Error(`Missing routing dependency for ${step.itemCode} step ${step.stepNo}`);
      }

      const key = `${revision.id}:${product.id}:${step.stepNo}`;

      if (existingStepKeys.has(key)) {
        return null;
      }

      return {
        productRevisionId: revision.id,
        itemId: product.id,
        operationId: operation.id,
        stepNo: step.stepNo,
        isOutsideProcess: false,
        note: step.note,
      };
    })
    .filter((step): step is NonNullable<typeof step> => Boolean(step));

  if (rows.length > 0) {
    await db.insert(routingSteps).values(rows);
  }
}

async function seedMissingUnits(db: Db): Promise<void> {
  const existingRows = await db
    .select({ code: units.code })
    .from(units)
    .where(
      inArray(
        units.code,
        fakeUnits.map((unit) => unit.code),
      ),
    );
  const existingCodes = new Set(existingRows.map((row) => row.code));
  const missingRows = fakeUnits.filter((unit) => !existingCodes.has(unit.code));

  if (missingRows.length > 0) {
    await db.insert(units).values(missingRows);
  }
}

async function seedMissingProductTypes(db: Db): Promise<void> {
  const existingRows = await db
    .select({ code: productTypes.code })
    .from(productTypes)
    .where(
      inArray(
        productTypes.code,
        fakeProductTypes.map((type) => type.code),
      ),
    );
  const existingCodes = new Set(existingRows.map((row) => row.code));
  const missingRows = fakeProductTypes.filter((type) => !existingCodes.has(type.code));

  if (missingRows.length > 0) {
    await db.insert(productTypes).values(missingRows);
  }
}

async function seedMissingOperations(db: Db): Promise<void> {
  const existingRows = await db
    .select({ code: operations.code })
    .from(operations)
    .where(
      inArray(
        operations.code,
        fakeOperations.map((operation) => operation.code),
      ),
    );
  const existingCodes = new Set(existingRows.map((row) => row.code));
  const missingRows = fakeOperations.filter((operation) => !existingCodes.has(operation.code));

  if (missingRows.length > 0) {
    await db.insert(operations).values(missingRows);
  }
}

async function getUnitMap(
  db: Db,
  codes: string[],
): Promise<Map<string, typeof units.$inferSelect>> {
  if (codes.length === 0) {
    return new Map();
  }

  const rows = await db.select().from(units).where(inArray(units.code, codes));

  return new Map(rows.map((row) => [row.code, row]));
}

async function getClientMap(
  db: Db,
  codes: string[],
): Promise<Map<string, typeof clients.$inferSelect>> {
  if (codes.length === 0) {
    return new Map();
  }

  const rows = await db.select().from(clients).where(inArray(clients.code, codes));

  return new Map(rows.map((row) => [row.code, row]));
}

async function getProductMap(
  db: Db,
  codes: string[],
): Promise<Map<string, typeof products.$inferSelect>> {
  if (codes.length === 0) {
    return new Map();
  }

  const rows = await db.select().from(products).where(inArray(products.code, codes));

  return new Map(rows.map((row) => [row.code, row]));
}

async function getOperationMap(
  db: Db,
  codes: string[],
): Promise<Map<string, typeof operations.$inferSelect>> {
  if (codes.length === 0) {
    return new Map();
  }

  const rows = await db.select().from(operations).where(inArray(operations.code, codes));

  return new Map(rows.map((row) => [row.code, row]));
}

async function getRevisionMap(db: Db): Promise<Map<string, typeof productRevisions.$inferSelect>> {
  const productMap = await getProductMap(
    db,
    fakeProducts.map((product) => product.code),
  );
  const productRows = [...productMap.values()];

  if (productRows.length === 0) {
    return new Map();
  }

  const revisions = await db
    .select()
    .from(productRevisions)
    .where(
      and(
        inArray(
          productRevisions.productId,
          productRows.map((product) => product.id),
        ),
        eq(productRevisions.revisionNo, 'R1'),
        isNull(productRevisions.deletedAt),
      ),
    );
  const productIdToCode = new Map(productRows.map((product) => [product.id, product.code]));

  return new Map(
    revisions.map((revision) => {
      const code = productIdToCode.get(revision.productId);

      if (!code) {
        throw new Error(`Missing product code for revision ${revision.id}`);
      }

      return [code, revision];
    }),
  );
}

main()
  .then(() => {
    console.log('Fake products seeded successfully');
  })
  .catch((error) => {
    console.error('Failed to seed fake products');
    console.error(error);
    process.exit(1);
  });
