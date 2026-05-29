# API Standards

Guidelines for writing APIs that are robust, secure, and predictable for the frontend and external consumers.

---

## 1. Route Design & Validation

*   **Rule:** Always use entity-specific route parameters (e.g., `:userId`, `:roleId`) instead of generic `:id`. All incoming queries, parameters, and bodies must be validated at the API boundary using request DTOs.

### Examples

*   **Bad (Negative):**
    ```text
    GET /api/users/:id             # Ambiguous route param
    
    // In Controller
    async getUserDetail(@Param() params: any) { // Unvalidated param
      return this.usersService.getUserDetail(params.id);
    }
    ```

*   **Good (Positive):**
    ```text
    GET /api/v1/users/:userId
    
    // In Controller
    @Get(':userId')
    async getUserDetail(@UUIDParam('userId') userId: string): Promise<UserResDto> {
      return this.usersService.getUserDetail(userId);
    }
    ```

---

## 2. Success Responses & Pagination

*   **Rule:** Single resource endpoints return DTO objects directly. Paginated endpoints must use `OffsetPaginatedDto` containing `data` array and `pagination` metadata. Use `PageOptionsDto` for pagination inputs.

### Examples

*   **Bad (Negative):**
    ```ts
    // Controller returns raw array of database entities without pagination structure
    @Get()
    async getUsers(): Promise<UserEntity[]> {
      return this.usersService.getUsersRaw(); 
    }
    ```

*   **Good (Positive):**
    ```ts
    @Get()
    async getUsers(@Query() reqDto: GetUsersReqDto): Promise<OffsetPaginatedDto<UserResDto>> {
      return this.usersService.getUsers(reqDto);
    }
    
    // Returns structured payload:
    // {
    //   "data": [ ... ],
    //   "pagination": {
    //     "currentPage": 1,
    //     "limit": 20,
    //     "nextPage": 2,
    //     "previousPage": null,
    //     "totalRecords": 100,
    //     "totalPages": 5
    //   }
    // }
    ```

---

## 3. Error Responses & exceptions

*   **Rule:** Throw `AppException` for expected business/API validations and failures. Use error codes registered in `ErrorCode` enum. Let `GlobalExceptionFilter` normalize unexpected errors. Do not leak raw SQL errors or developer stack traces.

### Examples

*   **Bad (Negative):**
    ```ts
    if (!user) {
      throw new Error('User does not exist'); // Unhandled runtime error
    }
    
    try {
      await db.insert(users).values(data);
    } catch (e) {
      throw new BadRequestException(e.message); // Dangerous: leaks raw database constraints/names!
    }
    ```

*   **Good (Positive):**
    ```ts
    if (!user) {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND); // Structured error
    }
    
    // If database constraints fail, GlobalExceptionFilter automatically handles it 
    // and returns a safe, sanitized message (e.g. mapping constraint 23505 to Conflict)
    ```

---

## 4. Sorting & Filter Whitelisting

*   **Rule:** Never trust dynamic fields directly from the client. Whitelist allowed sort/filter properties to prevent unauthorized data access or SQL injection.

### Examples

*   **Bad (Negative):**
    ```ts
    // In Service - blindly executing client-provided sort field in Drizzle!
    async getUsers(reqDto: GetUsersReqDto) {
      const orderColumn = reqDto.sortBy; // e.g. "password_hash" or "role_id; DROP TABLE users;"
      return this.db.select().from(users).orderBy(sql`${orderColumn}`);
    }
    ```

*   **Good (Positive):**
    ```ts
    // In Service - using a strict whitelist
    async getUsers(reqDto: GetUsersReqDto) {
      const allowedFields = {
        email: users.email,
        fullName: users.fullName,
        createdAt: users.createdAt,
      };

      const orderByColumn = allowedFields[reqDto.sortBy] ?? users.createdAt;
      const orderDirection = reqDto.order === 'desc' ? desc(orderByColumn) : asc(orderByColumn);

      return this.db.select().from(users).orderBy(orderDirection);
    }
    ```

---

## 5. Safe Logging

*   **Rule:** Never log full request DTOs, passwords, tokens, or API keys. Log only safe identifiers. For response DTO shaping rules (hiding secrets), see [`nestjs-standards.md §3`](nestjs-standards.md).

### Examples

*   **Bad (Negative):**
    ```ts
    console.log('Incoming login attempt:', reqDto); // Leaks plaintext password in log!
    console.log('JWT token:', token);               // Token visible in log aggregator!
    ```

*   **Good (Positive):**
    ```ts
    console.log('Login attempt for email:', reqDto.email); // Safe: only identifier
    console.log('Token issued for userId:', user.id);      // Safe: no secret value
    ```
