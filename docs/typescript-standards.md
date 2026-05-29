# TypeScript Standards

TypeScript guidelines to leverage strict type safety, prevent runtime crashes, and improve code self-documentation.

---

## 1. Strict Typing

*   **Rule:** Keep `strict` mode enabled. Never use `any`. Use `unknown` for truly dynamic/unstructured values and narrow the type using type guards or validation before dereferencing.

### Examples

*   **Bad (Negative):**
    ```ts
    function processPayload(payload: any) {
      console.log(payload.user.name); // Dangerous, could crash at runtime if fields are missing
    }
    ```

*   **Good (Positive):**
    ```ts
    interface UserPayload {
      user: { name: string };
    }

    function processPayload(payload: unknown) {
      if (payload && typeof payload === 'object' && 'user' in payload) {
        const typedPayload = payload as UserPayload;
        console.log(typedPayload.user.name);
      }
    }
    ```

---

## 2. Return Types

*   **Rule:** Provide explicit return types for all exported functions, controller actions, service methods, and repository operations. Small private callbacks may omit return types if the type is completely obvious.

### Examples

*   **Bad (Negative):**
    ```ts
    async getUserDetail(userId: string) { // Missing return type
      return this.usersService.getUserDetail(userId);
    }
    ```

*   **Good (Positive):**
    ```ts
    async getUserDetail(userId: string): Promise<UserResDto> {
      return this.usersService.getUserDetail(userId);
    }
    ```

---

## 3. Variable Declarations

*   **Rule:** Always prefer `const`. Use `let` only for reassignments. Never use `var`. Inject constructor dependencies as `private readonly`. Use `readonly` for fields that should not change after instantiation.

### Examples

*   **Bad (Negative):**
    ```ts
    var userStatus = 'ACTIVE'; // var is obsolete
    let saltRounds = 10;       // let used but never reassigned
    
    class UsersService {
      constructor(private db: Database) {} // Missing readonly
    }
    ```

*   **Good (Positive):**
    ```ts
    const userStatus = 'ACTIVE';
    const saltRounds = 10;
    
    class UsersService {
      constructor(private readonly db: Database) {}
    }
    ```

---

## 4. Null & Undefined Handling

*   **Rule:** Use `null` only when it represents an intentional empty value in database or API structures. Use `undefined` for omitted optional properties. Do not use non-null assertions (`!`) to silence type errors; perform explicit checks instead.

### Examples

*   **Bad (Negative):**
    ```ts
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    console.log(user!.email); // Crash prone if user is not found
    ```

*   **Good (Positive):**
    ```ts
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
    }
    console.log(user.email);
    ```

---

## 5. Imports

*   **Rule:** Always use `import type` for importing only types or interfaces. Clean up unused imports.

### Examples

*   **Bad (Negative):**
    ```ts
    import { Database } from '../../database/database.type'; // Standard import for type-only
    ```

*   **Good (Positive):**
    ```ts
    import type { Database } from '../../database/database.type';
    ```
