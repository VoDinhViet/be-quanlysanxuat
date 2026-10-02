import { Exclude, Expose } from 'class-transformer';

import { FileField } from '../../files/dto/file.field';
import { FileResDto } from '../../files/dto/file.res.dto';
import { ItemRefResDto } from './item-ref.res.dto';

/** `ItemRefResDto` kèm ảnh vật tư — nguồn dữ liệu phải có quan hệ `imageFile` trên object item. */
@Exclude()
export class ItemImageRefResDto extends ItemRefResDto {
  @Expose()
  @FileField('imageFile', 'Ảnh vật tư')
  image!: FileResDto | null;
}
