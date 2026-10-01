import { ClassField } from '../../../decorators/field.decorators';
import { CreateProductionJobIssueReqDto } from './create-production-job-issue.req.dto';

export class CreateProductionJobIssuesReqDto {
  @ClassField(() => CreateProductionJobIssueReqDto, {
    each: true,
    minItems: 1,
    description: 'Vật tư thêm vào Job — tối thiểu 1 dòng, không trùng itemId',
  })
  readonly items!: CreateProductionJobIssueReqDto[];
}
