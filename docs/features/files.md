# Feature: Files

## Goal

One upload endpoint for every screen that needs a file (employee avatar, material image/attachment, product image), backed by a **file registry** (`files` table): every uploaded file is a first-class row with its own id, instead of a URL string copied into whichever entity used it. A caller uploads once, gets a `fileId`, and links that id when creating/updating the entity (`avatarFileId`, `imageFileId`, `attachmentFileIds`). Storage sits behind a `StorageProvider` abstraction (local disk today; moving to S3/MinIO touches only `src/storage/`).

Reading is closed too: bytes are reachable **only** through `GET /files/:id/download` with a signed, expiring URL. There is no public static mount.

## Business rules

### Uploading — `type` and the policy registry

- `POST /files?type=<UploadType>` accepts one file (`multipart/form-data`, field `file`). `type` is **required** and travels in the **query string**, not the body.
- `UploadType` says what the file is *for*: `USER_AVATAR`, `MATERIAL_IMAGE`, `MATERIAL_DOCUMENT`, `PRODUCT_IMAGE`, `SUPPLIER_LOGO`, `SUPPLIER_DOCUMENT`. It is stored on the row, so the registry stays auditable without joining anything.
- `UPLOAD_POLICIES` (`src/api/files/upload-policy.ts`) maps each type to its `FileKind`, which picks the MIME allowlist and the size cap. **`kind` is derived server-side, never sent by the client** — otherwise a caller could ask for `USER_AVATAR` while claiming `DOCUMENT` and push a PDF past the image allowlist.

  | `UploadType` | `FileKind` | Max size |
  | ------------ | ---------- | -------- |
  | `USER_AVATAR` | `IMAGE` | 5MB |
  | `MATERIAL_IMAGE` | `IMAGE` | 5MB |
  | `PRODUCT_IMAGE` | `IMAGE` | 5MB |
  | `SUPPLIER_LOGO` | `IMAGE` | 5MB |
  | `MATERIAL_DOCUMENT` | `DOCUMENT` | 10MB |
  | `SUPPLIER_DOCUMENT` | `DOCUMENT` | 10MB |

- **Uploads are not permission-checked today: any authenticated user may upload any type.** A deliberate simplification, not an oversight — see "Turning per-type permissions on" below. `UPLOAD_POLICIES` intentionally carries no empty `permissions` field, because a registry that looks like it gates access while gating nothing is worse than one that plainly doesn't.
- **Why `type` is a query param, not a multipart field**: guards run *before* interceptors in Nest, and `FileInterceptor` (Multer) is what parses the body — so a guard can read `req.query` but sees an empty `req.body`. Keeping `type` in the query means a future permission guard can reject an unauthorized upload *before* Multer buffers up to 10MB into memory, and turning that guard on later costs the frontend nothing. Do not "tidy" it into the body.
- The file's **real content** is sniffed via magic-byte detection (`file-type`), not the client-declared `mimetype` — a renamed `.exe` claiming `image/png` is rejected (`E016`).
  - `IMAGE` allows: `image/jpeg`, `image/png`, `image/webp`, `image/gif`.
  - `DOCUMENT` allows: `application/pdf`, `.docx`, `.xlsx`. Legacy binary `.doc`/`.xls` are **not supported** — `file-type` has no signature for the old OLE2/CFB container, so a genuine legacy file would be indistinguishable from a spoofed one.
- The stored filename (`storageKey`) is `YYYY/MM/DD/<uuid>.<detected-ext>`; the client's filename is never reused as the stored name (kept as `originalName` for display).
- Every upload is a row in `files` (id, storageKey, originalName, mimetype, size, checksum, **type**, kind, storageDriver, uploadedBy, **linkedAt**, createdAt). Entities reference a file by `id` and never store a URL.

### Reading — signed URLs

- Bytes are served **only** by `GET /files/:id/download?exp=<unix>&sig=<hmac>`. The route is `@Public()` (no bearer token) and protected by `FileSignatureGuard`.
- **Why a signature instead of a bearer token**: a browser cannot attach an `Authorization` header to `<img src>`. Requiring a token would force the frontend to fetch every image as a blob and lose HTTP caching. The signature rides in the URL, so `src` just works.
- `sig` = `HMAC-SHA256(UPLOAD_URL_SECRET, "<fileId>:<exp>")`, base64url. `exp` is inside the signed payload, so pushing the expiry out invalidates the signature. Comparison uses `timingSafeEqual`.
- `FileResDto.url` is minted fresh on every mapping, valid for `UPLOAD_URL_TTL` seconds (default 3600). It is never persisted.
- Signature is verified **before** expiry: answering "expired" to an invalid signature would confirm to an attacker that the rest of their forgery was structurally correct.
- Images are served `Content-Disposition: inline`, documents `attachment`. The filename is emitted as RFC 5987 `filename*=UTF-8''…` plus an ASCII fallback — original names here are Vietnamese and a plain `filename=` mangles diacritics.
- **There is no public static mount.** `app.useStaticAssets` for the upload dir was removed on 2026-07-20: static middleware registers on the raw Express adapter, so the global guards never see those requests and every stored file was readable by anyone who could guess a URL. Do not re-add it.

### Linking and deleting

- An entity linking a `fileId` must reference an existing file — the consumer service calls `FilesService.linkFiles` before writing and 404s (`E042`) if not. Applies to `users.avatarFileId`, `materials.imageFileId`/`attachmentFileIds`, `products.imageFileId`, `suppliers.logoFileId`/`attachmentFileIds`.
- `DELETE /files/:id` is restricted to **the uploader or a `system:manage` holder**. Without this any authenticated user could wipe the whole registry, bytes included.
- Deleting removes both the row and the bytes. There is **no reference counting** — an entity pointing at a deleted file has its FK nulled (`material_attachments` rows cascade away). `copyProduct` duplicates the `imageFileId`, so two products can share one file; deleting it clears both.

### Orphan cleanup — `linked_at`

Upload-then-link means an abandoned form leaves a file nobody owns. That is the price of the flow (and the flow is still right: the image is a form field, create and update share one path, and `attachmentFileIds` could not be written atomically otherwise). The price is paid here:

- `files.linked_at` is `NULL` on upload and stamped by `FilesService.linkFiles` the first time an entity references the file. Re-linking does not move it — it means "first used".
- `FilesCleanupService` runs hourly and deletes rows where `linked_at IS NULL` **and** `created_at` is older than `UPLOAD_ORPHAN_TTL` (default 24h), removing the bytes first and the rows second.
- **It never scans consumer tables.** A reverse-lookup sweeper would need one `NOT EXISTS` per referencing table, and the day someone adds a module and forgets a clause it starts deleting live data. Marking on link makes a new module safe by default.

Two things that are easy to get wrong:

- **`linkFiles` is called before the write, including before `db.transaction` — never after.** If a later write fails, a file marked linked with nothing pointing at it is permanent garbage: wasteful, harmless. Reverse the order and a crash between the entity write and the marking leaves a live row referencing an unlinked file, which the sweeper deletes a day later. The ordering fails towards keeping garbage rather than losing data, deliberately.
- **The cron needs a long-lived process.** `@nestjs/schedule` timers live in memory, so under the serverless handler `main.ts` exports, `sweepOrphans` never fires and nothing reports it. In that deployment, drive the sweep externally (a scheduled job calling into the app, or `pg_cron`) — do not assume it is running.

Still leaking, accepted for now: clearing an entity's `imageFileId` does **not** reset `linked_at`, so a replaced image stays marked forever. Much smaller than the original leak (it needs an explicit replace, not just an abandoned form) and in the safe direction; fixing it properly needs reference counting.

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| POST | `/files?type=<UploadType>` | jwt | `multipart/form-data`, field `file` | `201` + `FileResDto` |
| GET | `/files/:id` | jwt | — | `FileResDto` (metadata only) |
| GET | `/files/:id/download` | **signature** | `?exp=&sig=` | `200` + raw bytes |
| DELETE | `/files/:id` | jwt (uploader or `system:manage`) | — | `204` |

- `FileResDto`: `{ id, url, originalName, mimetype, size, type, kind, createdAt }`.
- Routes are unversioned (`/api/files/...`) — URI versioning is enabled but no controller declares a version.
- No entity association at upload time: send the returned `id` as the entity's own field on its create/update call. There is no combined "create entity + upload" request.

## Error cases

| Case | ErrorCode | HTTP status |
| ---- | --------- | ----------- |
| No file sent, or content doesn't match the allowlist for the type's `kind` | `ErrorCode.E016` | 400 |
| File exceeds the type's size limit | `ErrorCode.E017` | 413 |
| `fileId` doesn't exist in the registry | `ErrorCode.E042` | 404 |
| Download URL signature missing, malformed, or wrong | `ErrorCode.E044` | 401 |
| Download URL signature valid but expired | `ErrorCode.E045` | 401 |
| Deleting someone else's file without `system:manage` | `ErrorCode.E033` | 403 |
| Missing or unknown `type` on upload | — | 422 (`ValidationPipe`) |

`E044` and `E045` are separate on purpose: `E045` means "re-read the entity to get a fresh link" (routine), `E044` means the link was tampered with or minted elsewhere (worth logging).

## Configuration

| Env | Required | Default | Notes |
| --- | -------- | ------- | ----- |
| `UPLOAD_URL_SECRET` | **yes**, min 32 chars | — | HMAC key for download URLs. Unlike the other upload keys this is **not** optional: a missing or guessable value means anyone can mint a valid download link, i.e. the access control does nothing. Boot fails without it. |
| `UPLOAD_URL_TTL` | no | `3600` | Signed URL lifetime in seconds. |
| `UPLOAD_DRIVER` / `UPLOAD_DIR` | no | `local` / `<cwd>/uploads` | |
| `UPLOAD_MAX_IMAGE_SIZE` / `UPLOAD_MAX_DOCUMENT_SIZE` | no | 5MB / 10MB | |
| `UPLOAD_ORPHAN_TTL` | no | `86400` | Grace period in seconds before a never-linked upload is swept. Must outlast the longest realistic form-filling session — too short and the sweeper deletes an image the user is about to submit. |

`UPLOAD_PUBLIC_PATH` was removed — nothing is publicly reachable any more.

## Turning per-type permissions on

Three steps, **with no API contract change** (which is why `type` sits in the query today):

1. Add `permissions: PermissionCode[]` to `UploadPolicy` and fill it per type (e.g. `MATERIAL_DOCUMENT → ['materials:create']`).
2. Add an `UploadPolicyGuard` reading `request.query.type`, and `@UseGuards` it on the upload route. **The guard must validate `type` itself** — `ValidationPipe` runs inside the handler, i.e. after guards, so the raw string is all the guard gets.
3. Use **OR** semantics (`permissions.some(...)`), unlike the global `PermissionsGuard` which uses `every` (AND) — someone holding only `products:update` must still be able to replace a product image.

The frontend changes nothing; only under-permissioned roles start seeing 403.

## Out of scope

- No image resizing/thumbnailing/EXIF stripping — stored exactly as uploaded.
- No cloud storage yet; local disk does not survive a filesystem-wiping redeploy.
- No reference counting or cascade-detach on delete — see the `linked_at` note above for what *is* cleaned up and what still leaks.
- **Signatures are bound to a file id, not to a user.** Anyone holding a live URL can read it — the "anyone with the link" model, a direct consequence of `<img>` not being able to send headers. It stops outsiders enumerating storage; it does not stop a user deliberately forwarding a link.

## Frontend integration notes

- **New (2026-07-20)**: `SUPPLIER_LOGO` and `SUPPLIER_DOCUMENT` types added when the suppliers module was rolled back — it now uses the registry (`logoFileId` / `attachmentFileIds`) instead of the plain-URL model it originally shipped with. See `docs/features/suppliers.md`.
- **Breaking change (2026-07-20)**: `POST /files` now requires **`?type=`** in the query string and no longer accepts `kind` in the body. Use `USER_AVATAR`, `MATERIAL_IMAGE`, `MATERIAL_DOCUMENT`, or `PRODUCT_IMAGE`. Omitting it is a `422`. The response gained a `type` field.
- **Breaking change (2026-07-20)**: **file URLs changed shape and now expire.** `url` is no longer `/uploads/<path>` but `/api/files/<id>/download?exp=…&sig=…`, valid for 1 hour by default. `GET /uploads/**` returns **404** — the static mount is gone.
  - It still works directly in `<img src>` / `<a href>`; no `Authorization` header needed, and none will work.
  - **Do not cache, persist, or share these URLs.** A stale one returns `401 E045` — re-read the owning entity (`GET /materials`, `GET /users/:id`, …) to get a fresh link. `401 E044` means the URL was altered.
- **Breaking change (2026-07-20)**: `POST /users/:userId/avatar` was **removed**. Set an avatar with `POST /files?type=USER_AVATAR` → `PATCH /users/:userId { avatarFileId }`. `UpdateUserReqDto` gained `avatarFileId` for exactly this.
- **Breaking change (2026-07-20)**: products moved onto the registry. `imageUrl` (a plain string) is gone from `CreateProductReqDto`/`UpdateProductReqDto` → send `imageFileId`; `ProductResDto.imageUrl` → `ProductResDto.image: FileResDto | null`. Read the URL from `image.url`.
- **Breaking change (2026-07-20)**: `DELETE /files/:id` now returns **403 `E033`** unless you uploaded the file or hold `system:manage`.
- Unchanged: upload first, then send the returned `id` on the entity's own create/update. Still no combined request.
