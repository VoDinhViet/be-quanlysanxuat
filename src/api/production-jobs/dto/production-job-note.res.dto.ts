import { Exclude, Expose } from 'class-transformer';

import {
  ClassFieldOptional,
  DateField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';

@Exclude()
export class ProductionJobNoteResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Nội dung ghi chú' })
  content!: string;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, {
    nullable: true,
    description: 'Người viết',
  })
  creator!: UserRefResDto | null;

  @Expose()
  @DateField({ description: 'Thời điểm viết' })
  createdAt!: Date;
}
