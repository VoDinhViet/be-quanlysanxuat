import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count as drizzleCount, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { clientContacts, clientGroups, clients, ClientStatus } from '../../database/schemas';
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
            unaccentILike(clients.code, keyword),
            unaccentILike(clients.name, keyword),
            unaccentILike(clients.taxCode, keyword),
            unaccentILike(clients.email, keyword),
            unaccentILike(clients.phoneNumber, keyword),
            inArray(
              clients.id,
              this.db
                .select({ id: clientContacts.clientId })
                .from(clientContacts)
                .where(unaccentILike(clientContacts.name, keyword)),
            ),
          )
        : undefined,
      reqDto.status ? eq(clients.status, reqDto.status) : undefined,
      reqDto.clientGroupId ? eq(clients.clientGroupId, reqDto.clientGroupId) : undefined,
    );
    const orderBy = desc(clients.createdAt);

    const [entities, count] = await Promise.all([
      this.db.query.clients.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy,
        with: {
          group: true,
          creator: true,
          contacts: true,
        },
      }),
      this.db.select({ total: drizzleCount() }).from(clients).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(ClientResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(count[0]?.total ?? 0, reqDto),
    );
  }

  async getClientDetail(clientId: string): Promise<ClientResDto> {
    const client = await this.db.query.clients.findFirst({
      where: and(eq(clients.id, clientId), isNull(clients.deletedAt)),
      with: {
        group: true,
        creator: true,
        contacts: true,
      },
    });

    if (!client) {
      throw new AppException(ErrorCode.E009, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(ClientResDto, client, {
      excludeExtraneousValues: true,
    });
  }

  async createClient(reqDto: CreateClientReqDto, userId: string): Promise<ClientResDto> {
    let code = reqDto.code;
    if (code) {
      await this.validateCodeUniqueness(code);
    } else {
      code = await this.generateClientCode();
    }

    if (reqDto.taxCode) {
      await this.validateTaxCodeUniqueness(reqDto.taxCode);
    }
    await this.ensureClientGroupExists(reqDto.clientGroupId);

    const [client] = await this.db
      .insert(clients)
      .values({
        code,
        name: reqDto.name,
        clientGroupId: reqDto.clientGroupId,
        taxCode: reqDto.taxCode,
        phoneNumber: reqDto.phoneNumber,
        email: reqDto.email,
        address: reqDto.address,
        note: reqDto.note,
        status: reqDto.status ?? ClientStatus.ACTIVE,
        createdBy: userId,
      })
      .returning();

    if (reqDto.contacts?.length) {
      await this.replaceContacts(client.id, reqDto.contacts);
    }

    return this.getClientDetail(client.id);
  }

  async updateClient(clientId: string, reqDto: UpdateClientReqDto): Promise<ClientResDto> {
    await this.ensureClientExists(clientId);

    if (reqDto.code) {
      await this.validateCodeUniqueness(reqDto.code, clientId);
    }
    if (reqDto.taxCode) {
      await this.validateTaxCodeUniqueness(reqDto.taxCode, clientId);
    }
    if (reqDto.clientGroupId) {
      await this.ensureClientGroupExists(reqDto.clientGroupId);
    }

    // drizzle's `.set()` throws "No values to set" if every key resolves to `undefined` (e.g. a
    // PATCH that only touches `contacts`), so only issue the UPDATE when at least one field was
    // actually sent.
    const clientUpdate = {
      code: reqDto.code,
      name: reqDto.name,
      clientGroupId: reqDto.clientGroupId,
      taxCode: reqDto.taxCode,
      phoneNumber: reqDto.phoneNumber,
      email: reqDto.email,
      address: reqDto.address,
      note: reqDto.note,
      status: reqDto.status,
    };
    if (Object.values(clientUpdate).some((value) => value !== undefined)) {
      await this.db.update(clients).set(clientUpdate).where(eq(clients.id, clientId));
    }

    if (reqDto.contacts) {
      await this.replaceContacts(clientId, reqDto.contacts);
    }

    return this.getClientDetail(clientId);
  }

  async deleteClient(clientId: string): Promise<void> {
    await this.ensureClientExists(clientId);

    await this.db.update(clients).set({ deletedAt: new Date() }).where(eq(clients.id, clientId));
  }

  private async replaceContacts(
    clientId: string,
    contacts: CreateClientReqDto['contacts'],
  ): Promise<void> {
    await this.db.delete(clientContacts).where(eq(clientContacts.clientId, clientId));

    if (contacts?.length) {
      await this.db.insert(clientContacts).values(
        contacts.map((contact) => ({
          clientId,
          name: contact.name,
          position: contact.position,
          phoneNumber: contact.phoneNumber,
          email: contact.email,
          note: contact.note,
          isPrimary: contact.isPrimary ?? false,
        })),
      );
    }
  }

  private async ensureClientExists(clientId: string) {
    const existing = await this.db.query.clients.findFirst({
      where: and(eq(clients.id, clientId), isNull(clients.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E009, HttpStatus.NOT_FOUND);
    }

    return existing;
  }

  private async validateCodeUniqueness(code: string, ignoredClientId?: string): Promise<void> {
    const where = ignoredClientId
      ? and(eq(clients.code, code), ne(clients.id, ignoredClientId))
      : eq(clients.code, code);

    const existing = await this.db.query.clients.findFirst({
      columns: { id: true },
      where,
    });

    if (existing) {
      throw new AppException(ErrorCode.E024, HttpStatus.CONFLICT);
    }
  }

  private async validateTaxCodeUniqueness(
    taxCode: string,
    ignoredClientId?: string,
  ): Promise<void> {
    const where = ignoredClientId
      ? and(eq(clients.taxCode, taxCode), ne(clients.id, ignoredClientId))
      : eq(clients.taxCode, taxCode);

    const existing = await this.db.query.clients.findFirst({
      columns: { id: true },
      where,
    });

    if (existing) {
      throw new AppException(ErrorCode.E025, HttpStatus.CONFLICT);
    }
  }

  private async ensureClientGroupExists(clientGroupId: string): Promise<void> {
    const existing = await this.db.query.clientGroups.findFirst({
      columns: { id: true },
      where: eq(clientGroups.id, clientGroupId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E026, HttpStatus.NOT_FOUND);
    }
  }

  private async generateClientCode(): Promise<string> {
    const [totalRows] = await this.db.select({ total: drizzleCount() }).from(clients);
    return `KH${String((totalRows?.total ?? 0) + 1).padStart(4, '0')}`;
  }
}
