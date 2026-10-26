import { Module } from '@nestjs/common';

import { TemplatesModule } from '../../templates/templates.module';
import { PurchaseNotesModule } from '../purchase-notes/purchase-notes.module';
import { PurchaseRequestsController } from './purchase-requests.controller';
import { PurchaseRequestsService } from './purchase-requests.service';

@Module({
  imports: [PurchaseNotesModule, TemplatesModule],
  controllers: [PurchaseRequestsController],
  providers: [PurchaseRequestsService],
  exports: [PurchaseRequestsService],
})
export class PurchaseRequestsModule {}
