import type { Database } from '../../database/database.type';
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
    await expect(service.createUnit({ name: 'Cuộn' })).resolves.toBeUndefined();

    expect(
      (mockDb.transaction as jest.Mock<Promise<unknown>>).mock.calls.length,
    ).toBe(1);
  });
});
