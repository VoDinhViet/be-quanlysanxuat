import {
  DateFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

// PATCH /iqc/:iqcId — only the 4 contextual inspection-info fields set at confirm time can be
// corrected afterwards (Inspection Level/AQL Level/sampleSize/defectQty drive the PASS/FAIL
// result and stay locked once confirmed). Omitted key = leave unchanged; explicit `null` on the
// 3 text fields clears them. `inspectionDate` stays non-nullable — the column itself is
// NOT NULL, so this only ever changes the date, never clears it, same as ConfirmIqcReqDto.
export class UpdateIqcReqDto {
  @StringFieldOptional({
    maxLength: 100,
    nullable: true,
    description: 'Tiêu chuẩn kiểm — vd VT-0152 Rev.02',
  })
  readonly inspectionStandard?: string | null;

  @StringFieldOptional({
    maxLength: 100,
    nullable: true,
    description: 'Tên người kiểm thực tế',
  })
  readonly inspectorName?: string | null;

  @StringFieldOptional({
    maxLength: 255,
    nullable: true,
    description: 'Dụng cụ đo đã dùng',
  })
  readonly measuringTools?: string | null;

  @DateFieldOptional({ description: 'Thời điểm kiểm thực tế' })
  readonly inspectionDate?: Date;
}
