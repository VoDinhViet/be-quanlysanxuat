import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  ClassFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { FileField } from '../../files/dto/file.field';
import { FileResDto } from '../../files/dto/file.res.dto';
import { ItemFileResDto } from '../../items/dto/item-file.res.dto';
import { UnitRefResDto } from '../../units/dto/unit-ref.res.dto';

@Exclude()
export class OrderItemRefResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField()
  code!: string;

  @Expose()
  @StringFieldOptional({ nullable: true })
  revision?: string;

  @Expose()
  @StringField()
  name!: string;

  @Expose()
  @ClassField(() => UnitRefResDto)
  unit!: UnitRefResDto;

  @Expose()
  @FileField('imageFile', 'Item image')
  image!: FileResDto | null;

  @Expose()
  @ClassFieldOptional(() => ItemFileResDto, { each: true, nullable: true })
  files?: ItemFileResDto[];
}
