export enum StorageDriver {
  LOCAL = 'local',
}

export type UploadConfig = {
  driver: StorageDriver;
  dir: string;
  maxImageSize: number;
  maxDocumentSize: number;
  /** HMAC key for download-URL signatures. Required — see `upload.config.ts`. */
  urlSecret: string;
  /** How long a signed download URL stays valid, in seconds. */
  urlTtl: number;
  /** Grace period, in seconds, before a never-linked upload is swept. */
  orphanTtl: number;
};
