import { Exclude, Expose } from 'class-transformer';

import { QcFileKind } from '../../../database/schemas';
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
  @EnumField(() => QcFileKind)
  kind!: QcFileKind;

  @Expose()
  @ClassField(() => FileResDto)
  file!: FileResDto;
}
