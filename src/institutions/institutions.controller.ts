import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PublicUser } from '../users/users.service';
import { InstitutionsService } from './institutions.service';
import { UpsertInstitutionDto } from './dto/institution.dto';

@UseGuards(JwtAuthGuard)
@Controller('institutions')
export class InstitutionsController {
  constructor(private readonly svc: InstitutionsService) {}

  @Get('me')
  mine(@CurrentUser() user: PublicUser) {
    return this.svc.getMine(user.id);
  }

  @Put('me')
  upsert(@CurrentUser() user: PublicUser, @Body() dto: UpsertInstitutionDto) {
    return this.svc.upsertMine(user.id, dto);
  }
}
