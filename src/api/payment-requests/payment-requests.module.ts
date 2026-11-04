import { Module } from '@nestjs/common';

import { FilesModule } from '../files/files.module';
import { PaymentRequestsController } from './payment-requests.controller';
import { PaymentRequestsService } from './payment-requests.service';
import { PaymentRequestsSummaryService } from './payment-requests-summary.service';

@Module({
  imports: [FilesModule],
  controllers: [PaymentRequestsController],
  providers: [PaymentRequestsService, PaymentRequestsSummaryService],
  exports: [PaymentRequestsService],
})
export class PaymentRequestsModule {}
