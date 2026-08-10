import { Exclude, Expose } from 'class-transformer';

import { FileField } from '../../files/dto/file.field';
import { FileResDto } from '../../files/dto/file.res.dto';
import { ItemStatus, ItemType } from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  EnumField,
  NumberField,
  NumberFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { SupplierRefResDto } from '../../suppliers/dto/supplier-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { ItemRefResDto } from './item-ref.res.dto';

@Exclude()
export class PageItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã hàng hoá' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên hàng hoá' })
  name!: string;

  @Expose()
  @EnumField(() => ItemType, {
    description: 'FG (thành phẩm) / WIP (bán thành phẩm) / RM (vật tư)',
  })
  type!: ItemType;

  @Expose()
  @EnumField(() => ItemStatus)
  status!: ItemStatus;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @FileField('imageFile', 'Image file')
  image!: FileResDto | null;

  @Expose()
  @ClassFieldOptional(() => ItemRefResDto, { nullable: true })
  client!: ItemRefResDto | null;

  @Expose()
  @ClassField(() => ItemRefResDto)
  unit!: ItemRefResDto;

  @Expose()
  @ClassFieldOptional(() => SupplierRefResDto, {
    nullable: true,
    description: 'NCC chính — chỉ có ý nghĩa với RM',
  })
  supplier!: SupplierRefResDto | null;

  @Expose()
  @NumberField({
    description: 'Định mức tồn tối thiểu — chỉ có ý nghĩa với RM',
  })
  minStock!: number;

  @Expose()
  @StringFieldOptional({ nullable: true })
  materialGrade!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  technicalStandard!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  dimensions!: string | null;

  @Expose()
  @NumberFieldOptional({ nullable: true, description: 'Specific weight' })
  specificWeight!: number | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  colorSurface!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  description!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  origin!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  leadTime!: string | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  creatorBy!: UserRefResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
