import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ProductOperationsController } from './product-operations.controller';
import { ProductOperationsService } from './product-operations.service';

@Module({
  imports: [AuthModule],
  controllers: [ProductOperationsController],
  providers: [ProductOperationsService],
  exports: [ProductOperationsService],
})
export class ProductOperationsModule {}
