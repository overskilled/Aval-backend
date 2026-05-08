import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { UsersModule } from '../users/users.module';
import { KycModule } from '../kyc/kyc.module';
import { InstitutionsModule } from '../institutions/institutions.module';
import { SkusModule } from '../skus/skus.module';
import { BatchesModule } from '../batches/batches.module';
import { CodesModule } from '../codes/codes.module';
import { AdminTokenGuard } from '../auth/guards/admin-token.guard';

@Module({
  imports: [UsersModule, KycModule, InstitutionsModule, SkusModule, BatchesModule, CodesModule],
  controllers: [AdminController],
  providers: [AdminTokenGuard],
})
export class AdminModule {}
