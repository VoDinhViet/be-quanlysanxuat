export type DetectedFileType = {
  mime: string;
  ext: string;
};

/**
 * Sniffs the real content type from the file's magic bytes, instead of trusting the
 * client-declared `mimetype` (trivially spoofable by renaming a file). `file-type` is a pure ESM
 * package; this project builds to CommonJS (`tsconfig.json` `module: nodenext`), so it must be
 * loaded via a dynamic `import()` rather than a static one to avoid `ERR_REQUIRE_ESM`.
 * Returns `undefined` when the content doesn't match any known file signature.
 */
export async function detectFileType(
  buffer: Buffer,
): Promise<DetectedFileType | undefined> {
  const { fileTypeFromBuffer } = await import('file-type');
  return fileTypeFromBuffer(buffer);
}
