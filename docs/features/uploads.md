# Feature: Uploads

## Goal

Give any screen that needs a file (employee avatar, product image, supplier logo/attachment, ...) a small set of generic upload endpoints: send a file, get back a URL, then use that URL as the value of the relevant field (`avatarUrl`, `imageUrl`, `logoUrl`, an attachment entry, ...) on the entity's own create/update call. These endpoints do not attach the file to any entity itself.

## Business rules

- `POST /uploads` (image) only accepts: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, max **5MB**.
- `POST /uploads/document` (document) only accepts: `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, max **10MB**.
- Any other MIME type, or a file over the applicable limit, is rejected before/while writing to disk (not written in full first).
- The stored filename is a freshly generated UUID + the original extension — the client's original filename is never reused or exposed back as the stored name (it is still returned separately as `filename` in the response, which callers may want to display).
- Both endpoints write to the same `uploads/` directory and are served statically at `GET /uploads/<filename>` (no `api` prefix, no versioning — this is Express static middleware, not a Nest route).
- There is no association between an uploaded file and any entity at upload time — that link only happens when the caller later sends the returned `url` as a field value on another endpoint (e.g. `POST /users`, `POST /products`, `POST /suppliers`).
- Uploaded files are never deleted automatically — there is no cleanup job, and no endpoint replaces/deletes a previously uploaded file (see Out of scope).

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| POST | `/uploads` | jwt (`JwtAuthGuard`) | `multipart/form-data`, field name `file` (image, ≤5MB) | `201` + `UploadResDto` |
| POST | `/uploads/document` | jwt (`JwtAuthGuard`) | `multipart/form-data`, field name `file` (pdf/doc/docx/xls/xlsx, ≤10MB) | `201` + `UploadResDto` |

- `UploadResDto`: `{ url, filename, mimetype, size }`. `url` is a relative path (`/uploads/<filename>`) — the frontend can request it directly against the same backend host.
- The file is served (not this JSON endpoint) at `GET /uploads/<filename>` — that path is **not** under `/api` and has no version segment, unlike every other endpoint in this project.

## Error cases

| Case | ErrorCode | HTTP status |
| ---- | --------- | ----------- |
| No file sent, or MIME type not in the endpoint's allowed list | `ErrorCode.E016` | 400 Bad Request |
| File exceeds the endpoint's size limit (5MB image / 10MB document) | `ErrorCode.E017` | 413 Payload Too Large |

## Out of scope

- No deletion/replacement endpoint for an uploaded file — once uploaded, a file stays on disk indefinitely.
- No entity-specific upload (e.g. `POST /users/:id/avatar`) — this is a standalone, generic endpoint; the caller links the resulting URL by hand on the entity's own request.
- No cloud storage (S3/MinIO, etc.) — files live on local disk only, which does not survive a redeploy that wipes the filesystem.
- No image resizing/thumbnailing/EXIF stripping — the file is stored exactly as uploaded (aside from the renamed filename).
- No permission enforcement — protection comes solely from `@UseGuards(JwtAuthGuard)`, same as the rest of the project.

## Frontend integration notes

- **New feature (2026-07-18)**: `POST /api/uploads/document` did not exist before — added for supplier document attachments (see `docs/features/suppliers.md`). Same request/response shape as `POST /api/uploads`, just a different allowed MIME list and a 10MB limit. No change to the existing `POST /api/uploads` (image) endpoint.
- **New feature (2026-07-15)**: `POST /api/uploads` did not exist before. Requires `Authorization: Bearer <accessToken>` and a multipart body with a single field named `file`.
- Typical flow: upload the file first and wait for the `201` response, then use the returned `url` as the relevant field (`avatarUrl`/`imageUrl`/`logoUrl`/an attachment entry) when submitting the entity's own create/update form. There is no combined "create entity + upload file" request.
- The response's `url` is relative (e.g. `/uploads/3f2a...-c1.png`). Fetch it directly against the backend origin — do not prefix it with `/api` or a version segment, it is served by static middleware, not a versioned API route.
