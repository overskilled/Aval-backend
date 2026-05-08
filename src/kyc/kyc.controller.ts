import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PublicUser } from '../users/users.service';
import { KycService } from './kyc.service';
import { SubmitKycDto } from './dto/kyc.dto';

@UseGuards(JwtAuthGuard)
@Controller('kyc')
export class KycController {
  constructor(private readonly svc: KycService) {}

  @Get('me')
  mine(@CurrentUser() user: PublicUser) {
    return this.svc.getMine(user.id);
  }

  @Post()
  submit(@CurrentUser() user: PublicUser, @Body() dto: SubmitKycDto) {
    return this.svc.submit(user.id, dto);
  }
}
