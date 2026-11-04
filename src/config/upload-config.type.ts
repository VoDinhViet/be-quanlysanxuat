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
  /** Thời gian giữ, tính bằng giây, một file nằm trong bản nháp form kể từ lần "Lưu nháp" cuối. */
  draftTtl: number;
};
