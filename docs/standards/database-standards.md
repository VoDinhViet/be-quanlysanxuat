# Database Standards

Rules and conventions for Drizzle schema design, queries, transactions, seed scripts, and migration workflows.

---

## 1. Schema Definitions & Primary Keys

*   **Rule:** Use `camelCase` keys in TypeScript, mapped explicitly to `snake_case` column names in the database. For numeric primary keys, always use `generatedAlwaysAsIdentity()`. Never use `serial()`. Export all schemas via `src/database/schemas/index.ts`.

### Examples

*   **Bad (Negative):**
    ```ts
    // Violations: PascalCase keys, missing explicit column mapping, using serial()!
    export const products = pgTable('products', {
      Id: serial('id').primaryKey(),
      ProductName: text('product_name'),
    });
    ```

*   **Good (Positive):**
    ```ts
    import { integer, pgTable, text } from 'drizzle-orm/pg-core';

    export const products = pgTable('products', {
      id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
      productName: text('product_name').notNull(),
    });
    ```

---

## 2. Foreign Keys & Relations

*   **Rule:** Establish explicit foreign key constraints using `.references()`. Centralize relations in `relations()` blocks adjacent to table definitions to support clean nested queries via the Drizzle `with:` API.

### Examples

*   **Bad (Negative):**
    ```ts
    // Violations: Vague foreign key definition, missing relational model metadata
    export const orders = pgTable('orders', {
      id: uuid('id').defaultRandom().primaryKey(),
      userId: uuid('user_id'), // No foreign key constraint!
    });
    ```

*   **Good (Positive):**
    ```ts
    import { pgTable, uuid, relations } from 'drizzle-orm';
    import { users } from './users';

    export const orders = pgTable('orders', {
      id: uuid('id').defaultRandom().primaryKey(),
      userId: uuid('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'restrict' }), // Cascade/Restrict set intentionally
    });

    export const ordersRelations = relations(orders, ({ one }) => ({
      user: one(users, {
        fields: [orders.userId],
        references: [users.id],
      }),
    }));
    ```

---

## 3. Typed Queries vs Raw SQL

*   **Rule:** Always import query operators (`eq`, `and`, `or`, `inArray`, `count`) directly from `drizzle-orm`. Never use string concatenation to build raw SQL queries.

### Examples

*   **Bad (Negative):**
    ```ts
    // Violations: Dangerous string concatenation (SQL injection vulnerability) and raw query execution
    const keyword = req.query.q;
    const usersList = await db.execute(sql`SELECT * FROM users WHERE email = '${keyword}'`);
    ```

*   **Good (Positive):**
    ```ts
    import { and, eq, ilike } from 'drizzle-orm';
    
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const usersList = await db.query.users.findMany({
      where: and(
        keyword ? ilike(users.email, keyword) : undefined,
        eq(users.status, UserStatus.ACTIVE)
      ),
    });
    ```

---

## 4. Multi-Step Writes & Transactions

*   **Rule:** Wrap all operations that write to multiple tables, verify current state before state transitions, or check stock balances inside a `db.transaction(...)` block. Check and update status inside the transaction to prevent race conditions.

### Examples

*   **Bad (Negative):**
    ```ts
    // Violations: Separate queries without transaction! If inserting order items fails, 
    // the parent order remains stranded (partial database write).
    async createOrder(reqDto: CreateOrderReqDto) {
      const [order] = await this.db.insert(orders).values(reqDto).returning();
      for (const item of reqDto.items) {
        await this.db.insert(orderItems).values({ ...item, orderId: order.id });
      }
    }
    ```

*   **Good (Positive):**
    ```ts
    async createOrder(reqDto: CreateOrderReqDto) {
      return this.db.transaction(async (tx) => {
        const [order] = await tx.insert(orders).values(reqDto).returning();
        
        const itemRows = reqDto.items.map(item => ({
          ...item,
          orderId: order.id,
        }));
        
        await tx.insert(orderItems).values(itemRows);
        return order;
      });
    }
    ```

---

## 5. Seed Script Idempotency

*   **Rule:** All database seeds must be fully idempotent. Use `.onConflictDoNothing()` or `.onConflictDoUpdate()` on every write command to support infinite rerun safety without duplicating rows.

### Examples

*   **Bad (Negative):**
    ```ts
    // Violations: Will throw conflict/duplicate errors on the second run!
    await db.insert(roles).values([
      { code: 'ADMIN', name: 'Quản trị viên' }
    ]);
    ```

*   **Good (Positive):**
    ```ts
    await db
      .insert(roles)
      .values([
        { code: 'ADMIN', name: 'Quản trị viên' }
      ])
      .onConflictDoNothing({ target: roles.code }); // Infinite rerun safe
    ```

---

## 6. Migration Workflow

*   **Rule:** Always generate migrations using `pnpm db:generate`. Run migrations using `pnpm db:migrate`. Never run `drizzle-kit push` in production/shared environments. Review SQL files before applying migrations. Never edit, reorder, or rename applied migrations.
