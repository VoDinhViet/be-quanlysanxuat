import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  DateField,
  NumberField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ItemRefResDto } from '../../items/dto/item-ref.res.dto';
import { WarehouseRefResDto } from '../../warehouses/dto/warehouse-ref.res.dto';

@Exclude()
export class InventoryBalanceResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @ClassField(() => WarehouseRefResDto)
  warehouse!: WarehouseRefResDto;

  @Expose()
  @ClassField(() => ItemRefResDto)
  item!: ItemRefResDto;

  @Expose()
  @NumberField({ description: 'Tồn hiện tại' })
  quantity!: number;

  @Expose()
  @NumberField({
    description:
      'Số lượng giữ chỗ — tính động lúc đọc (phiếu lãnh APPROVED + DO PENDING_APPROVAL/PENDING_DELIVERY), không phải cột inventory_balances.reserved_quantity (cột đó vẫn luôn 0)',
  })
  reservedQuantity!: number;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
