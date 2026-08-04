# Purchase Requests List API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm module `purchase-requests` mới (header + dòng vật tư) và một API
`GET /purchase-requests` có phân trang/filter, phục vụ màn danh sách "Đề xuất mua hàng".

**Architecture:** 2 bảng Drizzle mới (`purchase_requests` header, `purchase_request_items` dòng
vật tư) dưới domain mới `purchase-requests` (xem `docs/domains/purchase-requests.md`). Module
`src/api/purchase-requests/` theo đúng khuôn `src/api/departments/` (đọc, không ghi) nhưng có
filter phong phú hơn — dùng `EXISTS` subquery để lọc theo vật tư trong dòng phiếu, cùng khuôn
`StockReceiptsService.getStockReceipts`.

**Tech Stack:** NestJS 11, Drizzle ORM, PostgreSQL. Không có tầng test (testing-paused).

## Global Constraints

- MUST dùng `pnpm`, KHÔNG `npm`/`yarn`.
- KHÔNG tạo/sửa `*.spec.ts`, KHÔNG chạy `pnpm test*` (`docs/decisions/testing-paused.md`).
- KHÔNG tự chạy `pnpm db:migrate` vào DB dùng chung — `DATABASE_URL` trong `.env` trỏ DB từ xa,
  phải xin phép người dùng trước (Task 2).
- KHÔNG tự `git commit` trừ khi được yêu cầu.
- Chạy `pnpm lint` + `npx tsc --noEmit` + `pnpm build` **một lần** ở Task 6, không chạy sau mỗi
  task nhỏ.
- Comment code bằng tiếng Việt, chỉ viết khi qua 1 trong 4 test ở `.claude/rules/documentation.md`
  (mặc định KHÔNG viết comment). Identifier/tên file bằng tiếng Anh.
- DTO: mô tả field qua option `description` của decorator, KHÔNG viết `/** */` trên DTO (class lẫn
  field). Response DTO: class `@Exclude()`, mọi field expose `@Expose()`.
- Danh mục cha (`departments`, `materials`, `production_orders`) không tự validate FK — nhưng vì
  đây là API list (không ghi), task này không cần thêm check tồn tại nào.

---

### Task 1: Schema — `purchase_requests` + `purchase_request_items`

**Files:**
- Create: `src/database/schemas/purchase-requests/purchase-requests.ts`
- Create: `src/database/schemas/purchase-requests/purchase-request-items.ts`
- Modify: `src/database/schemas/index.ts`

**Interfaces:**
- Produces: bảng `purchaseRequests`, `purchaseRequestItems`; enum `PurchaseRequestStatus`
  (`DRAFT`/`PENDING_APPROVAL`/`APPROVED`/`REJECTED`); relations `purchaseRequestsRelations`
  (`department`, `productionOrder`, `requester`, `items`) và `purchaseRequestItemsRelations`
  (`purchaseRequest`, `material`) — Task 3 dùng các tên quan hệ này trong `db.query...with`.

- [ ] **Step 1: Tạo `src/database/schemas/purchase-requests/purchase-requests.ts`**

```ts
import { relations } from 'drizzle-orm';
import {
  date,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { departments } from '../departments';
import { productionOrders } from '../production/production-orders';
import { purchaseRequestItems } from './purchase-request-items';
import { users } from '../identity-access/users';

export enum PurchaseRequestStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export const purchaseRequestStatusEnum = pgEnum('purchase_request_status', [
  PurchaseRequestStatus.DRAFT,
  PurchaseRequestStatus.PENDING_APPROVAL,
  PurchaseRequestStatus.APPROVED,
  PurchaseRequestStatus.REJECTED,
]);

/**
 * Đề xuất mua hàng — phiếu xin duyệt nội bộ, không phải procurement
 * (`docs/domains/purchase-requests.md`, `docs/decisions/no-procurement.md`). Giai đoạn 1: chỉ
 * `GET /purchase-requests`; `status` đủ 4 giá trị cho vòng đời sau nhưng chưa route nào ghi nó.
 */
export const purchaseRequests = pgTable(
  'purchase_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    neededDate: date('needed_date', { mode: 'date' }).notNull(),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => departments.id, { onDelete: 'restrict' }),
    productionOrderId: uuid('production_order_id').references(
      () => productionOrders.id,
      { onDelete: 'set null' },
    ),
    status: purchaseRequestStatusEnum('status')
      .notNull()
      .default(PurchaseRequestStatus.DRAFT),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_purchase_requests_department_id').on(table.departmentId),
    index('idx_purchase_requests_production_order_id').on(
      table.productionOrderId,
    ),
    index('idx_purchase_requests_created_by').on(table.createdBy),
    index('idx_purchase_requests_status').on(table.status),
    index('idx_purchase_requests_needed_date').on(table.neededDate),
  ],
);

export const purchaseRequestsRelations = relations(
  purchaseRequests,
  ({ one, many }) => ({
    department: one(departments, {
      fields: [purchaseRequests.departmentId],
      references: [departments.id],
    }),
    productionOrder: one(productionOrders, {
      fields: [purchaseRequests.productionOrderId],
      references: [productionOrders.id],
    }),
    requester: one(users, {
      fields: [purchaseRequests.createdBy],
      references: [users.id],
    }),
    items: many(purchaseRequestItems),
  }),
);
```

- [ ] **Step 2: Tạo `src/database/schemas/purchase-requests/purchase-request-items.ts`**

```ts
import { relations, sql } from 'drizzle-orm';
import { check, index, numeric, pgTable, uuid } from 'drizzle-orm/pg-core';

import { materials } from '../materials/materials';
import { purchaseRequests } from './purchase-requests';

/**
 * Một dòng vật tư của đề xuất mua hàng. Chưa có route ghi (giai đoạn 1 chỉ list) — bảng tồn tại
 * để `GET /purchase-requests` lọc được theo tên/mã vật tư trong dòng phiếu.
 */
export const purchaseRequestItems = pgTable(
  'purchase_request_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    purchaseRequestId: uuid('purchase_request_id')
      .notNull()
      .references(() => purchaseRequests.id, { onDelete: 'cascade' }),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
  },
  (table) => [
    index('idx_purchase_request_items_purchase_request_id').on(
      table.purchaseRequestId,
    ),
    index('idx_purchase_request_items_material_id').on(table.materialId),
    check('chk_purchase_request_items_quantity_positive', sql`quantity > 0`),
  ],
);

export const purchaseRequestItemsRelations = relations(
  purchaseRequestItems,
  ({ one }) => ({
    purchaseRequest: one(purchaseRequests, {
      fields: [purchaseRequestItems.purchaseRequestId],
      references: [purchaseRequests.id],
    }),
    material: one(materials, {
      fields: [purchaseRequestItems.materialId],
      references: [materials.id],
    }),
  }),
);
```

- [ ] **Step 3: Re-export từ `src/database/schemas/index.ts`**

Mở file, thêm 2 dòng vào cuối (thứ tự không quan trọng, nhưng để cạnh các export domain khác cho
dễ đọc):

```ts
export * from './purchase-requests/purchase-requests';
export * from './purchase-requests/purchase-request-items';
```

`drizzle-kit` chỉ đọc file `index.ts` này để sinh migration — thiếu bước này thì Task 2 sinh ra
migration rỗng mà không báo lỗi gì.

---

### Task 2: Migration

**Files:**
- Generated: `drizzle/000X_xxx.sql` (tên tự sinh)
- Generated/Modified: `drizzle/meta/_journal.json`, `drizzle/meta/000X_snapshot.json`

- [ ] **Step 1: Sinh migration**

Run: `pnpm db:generate`

- [ ] **Step 2: Đọc file SQL vừa sinh**

Mở file `.sql` mới nhất trong `drizzle/`, xác nhận nó tạo đúng: enum `purchase_request_status`,
bảng `purchase_requests` (5 index + FK tới `departments`/`production_orders`/`users`), bảng
`purchase_request_items` (2 index + CHECK `quantity > 0` + FK tới `purchase_requests`/`materials`).

- [ ] **Step 3: Dừng lại, xin phép người dùng trước khi migrate**

`DATABASE_URL` trong `.env` trỏ một DB dùng chung/từ xa (`.claude/rules/general.md`). KHÔNG tự chạy
`pnpm db:migrate`. Hỏi người dùng có đồng ý apply migration này vào DB đang trỏ tới không.

- [ ] **Step 4: Migrate (chỉ sau khi được đồng ý)**

Run: `pnpm db:migrate`

---

### Task 3: Module — DTO + service + controller

**Files:**
- Create: `src/api/production-orders/dto/production-order-ref.res.dto.ts`
- Create: `src/api/purchase-requests/dto/get-purchase-requests.req.dto.ts`
- Create: `src/api/purchase-requests/dto/purchase-request.res.dto.ts`
- Create: `src/api/purchase-requests/purchase-requests.service.ts`
- Create: `src/api/purchase-requests/purchase-requests.controller.ts`
- Create: `src/api/purchase-requests/purchase-requests.module.ts`

**Interfaces:**
- Consumes: `purchaseRequests`, `purchaseRequestItems`, `materials`, `PurchaseRequestStatus`
  (Task 1); `DepartmentResDto` (`src/api/departments/dto/department.res.dto.ts`); `UserRefResDto`
  (`src/api/users/dto/user-ref.res.dto.ts`); `ProductionOrderResDto`
  (`src/api/production-orders/dto/production-order.res.dto.ts`).
- Produces: `PurchaseRequestsModule`, route `GET /purchase-requests` — Task 4 đăng ký module này
  vào `AppModule` và gắn permission `purchase-requests:read`.

- [ ] **Step 1: Ref DTO cho LSX — `src/api/production-orders/dto/production-order-ref.res.dto.ts`**

Theo đúng khuôn `XRefResDto` ở `.claude/rules/api.md` (`PickType` từ response DTO gốc, sống trong
module sở hữu entity — không phải module tiêu thụ):

```ts
import { PickType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

import { ProductionOrderResDto } from './production-order.res.dto';

@Exclude()
export class ProductionOrderRefResDto extends PickType(ProductionOrderResDto, [
  'id',
  'code',
] as const) {}
```

- [ ] **Step 2: Request DTO — `src/api/purchase-requests/dto/get-purchase-requests.req.dto.ts`**

```ts
import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { PurchaseRequestStatus } from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetPurchaseRequestsReqDto extends PageOptionsDto {
  @StringFieldOptional({
    description: 'Tìm theo tên hoặc mã vật tư có trong các dòng của đề xuất',
  })
  readonly materialKeyword?: string;

  @UUIDFieldOptional({ description: 'Filter theo LSX (production order) liên quan' })
  readonly productionOrderId?: string;

  @UUIDFieldOptional({ description: 'Filter theo người đề xuất (users.id)' })
  readonly requesterId?: string;

  @UUIDFieldOptional({ description: 'Filter theo bộ phận' })
  readonly departmentId?: string;

  @EnumFieldOptional(() => PurchaseRequestStatus)
  readonly status?: PurchaseRequestStatus;

  @DateFieldOptional({ description: 'Filter: neededDate = ngày này' })
  readonly neededDate?: Date;

  @DateFieldOptional({ description: 'Filter: createdAt >= fromDate' })
  readonly fromDate?: Date;

  @DateFieldOptional({ description: 'Filter: createdAt <= toDate' })
  readonly toDate?: Date;
}
```

Field `q` (kế thừa từ `PageOptionsDto`) đã phủ tìm theo mã phiếu đề xuất — cùng khuôn `orders`,
`stock-receipts` (search theo `code` qua `unaccentILike`), không cần khai lại.

- [ ] **Step 3: Response DTO — `src/api/purchase-requests/dto/purchase-request.res.dto.ts`**

```ts
import { Exclude, Expose } from 'class-transformer';

import { PurchaseRequestStatus } from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  EnumField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { DepartmentResDto } from '../../departments/dto/department.res.dto';
import { ProductionOrderRefResDto } from '../../production-orders/dto/production-order-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';

@Exclude()
export class PurchaseRequestResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã phiếu đề xuất' })
  code!: string;

  @Expose()
  @DateField({ description: 'Ngày cần' })
  neededDate!: Date;

  @Expose()
  @EnumField(() => PurchaseRequestStatus)
  status!: PurchaseRequestStatus;

  @Expose()
  @DateField({ description: 'Ngày tạo phiếu' })
  createdAt!: Date;

  @Expose()
  @ClassField(() => DepartmentResDto)
  department!: DepartmentResDto;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  requester!: UserRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => ProductionOrderRefResDto, { nullable: true })
  productionOrder!: ProductionOrderRefResDto | null;
}
```

- [ ] **Step 4: Service — `src/api/purchase-requests/purchase-requests.service.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count, desc, eq, exists, gte, lte, or, sql } from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  materials,
  purchaseRequestItems,
  purchaseRequests,
} from '../../database/schemas';
import { GetPurchaseRequestsReqDto } from './dto/get-purchase-requests.req.dto';
import { PurchaseRequestResDto } from './dto/purchase-request.res.dto';

@Injectable()
export class PurchaseRequestsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getPurchaseRequests(
    reqDto: GetPurchaseRequestsReqDto,
  ): Promise<OffsetPaginatedDto<PurchaseRequestResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const materialKeyword = reqDto.materialKeyword
      ? `%${reqDto.materialKeyword}%`
      : undefined;

    const where = and(
      keyword ? unaccentILike(purchaseRequests.code, keyword) : undefined,
      materialKeyword
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(purchaseRequestItems)
              .innerJoin(
                materials,
                eq(materials.id, purchaseRequestItems.materialId),
              )
              .where(
                and(
                  eq(
                    purchaseRequestItems.purchaseRequestId,
                    purchaseRequests.id,
                  ),
                  or(
                    unaccentILike(materials.name, materialKeyword),
                    unaccentILike(materials.code, materialKeyword),
                  ),
                ),
              ),
          )
        : undefined,
      reqDto.productionOrderId
        ? eq(purchaseRequests.productionOrderId, reqDto.productionOrderId)
        : undefined,
      reqDto.requesterId
        ? eq(purchaseRequests.createdBy, reqDto.requesterId)
        : undefined,
      reqDto.departmentId
        ? eq(purchaseRequests.departmentId, reqDto.departmentId)
        : undefined,
      reqDto.status ? eq(purchaseRequests.status, reqDto.status) : undefined,
      reqDto.neededDate
        ? eq(purchaseRequests.neededDate, reqDto.neededDate)
        : undefined,
      reqDto.fromDate
        ? gte(purchaseRequests.createdAt, reqDto.fromDate)
        : undefined,
      reqDto.toDate
        ? lte(purchaseRequests.createdAt, reqDto.toDate)
        : undefined,
    );

    const [entities, countRows] = await Promise.all([
      this.db.query.purchaseRequests.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: desc(purchaseRequests.createdAt),
        with: { department: true, requester: true, productionOrder: true },
      }),
      this.db.select({ total: count() }).from(purchaseRequests).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PurchaseRequestResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }
}
```

- [ ] **Step 5: Controller — `src/api/purchase-requests/purchase-requests.controller.ts`**

```ts
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiAuth } from '../../decorators/http.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { GetPurchaseRequestsReqDto } from './dto/get-purchase-requests.req.dto';
import { PurchaseRequestResDto } from './dto/purchase-request.res.dto';
import { PurchaseRequestsService } from './purchase-requests.service';

@ApiTags('Purchase Requests')
@Controller('purchase-requests')
export class PurchaseRequestsController {
  constructor(
    private readonly purchaseRequestsService: PurchaseRequestsService,
  ) {}

  @Get()
  @Permissions('purchase-requests:read')
  @ApiAuth({
    type: PurchaseRequestResDto,
    summary: 'List purchase requests',
    isPaginated: true,
  })
  getPurchaseRequests(
    @Query() reqDto: GetPurchaseRequestsReqDto,
  ): Promise<OffsetPaginatedDto<PurchaseRequestResDto>> {
    return this.purchaseRequestsService.getPurchaseRequests(reqDto);
  }
}
```

- [ ] **Step 6: Module — `src/api/purchase-requests/purchase-requests.module.ts`**

```ts
import { Module } from '@nestjs/common';

import { PurchaseRequestsController } from './purchase-requests.controller';
import { PurchaseRequestsService } from './purchase-requests.service';

@Module({
  controllers: [PurchaseRequestsController],
  providers: [PurchaseRequestsService],
})
export class PurchaseRequestsModule {}
```

---

### Task 4: Đăng ký module + wiring quyền

**Files:**
- Modify: `src/app.module.ts`
- Modify: `src/constants/permission.constant.ts`
- Modify: `src/database/seeds/credentials.seed.ts`

**Interfaces:**
- Consumes: `PurchaseRequestsModule` (Task 3).

- [ ] **Step 1: Đăng ký `PurchaseRequestsModule` vào `src/app.module.ts`**

Thêm import:

```ts
import { PurchaseRequestsModule } from './api/purchase-requests/purchase-requests.module';
```

Thêm `PurchaseRequestsModule` vào mảng `imports` (cạnh `OrdersModule`, dòng cuối danh sách hiện
tại):

```ts
    ProductionOrdersModule,
    OrdersModule,
    PurchaseRequestsModule,
  ],
```

- [ ] **Step 2: Thêm permission code vào `src/constants/permission.constant.ts`**

Thêm vào cuối mảng `PERMISSION_CODES` (sau `'production:approve',`):

```ts
  'purchase-requests:read',
```

- [ ] **Step 3: Gán quyền cho role liên quan trong `src/database/seeds/credentials.seed.ts`**

Thêm `'purchase-requests:read'` vào mảng `permissions` của 4 role: `PRODUCTION`, `PURCHASING`,
`WAREHOUSE`, `DIRECTOR` (đề xuất phát sinh từ Sản xuất, Mua hàng/Kho theo dõi & xử lý, Giám đốc
duyệt sau này). Ví dụ với `PRODUCTION`:

```ts
  PRODUCTION: {
    code: 'PRODUCTION',
    name: 'Sản xuất',
    permissions: [
      'products:read',
      'products:create',
      'products:update',
      'products:delete',
      'products:copy',
      'materials:read',
      'purchase-requests:read',
    ],
    isSystem: false,
  },
```

Lặp lại tương tự cho `PURCHASING`, `WAREHOUSE`, `DIRECTOR` — chỉ thêm một dòng
`'purchase-requests:read',` vào cuối mảng `permissions` sẵn có của mỗi role, không đổi gì khác.

- [ ] **Step 4: Lưu ý về seed đã chạy trước đó (không phải một bước code)**

`ensureRole` trong file này là skip-if-exists (`.claude/rules/seeds.md`) — nếu 4 role trên **đã
tồn tại** trong DB đang dùng để test, chạy lại `pnpm db:seed:credentials` sẽ **không** cập nhật
`permissions` của role đã có sẵn (bị skip). `roles` cũng không có route `PATCH` qua API (chỉ
`GET /roles`, xem `CLAUDE.md`). Nếu cần permission mới có hiệu lực ngay trên DB hiện tại, việc
duy nhất làm được là `UPDATE roles SET permissions = ... WHERE code = '...'` thủ công — hỏi người
dùng trước khi chạy SQL này trên DB dùng chung, đừng tự ý.

---

### Task 5: Đối chiếu doc

**Files:**
- Modify: `CLAUDE.md` (bảng Modules)
- Verify: `docs/domains/purchase-requests.md` (đã viết ở bước brainstorming — đối chiếu lại với
  code thật vừa viết ở Task 1–4, sửa nếu có sai khác)

- [ ] **Step 1: Thêm dòng module mới vào bảng Modules trong `CLAUDE.md`**

Thêm một dòng vào cuối bảng (sau dòng `production-jobs`):

```
| `purchase-requests` | purchase-requests | Giai đoạn 1: chỉ `GET` list, chưa có tạo/duyệt/từ chối |
```

- [ ] **Step 2: Đối chiếu `docs/domains/purchase-requests.md` với code thật**

Đọc lại file, xác nhận: tên bảng/cột (`purchase_requests`, `purchase_request_items`,
`neededDate`, `departmentId`, `productionOrderId`, `status`, `createdBy`), enum
`PurchaseRequestStatus` (4 giá trị), và route thật (`GET /purchase-requests`, permission
`purchase-requests:read`) khớp với những gì vừa implement. Sửa doc nếu có sai khác phát sinh lúc
code (ví dụ đổi tên cột giữa chừng).

---

### Task 6: Validate

- [ ] **Step 1: Lint + typecheck + build**

Baseline trên `develop` (đã xác nhận trước khi tạo worktree) **không sạch tuyệt đối** — điều này
có từ trước, không liên quan tới việc bạn sắp làm:
- `pnpm lint`: 44 lỗi/3 cảnh báo có sẵn, toàn bộ ở file hạ tầng không liên quan
  (`src/main.ts`, `src/redis/redis-config.type.ts`, và một file khác) — không phải do task này.
- `npx tsc --noEmit`: fail do các file `*.spec.ts` cũ (`docs/decisions/testing-paused.md`) —
  `tsconfig.build.json` loại trừ `**/*spec.ts`, nên đây không ảnh hưởng `pnpm build`.
- `pnpm build`: sạch (exit 0).

Run:
```bash
pnpm lint
npx tsc --noEmit
pnpm build
```

Expected: `pnpm build` sạch (exit 0), như baseline. `pnpm lint`/`npx tsc --noEmit` chỉ cần
**không có thêm lỗi mới nào trên các file bạn vừa tạo/sửa** so với danh sách baseline ở trên — so
sánh output với baseline, đừng sửa lỗi có sẵn ở file không thuộc phạm vi task này (out of scope,
tránh side-effect ngoài ý muốn).

- [ ] **Step 2: Kiểm tra Swagger**

Chạy `pnpm start:dev`, mở `/api-docs`, xác nhận:
- `GET /purchase-requests` xuất hiện dưới tag "Purchase Requests", yêu cầu bearer token
  (`@ApiAuth`, không phải `@ApiPublic`).
- Toàn bộ query param của `GetPurchaseRequestsReqDto` hiện đúng (bao gồm `q`, `limit`, `page`,
  `order` kế thừa từ `PageOptionsDto`).
- Response schema khớp `PurchaseRequestResDto` (có `department`, `requester`, `productionOrder`
  nested).

- [ ] **Step 3: Kiểm tra permission wiring bằng mắt**

Xác nhận `'purchase-requests:read'` có mặt ở **cả hai** nơi: `PERMISSION_CODES`
(`src/constants/permission.constant.ts`) và 4 role trong `credentials.seed.ts` — thiếu một trong
hai thì route chặn im lặng mọi người trừ `ADMIN` (`system:manage`).

- [ ] **Step 4: Kiểm tra migration đã nằm trong journal**

Xác nhận file `.sql` mới nằm trong `drizzle/` và đã được thêm vào `drizzle/meta/_journal.json`.

---

## Note cho việc thực thi

- Task 2 (migrate) và Task 4 Step 4 (SQL update permissions nếu cần) đều cần dừng lại xin phép
  người dùng — không tự động hoá hai bước này dù chạy dưới chế độ subagent hay inline.
- Không có bước "viết test" nào trong plan này — `testing-paused`
  (`docs/decisions/testing-paused.md`). Verify bằng Task 6 (lint/tsc/build + Swagger thủ công).
- Không có bước "commit" nào trong từng task — hỏi người dùng ở cuối nếu muốn commit toàn bộ thay
  đổi thành một hoặc nhiều commit theo Conventional Commits.
