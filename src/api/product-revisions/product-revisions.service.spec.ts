import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import { chainableMock } from '../../test-utils/chainable-mock.util';
import { CreateProductRevisionReqDto } from './dto/create-product-revision.req.dto';
import { UpdateProductRevisionReqDto } from './dto/update-product-revision.req.dto';
import { ProductRevisionsService } from './product-revisions.service';

describe('ProductRevisionsService', () => {
  let service: ProductRevisionsService;
  let mockDb: {
    query: {
      productRevisions: { findMany: jest.Mock; findFirst: jest.Mock };
      products: { findFirst: jest.Mock };
    };
    insert: jest.Mock;
    update: jest.Mock;
    transaction: jest.Mock;
  };

  /**
   * `chainable()` hands back a fresh jest.fn on every property access, so `.values()` arguments
   * can't be read back from it. This capturing variant records them for tests that need to assert
   * on what was actually written (e.g. the generated `revisionNo`).
   */
  const captureInsert = (resultId = 'new-revision-id') => {
    const insertedValues: unknown[] = [];
    const insert = jest.fn(() => ({
      values: jest.fn((rows: unknown) => {
        insertedValues.push(rows);
        return { returning: jest.fn().mockResolvedValue([{ id: resultId }]) };
      }),
    }));
    return { insert, insertedValues };
  };

  beforeEach(async () => {
    mockDb = {
      query: {
        productRevisions: {
          findMany: jest.fn().mockResolvedValue([]),
          findFirst: jest.fn(),
        },
        products: { findFirst: jest.fn() },
      },
      insert: chainableMock([{ id: 'new-revision-id' }]),
      update: chainableMock(undefined),
      // The callback receives `mockDb` itself, so call assertions work whether a write sits
      // inside the transaction or not.
      transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockDb)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ProductRevisionsService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<ProductRevisionsService>(ProductRevisionsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getRevisions', () => {
    it('throws E007 when the product does not exist', async () => {
      mockDb.query.products.findFirst.mockResolvedValue(undefined);

      await expect(service.getRevisions('missing')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E007 },
      });
    });

    it('marks isActive true only on the row matching currentRevisionId', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1', currentRevisionId: 'rev-2' });
      mockDb.query.productRevisions.findMany.mockResolvedValue([
        { id: 'rev-1', revisionNo: 'R01' },
        { id: 'rev-2', revisionNo: 'R02' },
      ]);

      const result = await service.getRevisions('p1');

      expect(result.find((r) => r.id === 'rev-1')?.isActive).toBe(false);
      expect(result.find((r) => r.id === 'rev-2')?.isActive).toBe(true);
    });
  });

  describe('getRevisionDetail', () => {
    it('throws E007 when the product does not exist', async () => {
      mockDb.query.products.findFirst.mockResolvedValue(undefined);

      await expect(service.getRevisionDetail('missing', 'rev-1')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E007 },
      });
    });

    it('throws E048 when the revision does not exist under this product', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1', currentRevisionId: null });
      mockDb.query.productRevisions.findFirst.mockResolvedValue(undefined);

      await expect(service.getRevisionDetail('p1', 'missing')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E048 },
      });
    });

    it('returns the mapped revision with isActive computed', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1', currentRevisionId: 'rev-1' });
      mockDb.query.productRevisions.findFirst.mockResolvedValue({ id: 'rev-1', revisionNo: 'R01' });

      const result = await service.getRevisionDetail('p1', 'rev-1');

      expect(result.isActive).toBe(true);
    });
  });

  describe('createRevision', () => {
    it('throws E007 when the product does not exist', async () => {
      mockDb.query.products.findFirst.mockResolvedValue(undefined);

      await expect(
        service.createRevision('missing', new CreateProductRevisionReqDto(), 'user-1'),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E007 },
      });
    });

    it('throws E049 when the explicit revisionNo is already taken for this product', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1', currentRevisionId: 'rev-1' });
      mockDb.query.productRevisions.findFirst.mockResolvedValue({ id: 'other-revision' });

      await expect(
        service.createRevision(
          'p1',
          Object.assign(new CreateProductRevisionReqDto(), {
            revisionNo: 'R02',
            sourceRevisionId: 'rev-1',
          }),
          'user-1',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E049 },
      });
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('throws E048 when sourceRevisionId does not reference an existing revision of this product', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1', currentRevisionId: 'rev-1' });
      mockDb.query.productRevisions.findFirst.mockResolvedValue(undefined);

      await expect(
        service.createRevision(
          'p1',
          Object.assign(new CreateProductRevisionReqDto(), { sourceRevisionId: 'missing' }),
          'user-1',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E048 },
      });
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    // The bug this guards against: a naive `count + 1` generator would produce "R03" here (since
    // 2 revisions already exist) and crash with a bare 500 on the unique constraint, because "R03"
    // is already taken (revisionNo can be sparse — a user may have created it explicitly, skipping
    // "R02"). The fix must keep incrementing past taken numbers until it finds a free one ("R04").
    it('generates the next free revisionNo, skipping an already-taken number', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1', currentRevisionId: 'rev-1' });
      mockDb.query.productRevisions.findMany.mockResolvedValue([
        { revisionNo: 'R01' },
        { revisionNo: 'R03' },
      ]);
      mockDb.query.productRevisions.findFirst.mockResolvedValue({
        id: 'new-revision-id',
        revisionNo: 'R04',
      });
      const { insert, insertedValues } = captureInsert();
      mockDb.insert = insert;

      await service.createRevision(
        'p1',
        Object.assign(new CreateProductRevisionReqDto(), { sourceRevisionId: 'rev-1' }),
        'user-1',
      );

      expect((insertedValues[0] as Record<string, unknown>).revisionNo).toBe('R04');
    });

    it('opens a transaction that inserts the revision and points the product at it', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1', currentRevisionId: null });
      mockDb.query.productRevisions.findFirst
        .mockResolvedValueOnce({ id: 'source-rev-id' }) // ensureRevisionExists: source found
        .mockResolvedValueOnce(undefined) // validateRevisionNoUniqueness: "R01" not taken yet
        .mockResolvedValueOnce({ id: 'new-revision-id', revisionNo: 'R01' }); // post-commit re-fetch
      const { insert, insertedValues } = captureInsert();
      mockDb.insert = insert;

      const result = await service.createRevision(
        'p1',
        Object.assign(new CreateProductRevisionReqDto(), {
          revisionNo: 'R01',
          note: 'Ghi chú',
          sourceRevisionId: 'source-rev-id',
        }),
        'user-1',
      );

      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(mockDb.update).toHaveBeenCalled();
      expect((insertedValues[0] as Record<string, unknown>).sourceRevisionId).toBe('source-rev-id');
      expect(result).toBeDefined();
    });

    it('does not switch the product pointer when setAsCurrent is false', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1', currentRevisionId: 'rev-1' });
      mockDb.query.productRevisions.findFirst
        .mockResolvedValueOnce({ id: 'source-rev-id' }) // ensureRevisionExists: source found
        .mockResolvedValueOnce(undefined) // validateRevisionNoUniqueness: "R05" not taken
        .mockResolvedValueOnce({ id: 'new-revision-id', revisionNo: 'R05' }); // post-commit re-fetch
      const { insert } = captureInsert();
      mockDb.insert = insert;

      await service.createRevision(
        'p1',
        Object.assign(new CreateProductRevisionReqDto(), {
          revisionNo: 'R05',
          sourceRevisionId: 'source-rev-id',
          setAsCurrent: false,
        }),
        'user-1',
      );

      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });

  describe('updateRevision', () => {
    it('updates revisionNo and note, then returns the refreshed detail', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1', currentRevisionId: 'rev-1' });
      mockDb.query.productRevisions.findFirst
        .mockResolvedValueOnce({ id: 'rev-1' }) // ensureRevisionExists
        .mockResolvedValueOnce(undefined) // validateRevisionNoUniqueness: "R02" not taken
        .mockResolvedValueOnce({ id: 'rev-1', revisionNo: 'R02', note: 'Ghi chú mới' }); // re-fetch

      const result = await service.updateRevision(
        'p1',
        'rev-1',
        Object.assign(new UpdateProductRevisionReqDto(), {
          revisionNo: 'R02',
          note: 'Ghi chú mới',
        }),
      );

      expect(mockDb.update).toHaveBeenCalled();
      expect(result.revisionNo).toBe('R02');
    });

    it('throws E007 when the product does not exist', async () => {
      mockDb.query.products.findFirst.mockResolvedValue(undefined);

      await expect(
        service.updateRevision('missing', 'rev-1', new UpdateProductRevisionReqDto()),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E007 },
      });
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('throws E048 when the revision does not exist under this product', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1', currentRevisionId: 'rev-1' });
      mockDb.query.productRevisions.findFirst.mockResolvedValue(undefined);

      await expect(
        service.updateRevision('p1', 'missing', new UpdateProductRevisionReqDto()),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E048 },
      });
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('throws E049 when the new revisionNo is already taken by another revision of this product', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1', currentRevisionId: 'rev-1' });
      mockDb.query.productRevisions.findFirst
        .mockResolvedValueOnce({ id: 'rev-1' }) // ensureRevisionExists
        .mockResolvedValueOnce({ id: 'rev-2' }); // validateRevisionNoUniqueness: "R02" taken by rev-2

      await expect(
        service.updateRevision(
          'p1',
          'rev-1',
          Object.assign(new UpdateProductRevisionReqDto(), { revisionNo: 'R02' }),
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E049 },
      });
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('skips the revisionNo uniqueness check when only note is sent', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1', currentRevisionId: 'rev-1' });
      mockDb.query.productRevisions.findFirst
        .mockResolvedValueOnce({ id: 'rev-1' }) // ensureRevisionExists
        .mockResolvedValueOnce({ id: 'rev-1', revisionNo: 'R01', note: 'moi' }); // re-fetch

      await service.updateRevision(
        'p1',
        'rev-1',
        Object.assign(new UpdateProductRevisionReqDto(), { note: 'moi' }),
      );

      // Exactly 2 calls: ensureRevisionExists + getRevisionDetail's re-fetch — the uniqueness
      // check (a 3rd call) never ran because `revisionNo` was omitted.
      expect(mockDb.query.productRevisions.findFirst).toHaveBeenCalledTimes(2);
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('activateRevision', () => {
    it('throws E007 when the product does not exist', async () => {
      mockDb.query.products.findFirst.mockResolvedValue(undefined);

      await expect(service.activateRevision('missing', 'rev-1')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E007 },
      });
    });

    it('throws E048 when the revision does not exist under this product', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1', currentRevisionId: 'rev-1' });
      mockDb.query.productRevisions.findFirst.mockResolvedValue(undefined);

      await expect(service.activateRevision('p1', 'missing')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E048 },
      });
    });

    it('switches the current revision pointer', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1', currentRevisionId: 'rev-1' });
      mockDb.query.productRevisions.findFirst.mockResolvedValue({ id: 'rev-2', revisionNo: 'R02' });

      const result = await service.activateRevision('p1', 'rev-2');

      expect(mockDb.update).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('createInitialRevision', () => {
    it('inserts "R01" using the given transaction and returns its id', async () => {
      const txInsert = chainableMock([{ id: 'first-revision-id' }]);
      const tx = { insert: txInsert } as unknown as Parameters<
        typeof service.createInitialRevision
      >[0];

      const revisionId = await service.createInitialRevision(tx, 'p1', 'user-1');

      expect(revisionId).toBe('first-revision-id');
      expect(txInsert).toHaveBeenCalled();
    });
  });
});
