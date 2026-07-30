import { Exclude, Expose } from 'class-transformer';

import { MaterialStatus, MaterialType } from '../../../database/schemas';
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
import { FileField } from '../../files/dto/file.field';
import { FileResDto } from '../../files/dto/file.res.dto';
import { SupplierRefResDto } from '../../suppliers/dto/supplier-ref.res.dto';
import { MaterialAttachmentResDto } from './material-attachment.res.dto';
import { MaterialCreatorResDto } from './material-creator.res.dto';
import { MaterialRefResDto } from './material-ref.res.dto';

@Exclude()
export class MaterialResDto {
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
  @EnumField(() => MaterialType)
  type!: MaterialType;

  @Expose()
  @EnumField(() => MaterialStatus)
  status!: MaterialStatus;

  @Expose()
  @ClassField(() => MaterialRefResDto)
  unit!: MaterialRefResDto;

  @Expose()
  @ClassField(() => MaterialRefResDto)
  group!: MaterialRefResDto;

  @Expose()
  @ClassFieldOptional(() => MaterialRefResDto, { nullable: true })
  client!: MaterialRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => SupplierRefResDto, { nullable: true })
  supplier!: SupplierRefResDto | null;

  @Expose()
  @FileField('imageFile', 'Image file')
  image!: FileResDto | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @NumberField({ description: 'Định mức tồn tối thiểu' })
  minStock!: number;

  // Extended information (all optional)
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
  @ClassFieldOptional(() => MaterialAttachmentResDto, { each: true })
  attachments!: MaterialAttachmentResDto[];

  @Expose()
  @ClassFieldOptional(() => MaterialCreatorResDto, { nullable: true })
  creator!: MaterialCreatorResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
