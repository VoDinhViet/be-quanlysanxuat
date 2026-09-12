import { HttpStatus } from '@nestjs/common';

import { DocumentType } from '../../common/utils/document-sequence.util';
import { ErrorCode } from '../../constants/error-code.constant';
import type { Database } from '../../database/database.type';
import { UnitScope } from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { UnitsService } from './units.service';

describe('UnitsService', () => {
  let service: UnitsService;
  let mockDb: Record<string, unknown>;

  beforeEach(() => {
    mockDb = {
      transaction: jest.fn(
        async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => {
          const tx: Record<string, unknown> = {
            insert: jest.fn().mockReturnValue({
              values: jest.fn().mockReturnValue({
                returning: jest
                  .fn()
                  .mockResolvedValue([
                    { id: 'unit-id-1', code: 'DVT0001', name: 'Cuộn' },
                  ]),
                onConflictDoUpdate: jest.fn().mockReturnValue({
                  returning: jest.fn().mockResolvedValue([{ currentValue: 1 }]),
                }),
              }),
            }),
            delete: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([]),
            }),
          };
          return await cb(tx);
        },
      ),
      query: {
        units: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
        },
      },
    };

    service = new UnitsService(mockDb as unknown as Database);
  });

  it('should create unit with auto-generated code DVT0001 and not require code in reqDto', async () => {
    await expect(
      service.createUnit({
        name: 'Cuộn',
        scopes: [UnitScope.MATERIAL],
      }),
    ).resolves.toBeUndefined();

    expect(
      (mockDb.transaction as jest.Mock<Promise<unknown>>).mock.calls.length,
    ).toBe(1);
  });

  it('should throw E243 if scopes array is empty', async () => {
    await expect(
      service.createUnit({
        name: 'Cuộn',
        scopes: [],
      }),
    ).rejects.toThrow(new AppException(ErrorCode.E243, HttpStatus.BAD_REQUEST));
  });
});
