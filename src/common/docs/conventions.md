# Coding Conventions

## DTO (Data Transfer Object)

### 1. Naming Standards

- **File Name**: `{action}.{type}.dto.ts`
  - `{action}`: The action or entity name (kebab-case).
  - `{type}`: `req` for Request, `res` for Response.
  - Example: `register.req.dto.ts`, `login.res.dto.ts`.

- **Class Name**: `{Action}{Type}Dto` (PascalCase)
  - Example: `RegisterReqDto`, `LoginResDto`.

### 2. Location
- DTOs should be placed in a `dto` folder within the API module they belong to.
- Example: `src/api/auth/dto/`.

### 3. Usage of Decorators
- Use custom field decorators from `@/decorators/field.decorators` for consistency.
- Always include a `description` in the field decorators for Swagger documentation.

---
