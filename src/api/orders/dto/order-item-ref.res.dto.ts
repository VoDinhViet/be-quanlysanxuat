import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { FileField } from '../../files/dto/file.field';
import { FileResDto } from '../../files/dto/file.res.dto';
import { UnitResDto } from '../../units/dto/unit.res.dto';

@Exclude()
export class OrderItemRefResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField()
  code!: string;

  @Expose()
  @StringField()
  name!: string;

  @Expose()
  @ClassField(() => UnitResDto)
  unit!: UnitResDto;

  @Expose()
  @FileField('imageFile', 'Item image')
  image!: FileResDto | null;
}
