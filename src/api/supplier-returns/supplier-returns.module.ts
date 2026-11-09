import { Module } from '@nestjs/common';

import { TemplatesModule } from '../../templates/templates.module';
import { FilesModule } from '../files/files.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SupplierReturnPdfService } from './supplier-return-pdf.service';
import { SupplierReturnsController } from './supplier-returns.controller';
import { SupplierReturnsService } from './supplier-returns.service';
import { SupplierReturnsSummaryService } from './supplier-returns-summary.service';

@Module({
  imports: [InventoryModule, FilesModule, TemplatesModule],
  controllers: [SupplierReturnsController],
  providers: [
    SupplierReturnsService,
    SupplierReturnsSummaryService,
    SupplierReturnPdfService,
  ],
  exports: [SupplierReturnsService],
})
export class SupplierReturnsModule {}
