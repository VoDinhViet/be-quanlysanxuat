import { Exclude, Expose } from 'class-transformer';

import { NumberField } from '../../../decorators/field.decorators';

@Exclude()
export class IqcStatsResDto {
  @Expose()
  @NumberField({ int: true, description: 'Tổng số phiếu IQC' })
  total!: number;

  @Expose()
  @NumberField({ int: true, description: 'Chưa kiểm' })
  notInspected!: number;

  @Expose()
  @NumberField({ int: true, description: 'Số phiếu PASS' })
  pass!: number;

  @Expose()
  @NumberField({ int: true, description: 'Số phiếu FAIL' })
  fail!: number;

  @Expose()
  @NumberField({ int: true, description: 'Chờ xử lý' })
  pending!: number;

  @Expose()
  @NumberField({ int: true, description: 'Chờ trả NCC' })
  waitingReturn!: number;

  @Expose()
  @NumberField({ int: true, description: 'Hoàn thành' })
  completed!: number;
}
