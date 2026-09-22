import { Module } from '@nestjs/common';

import { TemplatesModule } from '../../templates/templates.module';
import { PurchaseNotesModule } from '../purchase-notes/purchase-notes.module';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';

@Module({
  imports: [PurchaseNotesModule, TemplatesModule],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
