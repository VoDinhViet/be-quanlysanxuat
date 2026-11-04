import { Module } from '@nestjs/common';

import { TemplatesModule } from '../../templates/templates.module';
import { PurchaseNotesModule } from '../purchase-notes/purchase-notes.module';
import { PurchaseRequestsController } from './purchase-requests.controller';
import { PurchaseRequestsService } from './purchase-requests.service';
import { PurchaseRequestsSummaryService } from './purchase-requests-summary.service';

@Module({
  imports: [PurchaseNotesModule, TemplatesModule],
  controllers: [PurchaseRequestsController],
  providers: [PurchaseRequestsService, PurchaseRequestsSummaryService],
  exports: [PurchaseRequestsService],
})
export class PurchaseRequestsModule {}
