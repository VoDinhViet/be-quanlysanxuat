import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AllConfigType } from './config/config.type';
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
import { InventoryRequisitionsModule } from './api/inventory-requisitions/inventory-requisitions.module';
import { IqcModule } from './api/iqc/iqc.module';
import { ItemsModule } from './api/items/items.module';
import { OperationsModule } from './api/operations/operations.module';
import { OqcModule } from './api/oqc/oqc.module';
import { OrdersModule } from './api/orders/orders.module';
import { OutboundOrdersModule } from './api/outbound-orders/outbound-orders.module';
import { OutsourcingOrdersModule } from './api/outsourcing-orders/outsourcing-orders.module';
import { OutsourcingReceiptsModule } from './api/outsourcing-receipts/outsourcing-receipts.module';
import { PaymentRequestsModule } from './api/payment-requests/payment-requests.module';
import { PositionsModule } from './api/positions/positions.module';
import { ProductionJobsModule } from './api/production-jobs/production-jobs.module';
import { ProductionOrdersModule } from './api/production-orders/production-orders.module';
import { PurchaseLedgerModule } from './api/purchase-ledger/purchase-ledger.module';
import { PurchaseOrdersModule } from './api/purchase-orders/purchase-orders.module';
import { PurchaseQuotationsModule } from './api/purchase-quotations/purchase-quotations.module';
import { PurchaseRequestsModule } from './api/purchase-requests/purchase-requests.module';
import { QcAqlModule } from './api/qc-aql/qc-aql.module';
import { ReportsModule } from './api/reports/reports.module';
import { RoutingsModule } from './api/routings/routings.module';
import { SupplierReturnsModule } from './api/supplier-returns/supplier-returns.module';
import { UnitsModule } from './api/units/units.module';
import { UsersModule } from './api/users/users.module';
import { WarehousesModule } from './api/warehouses/warehouses.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [appConfig, authConfig, databaseConfig, redisConfig, uploadConfig],
      isGlobal: true,
    }),

    // File bytes served straight off disk at the domain root (storage key IS the path, e.g.
    // `/2026/07/20/<uuid>.png`) — no auth, no signing, permanent public link
    // (`docs/decisions/files-registry.md`). Never collides with a controller route: storage keys
    // are always `<year>/<month>/<day>/<uuid>.<ext>`, nothing under `api`/`health`/`/` looks like
    // that. `index`/`fallthrough` off: express's own miss-handler writes straight to `res` (skips
    // `GlobalExceptionFilter`) and leaked the absolute disk path in its raw `ENOENT` message.
    ServeStaticModule.forRootAsync({
      useFactory: (configService: ConfigService<AllConfigType>) => [
        {
          rootPath: configService.getOrThrow('upload.dir', { infer: true }),
          serveStaticOptions: { index: false, fallthrough: false },
        },
      ],
      inject: [ConfigService],
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
    InventoryRequisitionsModule,
    SupplierReturnsModule,
    OutsourcingOrdersModule,
    OutsourcingReceiptsModule,
    OutboundOrdersModule,
    QcAqlModule,
    IqcModule,
    OqcModule,
    ProductionJobsModule,
    ProductionOrdersModule,
    OrdersModule,
    PurchaseRequestsModule,
    PurchaseLedgerModule,
    PurchaseQuotationsModule,
    PurchaseOrdersModule,
    PaymentRequestsModule,
    ReportsModule,
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
