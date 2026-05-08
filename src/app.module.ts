import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './mail/mail.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { InstitutionsModule } from './institutions/institutions.module';
import { KycModule } from './kyc/kyc.module';
import { SkusModule } from './skus/skus.module';
import { BatchesModule } from './batches/batches.module';
import { CodesModule } from './codes/codes.module';
import { VerifyModule } from './verify/verify.module';
import { AdminModule } from './admin/admin.module';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { ContactModule } from './contact/contact.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // SEC-02 — global rate limit baseline. Tighter limits applied per-endpoint
    // via @Throttle on auth + code-generation routes.
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },        // 10 req / sec
      { name: 'medium', ttl: 60_000, limit: 120 },    // 120 req / min
      { name: 'long', ttl: 60 * 60_000, limit: 1500 }, // 1500 req / hour
    ]),
    PrismaModule,
    MailModule,
    UsersModule,
    AuthModule,
    WorkspacesModule,
    InstitutionsModule,
    KycModule,
    SkusModule,
    BatchesModule,
    CodesModule,
    VerifyModule,
    AdminModule,
    BootstrapModule,
    ContactModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
