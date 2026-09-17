import { DateFieldOptional } from '../../../decorators/field.decorators';

// PATCH /iqc/:iqcId — only lets the QC correct the inspection date after confirm (`result` drives
// the PASS/FAIL outcome and stays locked once confirmed). The column itself is NOT NULL, so this
// only ever changes the date, never clears it, same as ConfirmIqcReqDto.
export class UpdateIqcReqDto {
  @DateFieldOptional({ description: 'Thời điểm kiểm thực tế' })
  readonly inspectionDate?: Date;
}
