import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';

import { ClassField } from '../../../decorators/field.decorators';
import { ItemUnitRefResDto } from './item-unit-ref.res.dto';

/** Gộp `item`/`unit` phẳng (`.select()` không tự lồng được, mỗi query tự join `units` rời) thành
 * `item.unit` đúng shape `ItemUnitRefResDto`. `toClassOnly` bắt buộc — cùng lý do `FileField`
 * (`file.field.ts`): `ClassSerializerInterceptor` serialize lại DTO lần hai, lúc đó `obj` là
 * instance DTO (đã hết `unit` rời), transform không giới hạn sẽ ghi đè `item.unit` thành
 * `undefined`. */
export function ItemUnitField(): PropertyDecorator {
  return applyDecorators(
    Transform(
      ({ obj }: { obj: { item: object; unit: unknown } }) => ({
        ...obj.item,
        unit: obj.unit,
      }),
      { toClassOnly: true },
    ),
    ClassField(() => ItemUnitRefResDto),
  );
}
