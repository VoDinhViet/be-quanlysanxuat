# Naming Conventions

Standardized naming rules to ensure the codebase remains clean, predictable, and easy to search.

---

## 1. Files & Folders

*   **Rule:** Use `kebab-case` for all file and folder names. Use descriptive feature/business names. DTO files must end with `.req.dto.ts` or `.res.dto.ts`.

### Examples

*   **Bad (Negative):**
    ```text
    /src/api/users/UserService.ts   # PascalCase file name
    /src/api/users/dto/data.dto.ts  # Vague technical name
    /src/api/users/handler.ts       # Non-descriptive name
    ```

*   **Good (Positive):**
    ```text
    /src/api/users/users.service.ts
    /src/api/users/dto/create-user.req.dto.ts
    /src/api/users/dto/user.res.dto.ts
    ```

---

## 2. Classes

*   **Rule:** Use `PascalCase` for class names. Suffix classes by their architectural role (`Controller`, `Service`, `Module`, `Guard`, `ReqDto`, `ResDto`).

### Examples

*   **Bad (Negative):**
    ```ts
    export class user_service {}      # snake_case class name
    export class CreateUser {}        # Missing DTO/Role suffix
    export class UserData {}          # Vague suffix
    ```

*   **Good (Positive):**
    ```ts
    export class UsersService {}
    export class CreateUserReqDto {}
    export class UserResDto {}
    ```

---

## 3. Functions & Methods

*   **Rule:** Use `camelCase`. Start with a clear verb describing the business action. Avoid vague filler words such as `handle`, `process`, `execute`, `run`, `do`, `thing`, `data`.

### Examples

*   **Bad (Negative):**
    ```ts
    async doStuff() {}          # Vague filler verb
    async handleUser() {}       # Vague context
    async processData() {}      # Hides actual action (create/update/delete?)
    async checkEmail() {}       # "check" is ambiguous
    ```

*   **Good (Positive):**
    ```ts
    async createUser() {}
    async getUserDetail() {}
    async ensureEmailAvailable() {}
    async approvePurchaseOrder() {}
    ```

---

## 4. Boolean Values

*   **Rule:** Use `is`, `has`, `can`, or `should` prefixes to read as clear true/false statements.

### Examples

*   **Bad (Negative):**
    ```ts
    const active = user.status === UserStatus.ACTIVE;
    const permission = permissionCodes.includes('system:manage');
    const approve = order.status === OrderStatus.PENDING;
    ```

*   **Good (Positive):**
    ```ts
    const isActive = user.status === UserStatus.ACTIVE;
    const hasPermission = permissionCodes.includes('system:manage');
    const canApproveOrder = order.status === OrderStatus.PENDING;
    ```

---

## 5. Constants

*   **Rule:** Use `UPPER_SNAKE_CASE` for module-level constants. Use `private static readonly` for class constants.

### Examples

*   **Bad (Negative):**
    ```ts
    const max_upload_size = 5 * 1024 * 1024; // camelCase constant
    
    class UsersService {
      saltRounds = 10; // Non-readonly instance constant
    }
    ```

*   **Good (Positive):**
    ```ts
    const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;
    
    class UsersService {
      private static readonly PASSWORD_SALT_ROUNDS = 10;
    }
    ```

---

## 6. Variables & Identifiers

*   **Rule:** Use entity-specific IDs (e.g., `userId`, `roleId`, `salesOrderId`) instead of bare `id`. Use plural names for collections. Use `reqDto` for a single request DTO parameter in controllers/services.

### Examples

*   **Bad (Negative):**
    ```ts
    async getUserDetail(id: string) {} // Vague identifier
    const list = ['admin', 'qc'];      // Vague collection name
    async createUser(data: CreateUserReqDto) {} // Vague param name
    ```

*   **Good (Positive):**
    ```ts
    async getUserDetail(userId: string) {}
    const roles = ['admin', 'qc'];
    async createUser(reqDto: CreateUserReqDto) {}
    ```
