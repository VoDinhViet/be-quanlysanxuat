import {
  EnumField,
  StringField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';
import {
  DOCUMENT_CODE_PATTERN,
  LimitReqDto,
  STATUS_FIELD_OPTIONS,
} from './integration-common.dto';

export enum TraceItemView {
  SUPPLY = 'supply',
  STRUCTURE = 'structure',
}

const DOCUMENT_CODE_FIELD_OPTIONS = {
  pattern: DOCUMENT_CODE_PATTERN,
  patternMessage: 'Mã chỉ gồm chữ, số, . _ / -',
  maxLength: 40,
};

export class TraceOrderReqDto extends LimitReqDto {
  @StringFieldOptional({
    ...DOCUMENT_CODE_FIELD_OPTIONS,
    description:
      'Có mã đơn thì truy vết từng bước của đơn đó; bỏ trống thì tiến độ các đơn đang chạy',
  })
  readonly orderCode?: string;

  @StringFieldOptional({
    ...STATUS_FIELD_OPTIONS,
    description:
      'Chỉ khi bỏ trống orderCode: lọc theo trạng thái đơn, mặc định AWAITING_PRODUCTION và IN_PROGRESS',
  })
  readonly status?: string;
}

export class TracePurchaseReqDto {
  @StringField({
    ...DOCUMENT_CODE_FIELD_OPTIONS,
    description:
      'Mã đề nghị mua, đơn mua, phiếu nhập, phiếu kiểm IQC, phiếu trả nhà cung cấp hoặc đề nghị thanh toán',
  })
  readonly code!: string;
}

export class TraceSupplierReqDto {
  @StringField({
    maxLength: 80,
    description: 'Mã hoặc một phần tên nhà cung cấp',
  })
  readonly supplier!: string;
}

export class TraceItemReqDto {
  @StringField({
    ...DOCUMENT_CODE_FIELD_OPTIONS,
    description: 'Mã vật tư hoặc sản phẩm',
  })
  readonly itemCode!: string;

  @EnumField(() => TraceItemView, {
    description:
      'supply: vật tư dùng ở đâu và nguồn cung; structure: cây BOM và công đoạn của sản phẩm',
  })
  readonly view!: TraceItemView;
}
