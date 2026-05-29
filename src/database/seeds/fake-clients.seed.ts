import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schemas';
import { ClientType, clients } from '../schemas';

const fakeClients = [
  {
    code: 'KH001',
    fullName: 'Công ty TNHH Minh Phát',
    email: 'contact@minhphat.example.com',
    phoneNumber: '0901000001',
    clientType: ClientType.Company,
    taxCode: '0101000001',
    companyName: 'Công ty TNHH Minh Phát',
    address: 'Quận 1, TP. Hồ Chí Minh',
  },
  {
    code: 'KH002',
    fullName: 'Nguyễn Văn An',
    email: 'nguyenvanan@example.com',
    phoneNumber: '0901000002',
    clientType: ClientType.Individual,
    taxCode: null,
    companyName: null,
    address: 'Quận Bình Thạnh, TP. Hồ Chí Minh',
  },
  {
    code: 'KH003',
    fullName: 'Công ty CP An Khang',
    email: 'sales@ankhang.example.com',
    phoneNumber: '0901000003',
    clientType: ClientType.Company,
    taxCode: '0101000003',
    companyName: 'Công ty CP An Khang',
    address: 'Quận Cầu Giấy, Hà Nội',
  },
  {
    code: 'KH004',
    fullName: 'Trần Thị Bình',
    email: 'tranthibinh@example.com',
    phoneNumber: '0901000004',
    clientType: ClientType.Individual,
    taxCode: null,
    companyName: null,
    address: 'Thành phố Thủ Đức, TP. Hồ Chí Minh',
  },
  {
    code: 'KH005',
    fullName: 'Công ty TNHH Đại Nam',
    email: 'info@dainam.example.com',
    phoneNumber: '0901000005',
    clientType: ClientType.Company,
    taxCode: '0101000005',
    companyName: 'Công ty TNHH Đại Nam',
    address: 'Quận Hải Châu, Đà Nẵng',
  },
  {
    code: 'KH006',
    fullName: 'Lê Hoàng Long',
    email: 'lehoanglong@example.com',
    phoneNumber: '0901000006',
    clientType: ClientType.Individual,
    taxCode: null,
    companyName: null,
    address: 'Quận Ninh Kiều, Cần Thơ',
  },
  {
    code: 'KH007',
    fullName: 'Công ty CP Gia Hưng',
    email: 'hello@giahung.example.com',
    phoneNumber: '0901000007',
    clientType: ClientType.Company,
    taxCode: '0101000007',
    companyName: 'Công ty CP Gia Hưng',
    address: 'Thành phố Biên Hòa, Đồng Nai',
  },
  {
    code: 'KH008',
    fullName: 'Phạm Minh Châu',
    email: 'phamminhchau@example.com',
    phoneNumber: '0901000008',
    clientType: ClientType.Individual,
    taxCode: null,
    companyName: null,
    address: 'Thành phố Huế, Thừa Thiên Huế',
  },
  {
    code: 'KH009',
    fullName: 'Công ty TNHH Kim Long',
    email: 'contact@kimlong.example.com',
    phoneNumber: '0901000009',
    clientType: ClientType.Company,
    taxCode: '0101000009',
    companyName: 'Công ty TNHH Kim Long',
    address: 'Thành phố Dĩ An, Bình Dương',
  },
  {
    code: 'KH010',
    fullName: 'Võ Quốc Huy',
    email: 'voquochuy@example.com',
    phoneNumber: '0901000010',
    clientType: ClientType.Individual,
    taxCode: null,
    companyName: null,
    address: 'Thành phố Nha Trang, Khánh Hòa',
  },
  {
    code: 'KH011',
    fullName: 'Công ty CP Nam Việt',
    email: 'business@namviet.example.com',
    phoneNumber: '0901000011',
    clientType: ClientType.Company,
    taxCode: '0101000011',
    companyName: 'Công ty CP Nam Việt',
    address: 'Quận Hoàng Mai, Hà Nội',
  },
  {
    code: 'KH012',
    fullName: 'Đỗ Thị Hạnh',
    email: 'dothihanh@example.com',
    phoneNumber: '0901000012',
    clientType: ClientType.Individual,
    taxCode: null,
    companyName: null,
    address: 'Thành phố Vũng Tàu, Bà Rịa - Vũng Tàu',
  },
  {
    code: 'KH013',
    fullName: 'Công ty TNHH Phú Quý',
    email: 'contact@phuquy.example.com',
    phoneNumber: '0901000013',
    clientType: ClientType.Company,
    taxCode: '0101000013',
    companyName: 'Công ty TNHH Phú Quý',
    address: 'Quận Thanh Xuân, Hà Nội',
  },
  {
    code: 'KH014',
    fullName: 'Bùi Anh Tuấn',
    email: 'buianhtuan@example.com',
    phoneNumber: '0901000014',
    clientType: ClientType.Individual,
    taxCode: null,
    companyName: null,
    address: 'Thành phố Long Xuyên, An Giang',
  },
  {
    code: 'KH015',
    fullName: 'Công ty CP Sao Mai',
    email: 'sales@saomai.example.com',
    phoneNumber: '0901000015',
    clientType: ClientType.Company,
    taxCode: '0101000015',
    companyName: 'Công ty CP Sao Mai',
    address: 'Quận Tân Bình, TP. Hồ Chí Minh',
  },
  {
    code: 'KH016',
    fullName: 'Hoàng Thu Trang',
    email: 'hoangthutrang@example.com',
    phoneNumber: '0901000016',
    clientType: ClientType.Individual,
    taxCode: null,
    companyName: null,
    address: 'Thành phố Buôn Ma Thuột, Đắk Lắk',
  },
  {
    code: 'KH017',
    fullName: 'Công ty TNHH Tân Tiến',
    email: 'info@tantien.example.com',
    phoneNumber: '0901000017',
    clientType: ClientType.Company,
    taxCode: '0101000017',
    companyName: 'Công ty TNHH Tân Tiến',
    address: 'Thành phố Quy Nhơn, Bình Định',
  },
  {
    code: 'KH018',
    fullName: 'Ngô Đức Mạnh',
    email: 'ngoducmanh@example.com',
    phoneNumber: '0901000018',
    clientType: ClientType.Individual,
    taxCode: null,
    companyName: null,
    address: 'Thành phố Rạch Giá, Kiên Giang',
  },
  {
    code: 'KH019',
    fullName: 'Công ty CP Việt Thắng',
    email: 'support@vietthang.example.com',
    phoneNumber: '0901000019',
    clientType: ClientType.Company,
    taxCode: '0101000019',
    companyName: 'Công ty CP Việt Thắng',
    address: 'Quận Liên Chiểu, Đà Nẵng',
  },
  {
    code: 'KH020',
    fullName: 'Đặng Hải Yến',
    email: 'danghaiyen@example.com',
    phoneNumber: '0901000020',
    clientType: ClientType.Individual,
    taxCode: null,
    companyName: null,
    address: 'Thành phố Hạ Long, Quảng Ninh',
  },
] as const;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    await seedFakeClients(db);
  } finally {
    await client.end();
  }
}

async function seedFakeClients(db: ReturnType<typeof drizzle<typeof schema>>) {
  const existingClients = await db
    .select({ code: clients.code })
    .from(clients)
    .where(
      inArray(
        clients.code,
        fakeClients.map((client) => client.code),
      ),
    );
  const existingClientCodes = new Set(existingClients.map((client) => client.code));
  const rows = fakeClients.filter((client) => !existingClientCodes.has(client.code));

  if (rows.length === 0) {
    return;
  }

  await db.insert(clients).values(rows);
}

main()
  .then(() => {
    console.log('Fake clients seeded successfully');
  })
  .catch((error) => {
    console.error('Failed to seed fake clients');
    console.error(error);
    process.exit(1);
  });
