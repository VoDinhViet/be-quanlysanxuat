import { and, eq, inArray, isNull } from 'drizzle-orm';
import { HttpStatus } from '@nestjs/common';

import { ErrorCode } from '../../constants/error-code.constant';
import type { DbTransaction } from '../../database/database.type';
import {
  items,
  ItemType,
  productionJobIssues,
  ProductionJobLogAction,
  productionJobLogs,
  productionJobs,
  units,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import {
  dimensionKey,
  getOrCreateJobItemIds,
  getOrCreateJobUnitIds,
} from './production-job-snapshot.query';

/** Ghi vật tư riêng của Job `PENDING` (`production_job_issues`) — chạy trong transaction của
 * `ProductionJobsService`, sau `getProductionJobForUpdate` + `ensureStatus(PENDING)`. Mỗi lần ghi
 * đóng dấu `snapshotEditedAt` và ghi một dòng log `ITEMS_EDITED`. */

export async function addJobIssues(
  tx: DbTransaction,
  params: {
    jobId: string;
    lines: { itemId: string; requiredQty: number }[];
    userId: string;
  },
): Promise<void> {
  const itemIds = params.lines.map((line) => line.itemId);
  if (new Set(itemIds).size !== itemIds.length) {
    throw new AppException(ErrorCode.E281, HttpStatus.CONFLICT);
  }

  const foundItems = await tx
    .select()
    .from(items)
    .where(and(inArray(items.id, itemIds), isNull(items.deletedAt)));
  if (foundItems.length !== itemIds.length) {
    throw new AppException(ErrorCode.E007, HttpStatus.NOT_FOUND);
  }
  if (foundItems.some((item) => item.type !== ItemType.DIRECT)) {
    throw new AppException(ErrorCode.E283, HttpStatus.BAD_REQUEST);
  }

  const existing = await tx
    .select({ id: productionJobIssues.id })
    .from(productionJobIssues)
    .where(
      and(
        eq(productionJobIssues.productionJobId, params.jobId),
        inArray(productionJobIssues.itemId, itemIds),
      ),
    );
  if (existing.length) {
    throw new AppException(ErrorCode.E281, HttpStatus.CONFLICT);
  }

  const unitRows = await tx
    .select()
    .from(units)
    .where(inArray(units.id, [...new Set(foundItems.map((i) => i.unitId))]));
  const unitById = new Map(unitRows.map((unit) => [unit.id, unit]));
  const itemById = new Map(foundItems.map((item) => [item.id, item]));

  const jobItemIdByKey = await getOrCreateJobItemIds(
    tx,
    foundItems.map((item) => ({ item })),
  );
  const jobUnitIdByKey = await getOrCreateJobUnitIds(
    tx,
    unitRows.map((unit) => ({ unit })),
  );

  await tx.insert(productionJobIssues).values(
    params.lines.map((line) => {
      const item = itemById.get(line.itemId)!;
      const unit = unitById.get(item.unitId)!;

      return {
        productionJobId: params.jobId,
        itemId: item.id,
        productionJobItemId: jobItemIdByKey.get(
          dimensionKey(item.id, item.code, item.name),
        )!,
        productionJobUnitId: jobUnitIdByKey.get(
          dimensionKey(unit.id, unit.code, unit.name),
        )!,
        imageFileId: item.imageFileId,
        unitQty: null,
        requiredQty: line.requiredQty,
      };
    }),
  );

  await markEdited(
    tx,
    params.jobId,
    params.userId,
    `Thêm ${params.lines.length} vật tư: ${params.lines
      .map(
        (line) => `${itemById.get(line.itemId)!.code} (SL ${line.requiredQty})`,
      )
      .join(', ')}`,
  );
}

export async function updateJobIssue(
  tx: DbTransaction,
  params: {
    jobId: string;
    issueId: string;
    requiredQty: number;
    userId: string;
  },
): Promise<void> {
  const issue = await findJobIssue(tx, params.jobId, params.issueId);

  await tx
    .update(productionJobIssues)
    .set({ requiredQty: params.requiredQty })
    .where(eq(productionJobIssues.id, issue.id));

  await markEdited(
    tx,
    params.jobId,
    params.userId,
    `Sửa vật tư ${issue.code}: SL ${issue.requiredQty} → ${params.requiredQty}`,
  );
}

export async function removeJobIssue(
  tx: DbTransaction,
  params: { jobId: string; issueId: string; userId: string },
): Promise<void> {
  const issue = await findJobIssue(tx, params.jobId, params.issueId);

  await tx
    .delete(productionJobIssues)
    .where(eq(productionJobIssues.id, issue.id));

  await markEdited(
    tx,
    params.jobId,
    params.userId,
    `Xoá vật tư ${issue.code} (SL ${issue.requiredQty})`,
  );
}

async function findJobIssue(
  tx: DbTransaction,
  jobId: string,
  issueId: string,
): Promise<{ id: string; code: string; requiredQty: number }> {
  const issue = await tx.query.productionJobIssues.findFirst({
    columns: { id: true, requiredQty: true },
    with: { jobItem: { columns: { code: true } } },
    where: and(
      eq(productionJobIssues.id, issueId),
      eq(productionJobIssues.productionJobId, jobId),
    ),
  });
  if (!issue) {
    throw new AppException(ErrorCode.E282, HttpStatus.NOT_FOUND);
  }

  return {
    id: issue.id,
    code: issue.jobItem.code,
    requiredQty: issue.requiredQty,
  };
}

async function markEdited(
  tx: DbTransaction,
  jobId: string,
  userId: string,
  content: string,
): Promise<void> {
  await tx
    .update(productionJobs)
    .set({ snapshotEditedAt: new Date() })
    .where(eq(productionJobs.id, jobId));

  await tx.insert(productionJobLogs).values({
    productionJobId: jobId,
    action: ProductionJobLogAction.ITEMS_EDITED,
    content,
    performedBy: userId,
  });
}
