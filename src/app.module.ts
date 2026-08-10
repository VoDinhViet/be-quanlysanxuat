import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BomOperationsModule } from './api/bom-operations/bom-operations.module';
import { BomsModule } from './api/boms/boms.module';
import { JwtAuthGuard } from './api/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './api/auth/guards/permissions.guard';
import { RolesModule } from './api/roles/roles.module';
import { SupplierGroupsModule } from './api/supplier-groups/supplier-groups.module';
import { SuppliersModule } from './api/suppliers/suppliers.module';
import appConfig from './config/app.config';
import uploadConfig from './config/upload.config';
import authConfig from './api/auth/config/auth.config';
import databaseConfig from './database/config/database.config';
import redisConfig from './redis/redis.config';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { StorageModule } from './storage/storage.module';
import { AuthModule } from './api/auth/auth.module';
import { ClientGroupsModule } from './api/client-groups/client-groups.module';
import { ClientsModule } from './api/clients/clients.module';
import { CountriesModule } from './api/countries/countries.module';
import { DepartmentsModule } from './api/departments/departments.module';
import { FilesModule } from './api/files/files.module';
import { HealthModule } from './api/health/health.module';
import { InventoryModule } from './api/inventory/inventory.module';
import { InventoryIssuesModule } from './api/inventory-issues/inventory-issues.module';
import { InventoryReceiptsModule } from './api/inventory-receipts/inventory-receipts.module';
import { ItemsModule } from './api/items/items.module';
import { OperationsModule } from './api/operations/operations.module';
import { OrdersModule } from './api/orders/orders.module';
import { PositionsModule } from './api/positions/positions.module';
import { ProductionJobsModule } from './api/production-jobs/production-jobs.module';
import { ProductionOrdersModule } from './api/production-orders/production-orders.module';
import { PurchaseLedgerModule } from './api/purchase-ledger/purchase-ledger.module';
import { PurchaseRequestsModule } from './api/purchase-requests/purchase-requests.module';
import { RoutingsModule } from './api/routings/routings.module';
import { UnitsModule } from './api/units/units.module';
import { UsersModule } from './api/users/users.module';
import { WarehousesModule } from './api/warehouses/warehouses.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [appConfig, authConfig, databaseConfig, redisConfig, uploadConfig],
      isGlobal: true,
    }),

    // Drives FilesCleanupService. In-memory timers, so this only ticks when the app runs as a
    // long-lived process (`main.ts`'s `instance.listen`), not under the serverless handler export.
    ScheduleModule.forRoot(),

    DatabaseModule,
    RedisModule,
    StorageModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    ClientGroupsModule,
    CountriesModule,
    UnitsModule,
    ItemsModule,
    BomsModule,
    BomOperationsModule,
    OperationsModule,
    RoutingsModule,
    DepartmentsModule,
    FilesModule,
    PositionsModule,
    HealthModule,
    RolesModule,
    SuppliersModule,
    SupplierGroupsModule,
    WarehousesModule,
    InventoryModule,
    InventoryReceiptsModule,
    InventoryIssuesModule,
    ProductionJobsModule,
    ProductionOrdersModule,
    OrdersModule,
    PurchaseRequestsModule,
    PurchaseLedgerModule,
  ],

  controllers: [AppController],
  providers: [
    AppService,
    // Global secure-by-default: every route requires a valid session (JwtAuthGuard) and, when
    // it declares @Permissions(...), the matching permission (PermissionsGuard). @Public() /
    // @ApiPublic() opts a route out. Order matters — auth runs before authorization.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
