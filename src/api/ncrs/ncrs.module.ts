import { Module } from '@nestjs/common';

import { ProductionJobsModule } from '../production-jobs/production-jobs.module';
import { NcrsController } from './ncrs.controller';
import { NcrsService } from './ncrs.service';

@Module({
  imports: [ProductionJobsModule],
  controllers: [NcrsController],
  providers: [NcrsService],
})
export class NcrsModule {}
