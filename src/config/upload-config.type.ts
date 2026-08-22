export enum StorageDriver {
  LOCAL = 'local',
}

export type UploadConfig = {
  driver: StorageDriver;
  dir: string;
  maxImageSize: number;
  maxDocumentSize: number;
  /** Grace period, in seconds, before a never-linked upload is swept. */
  orphanTtl: number;
};
