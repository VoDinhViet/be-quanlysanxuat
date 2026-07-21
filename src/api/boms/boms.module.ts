import { Module } from '@nestjs/common';

import { BomsController } from './boms.controller';
import { BomsService } from './boms.service';

// Standalone, read-only module — no AuthModule/ProductsModule/ProductRevisionsModule import,
// mirroring UnitsModule. Queries products/productRevisions/boms/bomItems directly via DRIZZLE.
@Module({
  controllers: [BomsController],
  providers: [BomsService],
  exports: [BomsService],
})
export class BomsModule {}
