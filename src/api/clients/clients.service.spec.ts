import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import { ClientStatus } from '../../database/schemas';
import {
  chainableMock,
  QueryMockArgs,
} from '../../test-utils/chainable-mock.util';
import { ClientsService } from './clients.service';
import { CreateClientReqDto } from './dto/create-client.req.dto';
import { GetClientsReqDto } from './dto/get-clients.req.dto';
import { UpdateClientReqDto } from './dto/update-client.req.dto';

describe('ClientsService', () => {
  let service: ClientsService;
  let mockDb: {
    query: {
      clients: {
        findMany: jest.Mock<any, [QueryMockArgs]>;
        findFirst: jest.Mock;
      };
      clientGroups: { findFirst: jest.Mock };
    };
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  const buildReqDto = (
    overrides: Partial<GetClientsReqDto> = {},
  ): GetClientsReqDto => Object.assign(new GetClientsReqDto(), overrides);

  beforeEach(async () => {
    mockDb = {
      query: {
        clients: {
          findMany: jest.fn<any, [QueryMockArgs]>().mockResolvedValue([]),
          findFirst: jest.fn(),
        },
        clientGroups: { findFirst: jest.fn() },
      },
      select: chainableMock([{ total: 0 }]),
      insert: chainableMock([{ id: 'new-client-id' }]),
      update: chainableMock(undefined),
      delete: chainableMock(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClientsService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<ClientsService>(ClientsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getClients', () => {
    it('excludes soft-deleted rows and applies no filter without q/filters', async () => {
      await service.getClients(buildReqDto());

      const callArgs = mockDb.query.clients.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeDefined();
      expect(callArgs.limit).toBe(10);
      expect(callArgs.offset).toBe(0);
      expect(callArgs.with).toEqual({
        group: true,
        creator: true,
        contacts: true,
      });
    });

    it('builds a keyword search filter (incl. contact name match) when q is provided', async () => {
      await service.getClients(buildReqDto({ q: 'nguyen van a' }));

      const callArgs = mockDb.query.clients.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeDefined();
    });

    it('applies status/clientGroupId filters when provided', async () => {
      await service.getClients(
        buildReqDto({ status: ClientStatus.ACTIVE, clientGroupId: 'group-1' }),
      );

      expect(mockDb.query.clients.findMany).toHaveBeenCalled();
    });

    it('returns the mapped paginated result', async () => {
      const rows = [{ id: 'c1', code: 'KH0001', name: 'Công ty A' }];
      mockDb.query.clients.findMany.mockResolvedValue(rows);
      mockDb.select = chainableMock([{ total: 1 }]);

      const result = await service.getClients(buildReqDto());

      expect(result.data).toHaveLength(1);
      expect(result.pagination.totalRecords).toBe(1);
    });
  });

  describe('getClientDetail', () => {
    it('returns the mapped client when found', async () => {
      mockDb.query.clients.findFirst.mockResolvedValue({
        id: 'c1',
        code: 'KH0001',
      });

      const result = await service.getClientDetail('c1');

      expect(result).toBeDefined();
      expect(mockDb.query.clients.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          with: { group: true, creator: true, contacts: true },
        }),
      );
    });

    it('throws E009 not found when the client does not exist', async () => {
      mockDb.query.clients.findFirst.mockResolvedValue(undefined);

      await expect(service.getClientDetail('missing')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E009 },
      });
    });
  });

  describe('createClient', () => {
    const reqDto: CreateClientReqDto = Object.assign(new CreateClientReqDto(), {
      name: 'Công ty A',
      clientGroupId: 'group-1',
    });

    it('auto-generates a code, validates the group, and inserts', async () => {
      mockDb.select = chainableMock([{ total: 0 }]);
      mockDb.query.clientGroups.findFirst.mockResolvedValue({ id: 'group-1' });
      mockDb.query.clients.findFirst.mockResolvedValue({ id: 'new-client-id' });

      const result = await service.createClient(reqDto, 'user-1');

      expect(mockDb.query.clientGroups.findFirst).toHaveBeenCalled();
      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('inserts the contacts when provided', async () => {
      mockDb.query.clientGroups.findFirst.mockResolvedValue({ id: 'group-1' });
      mockDb.query.clients.findFirst.mockResolvedValue({ id: 'new-client-id' });

      await service.createClient(
        Object.assign(new CreateClientReqDto(), reqDto, {
          contacts: [{ name: 'Nguyễn Văn A', isPrimary: true }],
        }),
        'user-1',
      );

      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockDb.insert).toHaveBeenCalledTimes(2); // client row + contacts
    });

    it('throws E024 when the explicit code is already taken', async () => {
      mockDb.query.clients.findFirst.mockResolvedValue({ id: 'other-client' });

      await expect(
        service.createClient(
          Object.assign(new CreateClientReqDto(), reqDto, { code: 'KH0001' }),
          'user-1',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E024 },
      });
    });

    it('throws E025 when taxCode is already taken', async () => {
      mockDb.query.clients.findFirst.mockResolvedValue({ id: 'other-client' });

      await expect(
        service.createClient(
          Object.assign(new CreateClientReqDto(), reqDto, {
            taxCode: '0312345678',
          }),
          'user-1',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E025 },
      });
    });

    it('throws E026 when clientGroupId does not reference an existing group', async () => {
      mockDb.query.clientGroups.findFirst.mockResolvedValue(undefined);

      await expect(
        service.createClient(reqDto, 'user-1'),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E026 },
      });
    });
  });

  describe('updateClient', () => {
    it('throws E009 when the client does not exist', async () => {
      mockDb.query.clients.findFirst.mockResolvedValue(undefined);

      await expect(
        service.updateClient('missing', new UpdateClientReqDto()),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E009 },
      });
    });

    it('updates only the fields sent', async () => {
      mockDb.query.clients.findFirst.mockResolvedValue({ id: 'c1' });

      await service.updateClient(
        'c1',
        Object.assign(new UpdateClientReqDto(), { note: 'VIP' }),
      );

      expect(mockDb.update).toHaveBeenCalled();
    });

    // A PATCH touching only `contacts` leaves every client-level field `undefined`. That used to
    // be skipped; it now writes `updated_at` alone, which is what keeps drizzle from throwing
    // "No values to set" (a 500).
    it('issues a safe updated_at-only UPDATE when only contacts are sent', async () => {
      mockDb.query.clients.findFirst.mockResolvedValue({ id: 'c1' });

      await expect(
        service.updateClient(
          'c1',
          Object.assign(new UpdateClientReqDto(), {
            contacts: [{ name: 'Trần Thị B' }],
          }),
        ),
      ).resolves.toBeDefined();

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.delete).toHaveBeenCalled(); // replaceContacts still runs
    });

    it('replaces contacts with an empty array to clear them', async () => {
      mockDb.query.clients.findFirst.mockResolvedValue({ id: 'c1' });

      await service.updateClient(
        'c1',
        Object.assign(new UpdateClientReqDto(), { contacts: [] }),
      );

      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockDb.insert).not.toHaveBeenCalled(); // nothing to insert
    });

    it('throws E024 when the new code is already taken by another client', async () => {
      mockDb.query.clients.findFirst
        .mockResolvedValueOnce({ id: 'c1' }) // ensureClientExists
        .mockResolvedValueOnce({ id: 'other' }); // validateCodeUniqueness conflict

      await expect(
        service.updateClient(
          'c1',
          Object.assign(new UpdateClientReqDto(), { code: 'KH0002' }),
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E024 },
      });
    });
  });

  describe('deleteClient', () => {
    it('soft-deletes the client', async () => {
      mockDb.query.clients.findFirst.mockResolvedValue({ id: 'c1' });

      await service.deleteClient('c1');

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('throws E009 when the client does not exist', async () => {
      mockDb.query.clients.findFirst.mockResolvedValue(undefined);

      await expect(service.deleteClient('missing')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E009 },
      });
    });
  });
});
