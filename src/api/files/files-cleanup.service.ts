import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, inArray, isNull, lt } from 'drizzle-orm';

import { AllConfigType } from '../../config/config.type';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { files } from '../../database/schemas';
import { STORAGE_PROVIDER } from '../../storage/storage.constants';
import type { StorageProvider } from '../../storage/storage-provider.interface';

/**
 * Deletes uploads that were never linked to an entity — the cost of the upload-then-link flow: a
 * user picks an image, the file lands in the registry, and then the form is abandoned.
 *
 * Rules:
 * - Sweeps purely on `linkedAt IS NULL`, never by scanning consumer tables for `*_file_id`. A
 *   reverse-lookup sweeper needs one `NOT EXISTS` per referencing table, and the day someone adds
 *   a module and forgets a clause, this job starts deleting live data — here a new module is safe
 *   by default, because linking is what marks a file, not who links it.
 * - Requires a long-lived process: `@nestjs/schedule` timers live in memory, so under the
 *   serverless handler exported by `main.ts` this never fires and nothing reports it — an
 *   external scheduler (cron hitting a dedicated endpoint, a queue worker, etc.) is needed in
 *   that deployment; none is wired up yet.
 */
@Injectable()
export class FilesCleanupService {
  private readonly logger = new Logger(FilesCleanupService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    private readonly configService: ConfigService<AllConfigType>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sweepOrphans(): Promise<void> {
    const orphanTtl = this.configService.getOrThrow('upload.orphanTtl', {
      infer: true,
    });
    const cutoff = new Date(Date.now() - orphanTtl * 1000);

    const orphans = await this.db.query.files.findMany({
      columns: { id: true, storageKey: true },
      where: and(isNull(files.linkedAt), lt(files.createdAt, cutoff)),
    });

    if (orphans.length === 0) {
      return;
    }

    // Bytes first, rows second. A row left pointing at missing bytes is recoverable — the next
    // sweep picks it up again. Bytes left with no row are unreachable: nothing records the key.
    for (const orphan of orphans) {
      await this.storageProvider.delete(orphan.storageKey);
    }

    await this.db.delete(files).where(
      inArray(
        files.id,
        orphans.map((orphan) => orphan.id),
      ),
    );

    this.logger.log(
      `Swept ${orphans.length} orphaned file(s) older than ${orphanTtl}s`,
    );
  }
}
