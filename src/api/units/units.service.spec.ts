import { HttpStatus } from '@nestjs/common';

import { ErrorCode } from '../../constants/error-code.constant';
import type { Database } from '../../database/database.type';
import { UnitsService } from './units.service';

describe('UnitsService', () => {
  let service: UnitsService;
  let mockDb: {
    select: jest.Mock;
    insert: jest.Mock;
  };
  let existingRows: { id: string }[];

  beforeEach(() => {
    existingRows = [];
    mockDb = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockImplementation(() => existingRows),
          }),
        }),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      }),
    };

    service = new UnitsService(mockDb as unknown as Database);
  });

  it('should create unit with the user-entered code', async () => {
    await expect(
      service.createUnit({ code: 'CUON', name: 'Cuộn' }),
    ).resolves.toBeUndefined();

    expect(mockDb.insert).toHaveBeenCalledTimes(1);
  });

  it('should reject a duplicate code with 409 and not insert', async () => {
    existingRows = [{ id: 'unit-id-1' }];

    await expect(
      service.createUnit({ code: 'CUON', name: 'Cuộn' }),
    ).rejects.toMatchObject({
      response: { errorCode: ErrorCode.E241 },
      status: HttpStatus.CONFLICT,
    });
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});
