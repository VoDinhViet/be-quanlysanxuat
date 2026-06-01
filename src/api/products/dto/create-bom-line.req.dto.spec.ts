import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateBomLineReqDto } from './create-bom-line.req.dto';

describe('CreateBomLineReqDto', () => {
  const validBody = {
    parentItemId: '11111111-1111-4111-8111-111111111111',
    childItemId: '22222222-2222-4222-8222-222222222222',
    qty: 2,
    unitId: '33333333-3333-4333-8333-333333333333',
  };

  it('should allow optional scrapRate and sortOrder to be omitted', async () => {
    const dto = plainToInstance(CreateBomLineReqDto, validBody);

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('should validate provided sortOrder as a non-negative integer', async () => {
    const dto = plainToInstance(CreateBomLineReqDto, {
      ...validBody,
      sortOrder: -1,
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'sortOrder',
        }),
      ]),
    );
  });
});
