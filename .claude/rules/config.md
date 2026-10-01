---
paths:
  - "src/config/**"
  - "src/**/config/**"
  - "src/redis/**"
  - "src/storage/**"
---

# Config, Redis and uploads

- Each config is a `registerAs` factory plus an env validator class and a `*-config.type.ts`, validated with `src/utils/validate-config.ts`. All of them are collected in `AllConfigType` (`src/config/config.type.ts`); read values with `configService.getOrThrow('section.key', { infer: true })`.
- A required variable that is missing stops the app at boot (class-validator), so adding one is a deployment change: update `.env.example` too.
- `RedisModule` provides a global Keyv-backed cache and BullMQ queues from the single `REDIS_URL`.
- Uploaded files are stored on local disk (`UPLOAD_DRIVER=local`, `uploads/`) and served statically at the domain root by `ServeStaticModule`; the storage key is the public path.
