import { Exclude, Expose } from 'class-transformer';

import {
  ClassFieldOptional,
  DateFieldOptional,
} from '../../../decorators/field.decorators';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { SupplierReturnBaseResDto } from './supplier-return-base.res.dto';

@Exclude()
export class SupplierReturnResDto extends SupplierReturnBaseResDto {
  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  posterBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({
    nullable: true,
    description: 'Thời điểm xác nhận xuất trả',
  })
  postedAt!: Date | null;
}
