import { Module } from '@nestjs/common';

import { TemplatesModule } from '../../templates/templates.module';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { InventoryModule } from '../inventory/inventory.module';
import { InventoryIssuesController } from './inventory-issues.controller';
import { InventoryIssuesService } from './inventory-issues.service';

@Module({
  imports: [AuthModule, InventoryModule, FilesModule, TemplatesModule],
  controllers: [InventoryIssuesController],
  providers: [InventoryIssuesService],
})
export class InventoryIssuesModule {}
