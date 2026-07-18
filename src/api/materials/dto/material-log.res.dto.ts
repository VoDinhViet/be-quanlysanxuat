import { ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import {
  ClassFieldOptional,
  DateField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { MaterialCreatorResDto } from './material-creator.res.dto';

@Exclude()
export class MaterialLogResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'CREATE | UPDATE' })
  action!: string;

  // Free-form audit payload: `{ field: { from, to } }` for UPDATE, initial snapshot for CREATE.
  @Expose()
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  changes!: Record<string, unknown>;

  @Expose()
  @ClassFieldOptional(() => MaterialCreatorResDto, { nullable: true })
  changer!: MaterialCreatorResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;
}
