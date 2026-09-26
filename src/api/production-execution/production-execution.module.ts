import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { OperationsModule } from '../operations/operations.module';
import { ProductionJobsModule } from '../production-jobs/production-jobs.module';
import { ProductionExecutionController } from './production-execution.controller';
import { ProductionExecutionService } from './production-execution.service';

@Module({
  imports: [AuthModule, FilesModule, OperationsModule, ProductionJobsModule],
  controllers: [ProductionExecutionController],
  providers: [ProductionExecutionService],
})
export class ProductionExecutionModule {}
