import { Module } from '@nestjs/common';

import { TemplatesModule } from '../../templates/templates.module';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { IqcModule } from '../iqc/iqc.module';
import { PaymentRequestsModule } from '../payment-requests/payment-requests.module';
import { PurchaseNotesModule } from '../purchase-notes/purchase-notes.module';
import { InventoryReceiptsController } from './inventory-receipts.controller';
import { InventoryReceiptsService } from './inventory-receipts.service';

@Module({
  imports: [
    AuthModule,
    InventoryModule,
    IqcModule,
    PaymentRequestsModule,
    PurchaseNotesModule,
    TemplatesModule,
  ],
  controllers: [InventoryReceiptsController],
  providers: [InventoryReceiptsService],
})
export class InventoryReceiptsModule {}
