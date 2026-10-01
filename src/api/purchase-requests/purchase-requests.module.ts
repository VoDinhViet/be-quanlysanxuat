import { Module } from '@nestjs/common';

import { InventoryDirectsModule } from '../inventory-directs/inventory-directs.module';
import { PurchaseNotesModule } from '../purchase-notes/purchase-notes.module';
import { PurchaseRequestsController } from './purchase-requests.controller';
import { PurchaseRequestsService } from './purchase-requests.service';

@Module({
  imports: [InventoryDirectsModule, PurchaseNotesModule],
  controllers: [PurchaseRequestsController],
  providers: [PurchaseRequestsService],
  exports: [PurchaseRequestsService],
})
export class PurchaseRequestsModule {}
