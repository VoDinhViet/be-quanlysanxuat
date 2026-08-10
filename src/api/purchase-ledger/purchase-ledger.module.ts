import { Module } from '@nestjs/common';

import { PurchaseLedgerController } from './purchase-ledger.controller';
import { PurchaseLedgerService } from './purchase-ledger.service';

@Module({
  controllers: [PurchaseLedgerController],
  providers: [PurchaseLedgerService],
})
export class PurchaseLedgerModule {}
