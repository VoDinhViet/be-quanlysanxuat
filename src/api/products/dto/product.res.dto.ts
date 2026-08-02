import { Exclude, Expose } from 'class-transformer';

import { FileField } from '../../files/dto/file.field';
import { FileResDto } from '../../files/dto/file.res.dto';
import {
  ClassField,
  ClassFieldOptional,
} from '../../../decorators/field.decorators';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { ProductBaseResDto } from './product-base.res.dto';
import { ProductRefResDto } from './product-ref.res.dto';

@Exclude()
export class ProductResDto extends ProductBaseResDto {
  @Expose()
  @FileField('imageFile', 'Image file')
  image!: FileResDto | null;

  @Expose()
  @ClassFieldOptional(() => ProductRefResDto, { nullable: true })
  client!: ProductRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => ProductRefResDto, { nullable: true })
  group!: ProductRefResDto | null;

  @Expose()
  @ClassField(() => ProductRefResDto)
  unit!: ProductRefResDto;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  creator!: UserRefResDto | null;
}
