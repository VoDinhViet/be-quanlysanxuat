/**
 * Module-level bridge between DI-bound config and `FileResDto`'s `@Transform`, which runs outside
 * Nest's injector (class-transformer has no DI access). `FilesModule` calls `setFileUrlResolver`
 * once at bootstrap, so every `FileResDto` mapping afterwards renders `url` as a freshly signed,
 * expiring download link.
 *
 * The default throws rather than falling back to a plain path: a silent fallback would emit URLs
 * that 401 at download time, and the cause would be invisible. Failing loudly at the first mapping
 * is the cheaper failure.
 */
let resolver: (fileId: string) => string = () => {
  throw new Error(
    'File URL resolver not initialised — FilesModule.onModuleInit did not run.',
  );
};

export function setFileUrlResolver(fn: (fileId: string) => string): void {
  resolver = fn;
}

export function resolveFileUrl(fileId: string): string {
  return resolver(fileId);
}
