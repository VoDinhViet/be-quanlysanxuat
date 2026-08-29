import { Exclude, Expose } from 'class-transformer';

import { QualityEvidenceKind } from '../../../database/schemas';
import {
  ClassField,
  EnumField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { FileResDto } from '../../files/dto/file.res.dto';

@Exclude()
export class QcFileResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @EnumField(() => QualityEvidenceKind)
  kind!: QualityEvidenceKind;

  @Expose()
  @ClassField(() => FileResDto)
  file!: FileResDto;
}
