import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schemas';
import { countries } from '../schemas/countries';
import { credentials } from '../schemas/credentials';
import { supplierGroups } from '../schemas/supplier-groups';
import {
  PaymentMethod,
  PaymentTerm,
  supplierPaymentInfo,
  supplierRepresentatives,
  suppliers,
  SupplierStatus,
  SupplierType,
} from '../schemas/suppliers';

type SeedDatabase = ReturnType<typeof drizzle<typeof schema>>;

interface SupplierPaymentSeed {
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
  defaultPaymentMethod?: PaymentMethod;
  defaultPaymentTerm?: PaymentTerm;
}

interface SupplierRepresentativeSeed {
  name: string;
  phoneNumber?: string;
  isPrimary?: boolean;
}

interface SupplierSeed {
  code: string;
  name: string;
  groupCode: string;
  type: SupplierType;
  taxCode: string;
  phoneNumber: string;
  address: string;
  countryCode?: string;
  payment?: SupplierPaymentSeed;
  representative?: SupplierRepresentativeSeed;
}

/**
 * Curated, one per group in `supplier-groups.seed.ts` so `GET /suppliers` has something real to
 * filter/search on right after the reference-data seeds run. All domestic (`countryCode: 'VN'`)
 * and `type: COMPANY` — an `INDIVIDUAL`/`HOUSEHOLD` demo row is plausible too but exercises no
 * different write path worth seeding for.
 */
const SUPPLIERS: SupplierSeed[] = [
  {
    code: 'THEP-VIET-NHAT',
    name: 'Công ty TNHH Thép Việt Nhật',
    groupCode: 'VTKL',
    type: SupplierType.COMPANY,
    taxCode: '0301234567',
    phoneNumber: '02838221234',
    address: '123 Nguyễn Văn Linh, Quận 7, TP. Hồ Chí Minh',
    countryCode: 'VN',
    payment: {
      bankName: 'Vietcombank',
      bankAccountNumber: '0071001234567',
      bankAccountHolder: 'CONG TY TNHH THEP VIET NHAT',
      defaultPaymentMethod: PaymentMethod.BANK_TRANSFER,
      defaultPaymentTerm: PaymentTerm.NET_30,
    },
    representative: {
      name: 'Nguyễn Văn An',
      phoneNumber: '0909123456',
      isPrimary: true,
    },
  },
  {
    code: 'CKMN-LINHKIEN',
    name: 'Công ty CP Linh Kiện Cơ Khí Miền Nam',
    groupCode: 'LKCK',
    type: SupplierType.COMPANY,
    taxCode: '0302345678',
    phoneNumber: '02838332345',
    address: '45 Tô Ký, Quận 12, TP. Hồ Chí Minh',
    countryCode: 'VN',
    payment: {
      bankName: 'BIDV',
      bankAccountNumber: '3111000234567',
      bankAccountHolder: 'CONG TY CP LINH KIEN CO KHI MIEN NAM',
      defaultPaymentMethod: PaymentMethod.BANK_TRANSFER,
      defaultPaymentTerm: PaymentTerm.NET_15,
    },
    representative: {
      name: 'Trần Thị Bình',
      phoneNumber: '0909234567',
      isPrimary: true,
    },
  },
  {
    code: 'GC-PHUOC-THANH',
    name: 'Công ty TNHH Gia Công Cơ Khí Phước Thành',
    groupCode: 'GC',
    type: SupplierType.COMPANY,
    taxCode: '0303456789',
    phoneNumber: '02838443456',
    address: '78 Lê Văn Việt, TP. Thủ Đức, TP. Hồ Chí Minh',
    countryCode: 'VN',
    payment: {
      defaultPaymentMethod: PaymentMethod.CASH,
      defaultPaymentTerm: PaymentTerm.IMMEDIATE,
    },
    representative: {
      name: 'Lê Văn Cường',
      phoneNumber: '0909345678',
      isPrimary: true,
    },
  },
  {
    code: 'TBD-VIET-A',
    name: 'Công ty TNHH Thiết Bị Điện Việt Á',
    groupCode: 'TBD',
    type: SupplierType.COMPANY,
    taxCode: '0304567890',
    phoneNumber: '02438554567',
    address: '12 Trần Duy Hưng, Cầu Giấy, Hà Nội',
    countryCode: 'VN',
    payment: {
      bankName: 'Techcombank',
      bankAccountNumber: '19012345678910',
      bankAccountHolder: 'CONG TY TNHH THIET BI DIEN VIET A',
      defaultPaymentMethod: PaymentMethod.BANK_TRANSFER,
      defaultPaymentTerm: PaymentTerm.NET_30,
    },
    representative: {
      name: 'Phạm Thị Dung',
      phoneNumber: '0909456789',
      isPrimary: true,
    },
  },
  {
    code: 'NVL-DONG-A',
    name: 'Công ty TNHH Nguyên Vật Liệu Đông Á',
    groupCode: 'NVL',
    type: SupplierType.COMPANY,
    taxCode: '0305678901',
    phoneNumber: '02838665678',
    address: '56 Quang Trung, Gò Vấp, TP. Hồ Chí Minh',
    countryCode: 'VN',
    payment: {
      bankName: 'ACB',
      bankAccountNumber: '4441234567890',
      bankAccountHolder: 'CONG TY TNHH NGUYEN VAT LIEU DONG A',
      defaultPaymentMethod: PaymentMethod.BANK_TRANSFER,
      defaultPaymentTerm: PaymentTerm.NET_60,
    },
    representative: {
      name: 'Hoàng Văn Em',
      phoneNumber: '0909567890',
      isPrimary: true,
    },
  },
];

export async function seedSuppliers(db: SeedDatabase): Promise<void> {
  const groupCodes = [...new Set(SUPPLIERS.map((s) => s.groupCode))];
  const groups = await db.query.supplierGroups.findMany({
    where: inArray(supplierGroups.code, groupCodes),
    columns: { id: true, code: true },
  });
  const groupIdByCode = new Map(groups.map((g) => [g.code, g.id]));

  const countryCodes = [
    ...new Set(
      SUPPLIERS.map((s) => s.countryCode).filter((c): c is string => !!c),
    ),
  ];
  const countryRows = countryCodes.length
    ? await db.query.countries.findMany({
        where: inArray(countries.code, countryCodes),
        columns: { id: true, code: true },
      })
    : [];
  const countryIdByCode = new Map(countryRows.map((c) => [c.code, c.id]));

  const admin = await db.query.credentials.findFirst({
    where: eq(credentials.username, 'admin'),
    columns: { userId: true },
  });

  if (!admin) {
    console.warn(
      'Credential "admin" not found — seeded suppliers will have createdBy = null. Run `pnpm db:seed:credentials` first for a complete seed.',
    );
  }

  const createdBy = admin?.userId ?? null;

  for (const spec of SUPPLIERS) {
    const existing = await db.query.suppliers.findFirst({
      where: eq(suppliers.code, spec.code),
      columns: { id: true },
    });

    if (existing) {
      console.log(`Supplier "${spec.code}" already exists. Skipping.`);
      continue;
    }

    // `supplierGroupId` is NOT NULL on `suppliers` — unlike `countryId`, a missing reference here
    // can't be nulled out, so the row is skipped entirely instead.
    const supplierGroupId = groupIdByCode.get(spec.groupCode);
    if (!supplierGroupId) {
      console.warn(
        `Supplier group "${spec.groupCode}" not found — skipping "${spec.code}". Run \`pnpm db:seed:supplier-groups\` first.`,
      );
      continue;
    }

    let countryId: string | null = null;
    if (spec.countryCode) {
      countryId = countryIdByCode.get(spec.countryCode) ?? null;
      if (!countryId) {
        console.warn(
          `Country "${spec.countryCode}" not found for "${spec.code}" — leaving countryId null. Run \`pnpm db:seed:countries\` first for a complete seed.`,
        );
      }
    }

    // The supplier row, its payment info, and its representative must land together — mirrors
    // `SuppliersService.createSupplier`'s transaction.
    await db.transaction(async (tx) => {
      const [supplier] = await tx
        .insert(suppliers)
        .values({
          code: spec.code,
          name: spec.name,
          supplierGroupId,
          type: spec.type,
          taxCode: spec.taxCode,
          phoneNumber: spec.phoneNumber,
          address: spec.address,
          countryId,
          status: SupplierStatus.ACTIVE,
          createdBy,
        })
        .returning({ id: suppliers.id });

      // Every supplier always has exactly one payment info row — mirrors the service even when
      // the seed spec carries no bank details.
      await tx.insert(supplierPaymentInfo).values({
        supplierId: supplier.id,
        ...spec.payment,
      });

      if (spec.representative) {
        await tx.insert(supplierRepresentatives).values({
          supplierId: supplier.id,
          name: spec.representative.name,
          phoneNumber: spec.representative.phoneNumber,
          isPrimary: spec.representative.isPrimary ?? false,
        });
      }
    });

    console.log(`Supplier "${spec.code}" (${spec.name}) created.`);
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    await seedSuppliers(db);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to seed suppliers:', error);
      process.exit(1);
    });
}
