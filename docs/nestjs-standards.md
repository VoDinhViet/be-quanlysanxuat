# NestJS Standards

Guidelines for the NestJS modular monolith layers to ensure strict separation of concerns, maintainability, and clean architecture.

---

## 1. Controllers

*   **Rule:** Keep controllers thin. They should only handle HTTP route definitions, input parameters/queries mapping via DTOs, permission/auth metadata, and a single call to the business service layer. Absolutely no business logic, direct database/ORM operations, or caching manipulation.

### Examples

*   **Bad (Negative):**
    ```ts
    @Controller('users')
    export class UsersController {
      constructor(@Inject(DRIZZLE) private readonly db: Database) {}

      @Post()
      async createUser(@Body() reqDto: CreateUserReqDto) {
        // Violations: Direct DB query, manual status assignment, and hashing inside controller!
        const existing = await this.db.select().from(users).where(eq(users.email, reqDto.email));
        if (existing.length > 0) throw new ConflictException();
        const hashedPassword = await hash(reqDto.password, 10);
        return this.db.insert(users).values({ ...reqDto, password: hashedPassword });
      }
    }
    ```

*   **Good (Positive):**
    ```ts
    @Controller('users')
    @ApiAuth()
    export class UsersController {
      constructor(private readonly usersService: UsersService) {}

      @Post()
      @Permissions('users:create')
      async createUser(@Body() reqDto: CreateUserReqDto): Promise<UserResDto> {
        return this.usersService.createUser(reqDto);
      }
    }
    ```

---

## 2. Services

*   **Rule:** Services own business logic, query execution (Drizzle), transactional orchestration, and DTO response mapping. Throw expected business errors using `AppException`. Never leak passwords, hashes, tokens, or credentials in service return values.

### Examples

*   **Bad (Negative):**
    ```ts
    @Injectable()
    export class UsersService {
      constructor(@Inject(DRIZZLE) private readonly db: Database) {}

      async createUser(reqDto: CreateUserReqDto) {
        // Violations: Returns database entities directly, doesn't map response DTO, exposes password hash!
        const password = await hash(reqDto.password, 10);
        const [user] = await this.db.insert(users).values({ ...reqDto, password }).returning();
        return user;
      }
    }
    ```

*   **Good (Positive):**
    ```ts
    @Injectable()
    export class UsersService {
      constructor(@Inject(DRIZZLE) private readonly db: Database) {}

      async createUser(reqDto: CreateUserReqDto): Promise<UserResDto> {
        await this.ensureEmailAvailable(reqDto.email);

        const password = await hash(reqDto.password, 10);
        const [user] = await this.db
          .insert(users)
          .values({
            email: reqDto.email,
            password,
            fullName: reqDto.fullName,
            status: UserStatus.ACTIVE,
          })
          .returning();

        return plainToInstance(UserResDto, user, {
          excludeExtraneousValues: true,
        });
      }

      private async ensureEmailAvailable(email: string): Promise<void> {
        const existing = await this.db.query.users.findFirst({
          where: eq(users.email, email),
        });
        if (existing) {
          throw new AppException(ErrorCode.E003, HttpStatus.CONFLICT);
        }
      }
    }
    ```

---

## 3. DTOs (Data Transfer Objects)

*   **Rule:** Request DTOs must use field decorators from `src/decorators/field.decorators.ts` to strictly validate inputs. Response DTOs must use `@Exclude()` and `@Expose()` to whitelist and shape outputs. Never expose passwords, tokens, hashes, or connection strings.

### Examples

*   **Bad (Negative):**
    ```ts
    export class CreateUserReqDto {
      email!: string;    // Missing validation decorators!
      password!: string;
    }
    
    // Missing @Exclude() and @Expose() - leaks password!
    export class UserResDto {
      id!: string;
      email!: string;
      password!: string; 
    }
    ```

*   **Good (Positive):**
    ```ts
    import { EmailField, PasswordField } from '../../../decorators/field.decorators';

    export class CreateUserReqDto {
      @EmailField({ description: 'Email address' })
      email!: string;

      @PasswordField({ description: 'Secure password' })
      password!: string;
    }
    
    import { Exclude, Expose } from 'class-transformer';
    import { StringField, UUIDField } from '../../../decorators/field.decorators';

    @Exclude()
    export class UserResDto {
      @Expose()
      @UUIDField()
      id!: string;

      @Expose()
      @StringField()
      email!: string;
    }
    ```

---

## 4. Guards & Permissions

*   **Rule:** Guard roles and actions using centralized `@Permissions(...)` and `@ApiAuth` annotations in controllers. Avoid writing manual conditional check blocks inside your controllers or service methods.

### Examples

*   **Bad (Negative):**
    ```ts
    @Post()
    async createOrder(@User() user: UserEntity, @Body() reqDto: CreateOrderReqDto) {
      // Violations: Manual check scattered in controller!
      if (user.role !== 'admin' && user.role !== 'business') {
        throw new ForbiddenException('Cannot perform this action');
      }
      return this.ordersService.createOrder(reqDto);
    }
    ```

*   **Good (Positive):**
    ```ts
    @Post()
    @Permissions('orders:create') // Clean declarative security
    async createOrder(@Body() reqDto: CreateOrderReqDto): Promise<OrderResDto> {
      return this.ordersService.createOrder(reqDto);
    }
    ```

---

## 5. Modules & Communication

*   **Rule:** Business modules under `src/api/<module>/` must register their own controllers and providers. Only export stable services needed by other modules. Prefer service-to-service calls; never import controllers from another module. Avoid circular dependencies.

### Examples

*   **Bad (Negative):**
    ```ts
    // In users.module.ts
    @Module({
      imports: [OrdersModule], // Dangerous: could create circular import if Orders imports Users!
      controllers: [UsersController, OrdersController], // Violation: importing a controller from another module!
    })
    export class UsersModule {}
    ```

*   **Good (Positive):**
    ```ts
    // In users.module.ts
    @Module({
      controllers: [UsersController],
      providers: [UsersService],
      exports: [UsersService], // Safely exports UsersService for other modules to use
    })
    export class UsersModule {}
    ```
