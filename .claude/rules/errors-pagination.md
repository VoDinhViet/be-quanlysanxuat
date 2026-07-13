# Error Handling & Pagination Rules

## Errors

- Throw business errors as `new AppException(errorCode: ErrorCode, status: HttpStatus = HttpStatus.BAD_REQUEST, message?: string)` (`src/exceptions/app.exception.ts`).
- Every error code must be a member of the `ErrorCode` enum in `src/constants/error-code.constant.ts`, written as a dotted i18n-style key grouped by prefix (`Vxxx` for validation, `Exxx` for domain errors), e.g. `E002 = 'user.error.not_found'`. Add new codes there — don't hardcode ad-hoc message strings at the throw site.

## Pagination (offset)

- List endpoints return `new OffsetPaginatedDto(mappedItems, new OffsetPaginationDto(total, reqDto))` (`src/common/dto/offset-pagination/`).
- Fetch the page and the total count together with `Promise.all([db.query.<table>.findMany({...}), db.select({ total: count() }).from(table).where(where)])`.
- List request DTOs extend `PageOptionsDto`, which already provides `limit`, `page`, `q`, `order`, and a computed `offset` getter — don't reimplement these fields.
