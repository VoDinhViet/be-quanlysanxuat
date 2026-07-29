import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, eq, isNull } from 'drizzle-orm';

import { unaccentILike } from '../../common/utils/search.util';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { operations } from '../../database/schemas';
import { GetOperationsReqDto } from './dto/get-operations.req.dto';
import { OperationResDto } from './dto/operation.res.dto';

@Injectable()
export class OperationsService {
  // Not true pagination — a defensive cap in case this "small curated catalogue" ever
  // grows past what a bare-array response should reasonably return.
  private static readonly LIMIT = 100;

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Returns the whole catalogue (capped at `OperationsService.LIMIT`) — see `GetOperationsReqDto` for why this isn't paginated. */
  async getOperations(reqDto: GetOperationsReqDto): Promise<OperationResDto[]> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const entities = await this.db.query.operations.findMany({
      where: and(
        isNull(operations.deletedAt),
        keyword ? unaccentILike(operations.name, keyword) : undefined,
        reqDto.type ? eq(operations.type, reqDto.type) : undefined,
        reqDto.status ? eq(operations.status, reqDto.status) : undefined,
      ),
      // Alphabetical, because this is a small read-only catalogue, not a management list.
      orderBy: asc(operations.name),
      limit: OperationsService.LIMIT,
      with: { creator: true },
    });

    return plainToInstance(OperationResDto, entities, {
      excludeExtraneousValues: true,
    });
  }
}
