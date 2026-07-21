import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ProductRevisionsController } from './product-revisions.controller';
import { ProductRevisionsService } from './product-revisions.service';

@Module({
  imports: [AuthModule],
  controllers: [ProductRevisionsController],
  providers: [ProductRevisionsService],
  exports: [ProductRevisionsService],
})
export class ProductRevisionsModule {}
