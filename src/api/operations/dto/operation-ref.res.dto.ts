import { Exclude, Expose } from 'class-transformer';

import { OperationType } from '../../../database/schemas';
import {
  EnumField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

/**
 * Lightweight reference to an operation, for nesting inside a routing step
 * (`routing_steps` — see `RoutingStepResDto`) or any other entity that points at an
 * operation by id.
 */
@Exclude()
export class OperationRefResDto {
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
  @EnumField(() => OperationType)
  type!: OperationType;
}
