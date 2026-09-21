import { Module } from '@nestjs/common';

import { PurchaseNotesService } from './purchase-notes.service';

@Module({
  providers: [PurchaseNotesService],
  exports: [PurchaseNotesService],
})
export class PurchaseNotesModule {}
