import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class TrackJobParamDto {
  @IsString()
  @IsNotEmpty({ message: 'Mã Job hoặc mã đơn hàng không được để trống' })
  @MaxLength(50, { message: 'Mã Job không vượt quá 50 ký tự' })
  code: string;
}

export class ProductionOverviewQueryDto {
  @ApiPropertyOptional({ description: 'Ngày bắt đầu lọc (YYYY-MM-DD)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'startDate phải là định dạng ngày hợp lệ' })
  startDate?: Date;

  @ApiPropertyOptional({ description: 'Ngày kết thúc lọc (YYYY-MM-DD)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'endDate phải là định dạng ngày hợp lệ' })
  endDate?: Date;
}
