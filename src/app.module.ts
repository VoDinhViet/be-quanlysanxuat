import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JwtAuthGuard } from './api/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './api/auth/guards/permissions.guard';
import { RolesModule } from './api/roles/roles.module';
import appConfig from './config/app.config';
import authConfig from './api/auth/config/auth.config';
import databaseConfig from './database/config/database.config';
import redisConfig from './redis/redis.config';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './api/auth/auth.module';
import { ClientGroupsModule } from './api/client-groups/client-groups.module';
import { ClientsModule } from './api/clients/clients.module';
import { CountriesModule } from './api/countries/countries.module';
import { DepartmentsModule } from './api/departments/departments.module';
import { HealthModule } from './api/health/health.module';
import { PositionsModule } from './api/positions/positions.module';
import { ProductGroupsModule } from './api/product-groups/product-groups.module';
import { ProductsModule } from './api/products/products.module';
import { SupplierGroupsModule } from './api/supplier-groups/supplier-groups.module';
import { SuppliersModule } from './api/suppliers/suppliers.module';
import { UnitsModule } from './api/units/units.module';
import { UploadsModule } from './api/uploads/uploads.module';
import { UsersModule } from './api/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [appConfig, authConfig, databaseConfig, redisConfig],
      isGlobal: true,
    }),

    DatabaseModule,
    RedisModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    ClientGroupsModule,
    CountriesModule,
    ProductGroupsModule,
    UnitsModule,
    ProductsModule,
    DepartmentsModule,
    PositionsModule,
    UploadsModule,
    SupplierGroupsModule,
    SuppliersModule,
    HealthModule,
    RolesModule,
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
