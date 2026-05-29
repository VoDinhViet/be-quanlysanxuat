import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, count, desc, eq, ilike, isNull, or } from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { OrderBy } from '../../constants/app.constant';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { clients } from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { ClientResDto } from './dto/client.res.dto';
import { CreateClientReqDto } from './dto/create-client.req.dto';
import { GetClientsReqDto } from './dto/get-clients.req.dto';
import { UpdateClientReqDto } from './dto/update-client.req.dto';

@Injectable()
export class ClientsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getClients(reqDto: GetClientsReqDto): Promise<OffsetPaginatedDto<ClientResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      isNull(clients.deletedAt),
      keyword
        ? or(
            ilike(clients.code, keyword),
            ilike(clients.fullName, keyword),
            ilike(clients.email, keyword),
            ilike(clients.phoneNumber, keyword),
            ilike(clients.taxCode, keyword),
            ilike(clients.companyName, keyword),
          )
        : undefined,
      reqDto.clientType ? eq(clients.clientType, reqDto.clientType) : undefined,
    );
    const orderBy =
      reqDto.order === OrderBy.DESC ? desc(clients.createdAt) : asc(clients.createdAt);

    const [entities, totalRows] = await Promise.all([
      this.db.query.clients.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy,
      }),
      this.db.select({ total: count() }).from(clients).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(ClientResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(totalRows[0]?.total ?? 0, reqDto),
    );
  }

  async createClient(reqDto: CreateClientReqDto): Promise<ClientResDto> {
    const code = await this.generateClientCode();

    const [client] = await this.db
      .insert(clients)
      .values({
        fullName: reqDto.fullName,
        code,
        email: reqDto.email,
        phoneNumber: reqDto.phoneNumber,
        clientType: reqDto.clientType,
        taxCode: reqDto.taxCode,
        companyName: reqDto.companyName,
        address: reqDto.address,
      })
      .returning();

    return plainToInstance(ClientResDto, client, {
      excludeExtraneousValues: true,
    });
  }

  async updateClient(clientId: string, reqDto: UpdateClientReqDto): Promise<ClientResDto> {
    await this.ensureClientExists(clientId);

    const [client] = await this.db
      .update(clients)
      .set({
        fullName: reqDto.fullName,
        email: reqDto.email,
        phoneNumber: reqDto.phoneNumber,
        clientType: reqDto.clientType,
        taxCode: reqDto.taxCode,
        companyName: reqDto.companyName,
        address: reqDto.address,
        updatedAt: new Date(),
      })
      .where(and(eq(clients.id, clientId), isNull(clients.deletedAt)))
      .returning();

    return this.mapClient(client);
  }

  async deleteClient(clientId: string): Promise<ClientResDto> {
    await this.ensureClientExists(clientId);

    const deletedAt = new Date();
    const [client] = await this.db
      .update(clients)
      .set({
        deletedAt,
        updatedAt: deletedAt,
      })
      .where(and(eq(clients.id, clientId), isNull(clients.deletedAt)))
      .returning();

    return this.mapClient(client);
  }

  private async generateClientCode(): Promise<string> {
    const [totalRows] = await this.db.select({ total: count() }).from(clients);

    return `KH${String((totalRows?.total ?? 0) + 1).padStart(4, '0')}`;
  }

  private async ensureClientExists(clientId: string): Promise<void> {
    const existingClient = await this.db.query.clients.findFirst({
      columns: {
        id: true,
      },
      where: and(eq(clients.id, clientId), isNull(clients.deletedAt)),
    });

    if (!existingClient) {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
    }
  }

  private mapClient(client: typeof clients.$inferSelect): ClientResDto {
    return plainToInstance(ClientResDto, client, {
      excludeExtraneousValues: true,
    });
  }
}
