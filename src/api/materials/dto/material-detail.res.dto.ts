import { Exclude, Expose } from 'class-transformer';

import { ClassFieldOptional } from '../../../decorators/field.decorators';
import { MaterialAttachmentResDto } from './material-attachment.res.dto';
import { MaterialResDto } from './material.res.dto';

@Exclude()
export class MaterialDetailResDto extends MaterialResDto {
  @Expose()
  @ClassFieldOptional(() => MaterialAttachmentResDto, { each: true })
  attachments!: MaterialAttachmentResDto[];
}
