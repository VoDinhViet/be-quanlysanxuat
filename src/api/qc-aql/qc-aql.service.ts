import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, count, eq } from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { qcAqlPlans, qcAqlRules } from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { CreateQcAqlPlanReqDto } from './dto/create-qc-aql-plan.req.dto';
import { GetQcAqlPlansReqDto } from './dto/get-qc-aql-plans.req.dto';
import { PageQcAqlPlanResDto } from './dto/page-qc-aql-plan.res.dto';
import { QcAqlPlanResDto } from './dto/qc-aql-plan.res.dto';
import { QcAqlRuleReqDto } from './dto/qc-aql-rule.req.dto';
import { UpdateQcAqlPlanReqDto } from './dto/update-qc-aql-plan.req.dto';

@Injectable()
export class QcAqlService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getQcAqlPlans(
    reqDto: GetQcAqlPlansReqDto,
  ): Promise<OffsetPaginatedDto<PageQcAqlPlanResDto>> {
    const where = and(
      reqDto.inspectionLevel
        ? eq(qcAqlPlans.inspectionLevel, reqDto.inspectionLevel)
        : undefined,
      reqDto.isActive !== undefined
        ? eq(qcAqlPlans.isActive, reqDto.isActive)
        : undefined,
    );

    const [entities, countRows] = await Promise.all([
      this.db.query.qcAqlPlans.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: asc(qcAqlPlans.code),
      }),
      this.db.select({ total: count() }).from(qcAqlPlans).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PageQcAqlPlanResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getQcAqlPlan(planId: string): Promise<QcAqlPlanResDto> {
    const plan = await this.db.query.qcAqlPlans.findFirst({
      where: eq(qcAqlPlans.id, planId),
      with: { rules: { orderBy: asc(qcAqlRules.lotSizeMin) } },
    });

    if (!plan) {
      throw new AppException(ErrorCode.E216, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(QcAqlPlanResDto, plan, {
      excludeExtraneousValues: true,
    });
  }

  async createQcAqlPlan(
    reqDto: CreateQcAqlPlanReqDto,
  ): Promise<QcAqlPlanResDto> {
    await this.validateCodeUniqueness(reqDto.code);
    if (reqDto.rules) {
      this.validateNoOverlap(reqDto.rules);
    }

    const { rules, ...planFields } = reqDto;

    const planId = await this.db.transaction(async (tx) => {
      const [plan] = await tx
        .insert(qcAqlPlans)
        .values(planFields)
        .returning({ id: qcAqlPlans.id });

      if (rules?.length) {
        await tx
          .insert(qcAqlRules)
          .values(rules.map((rule) => ({ ...rule, aqlPlanId: plan.id })));
      }

      return plan.id;
    });

    return this.getQcAqlPlan(planId);
  }

  /** `rules` là replace-all (cùng khuôn `contacts` của `clients`) — gửi field này thì xoá hết rule
   * cũ, chèn lại bộ mới; không gửi thì giữ nguyên. */
  async updateQcAqlPlan(
    planId: string,
    reqDto: UpdateQcAqlPlanReqDto,
  ): Promise<QcAqlPlanResDto> {
    await this.ensureQcAqlPlanExists(planId);
    if (reqDto.rules) {
      this.validateNoOverlap(reqDto.rules);
    }

    const { rules, ...planFields } = reqDto;

    await this.db.transaction(async (tx) => {
      await tx
        .update(qcAqlPlans)
        .set(planFields)
        .where(eq(qcAqlPlans.id, planId));

      if (rules) {
        await tx.delete(qcAqlRules).where(eq(qcAqlRules.aqlPlanId, planId));
        if (rules.length) {
          await tx
            .insert(qcAqlRules)
            .values(rules.map((rule) => ({ ...rule, aqlPlanId: planId })));
        }
      }
    });

    return this.getQcAqlPlan(planId);
  }

  private async ensureQcAqlPlanExists(planId: string): Promise<void> {
    const existing = await this.db.query.qcAqlPlans.findFirst({
      columns: { id: true },
      where: eq(qcAqlPlans.id, planId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E216, HttpStatus.NOT_FOUND);
    }
  }

  private async validateCodeUniqueness(code: string): Promise<void> {
    const existing = await this.db.query.qcAqlPlans.findFirst({
      columns: { id: true },
      where: eq(qcAqlPlans.code, code),
    });

    if (existing) {
      throw new AppException(ErrorCode.E217, HttpStatus.CONFLICT);
    }
  }

  /** DB không chặn được 2 rule chồng dải lot size (cần `EXCLUDE USING gist`, drizzle-orm chưa có
   * builder) — đây là chốt chặn duy nhất. So từng cặp liền kề sau khi sắp theo `lotSizeMin`. */
  private validateNoOverlap(rules: QcAqlRuleReqDto[]): void {
    const sorted = [...rules].sort((a, b) => a.lotSizeMin - b.lotSizeMin);

    for (let i = 1; i < sorted.length; i++) {
      const prevMax = sorted[i - 1].lotSizeMax ?? Infinity;

      if (sorted[i].lotSizeMin <= prevMax) {
        throw new AppException(ErrorCode.E218, HttpStatus.BAD_REQUEST);
      }
    }
  }
}
