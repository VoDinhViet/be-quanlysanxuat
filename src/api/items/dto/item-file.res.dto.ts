import { Exclude, Expose } from 'class-transformer';

import { ClassField, UUIDField } from '../../../decorators/field.decorators';
import { FileResDto } from '../../files/dto/file.res.dto';

@Exclude()
export class ItemFileResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @ClassField(() => FileResDto)
  file!: FileResDto;
}
