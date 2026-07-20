import { Exclude, Expose, Transform } from 'class-transformer';

import { MaterialStatus, MaterialType } from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  EnumField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { FileResDto } from '../../files/dto/file.res.dto';
import { toFileResDto } from '../../files/dto/to-file-res.dto.util';
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
  // `toClassOnly`: the global ClassSerializerInterceptor serialises this DTO a second
  // time, and on that pass `obj` is the DTO instance — which has no `imageFile` — so an
  // unrestricted transform would overwrite the resolved file with null.
  @Transform(({ obj }: { obj: { imageFile?: unknown } }) => toFileResDto(obj.imageFile), {
    toClassOnly: true,
  })
  @ClassFieldOptional(() => FileResDto, { nullable: true, description: 'Image file' })
  image!: FileResDto | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

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
  @StringFieldOptional({ nullable: true, description: 'Specific weight (numeric, as string)' })
  specificWeight!: string | null;

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
