import {
  ClassField,
  DateField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';
import { ImportInventoryDirectRowReqDto } from './import-inventory-direct-row.req.dto';

export class ImportInventoryDirectReqDto {
  @ClassField(() => ImportInventoryDirectRowReqDto, { each: true, minItems: 1 })
  readonly rows!: ImportInventoryDirectRowReqDto[];

  @DateField({ description: 'Ngày chứng từ của phiếu điều chỉnh' })
  readonly adjustmentDate!: Date;

  @StringFieldOptional({ maxLength: 1000, nullable: true })
  readonly note?: string | null;
}
