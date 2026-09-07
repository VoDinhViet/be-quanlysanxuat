import {
  FulfillmentType,
  OutboundOrderStatus,
} from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class ExportOutboundOrdersReqDto {
  @StringFieldOptional()
  readonly q?: string;

  @UUIDFieldOptional()
  readonly clientId?: string;

  @EnumFieldOptional(() => OutboundOrderStatus)
  readonly status?: OutboundOrderStatus;

  @EnumFieldOptional(() => FulfillmentType)
  readonly fulfillmentType?: FulfillmentType;

  @DateFieldOptional({ description: 'Filter: fulfillmentDate >= startDate' })
  readonly startDate?: Date;

  @DateFieldOptional({ description: 'Filter: fulfillmentDate <= endDate' })
  readonly endDate?: Date;
}
