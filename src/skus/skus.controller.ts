import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PublicUser } from '../users/users.service';
import { SkusService } from './skus.service';
import { CreateSkuDto, UpdateSkuDto } from './dto/sku.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('manufacturer', 'government', 'admin')
@Controller('skus')
export class SkusController {
  constructor(private readonly svc: SkusService) {}

  @Get()
  list(@CurrentUser() user: PublicUser) {
    return this.svc.listMine(user.id);
  }

  @Post()
  create(@CurrentUser() user: PublicUser, @Body() dto: CreateSkuDto) {
    return this.svc.create(user.id, dto);
  }

  @Get(':id')
  one(@CurrentUser() user: PublicUser, @Param('id') id: string) {
    return this.svc.getOne(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: PublicUser,
    @Param('id') id: string,
    @Body() dto: UpdateSkuDto,
  ) {
    return this.svc.update(user.id, id, dto);
  }

  @Delete(':id')
  withdraw(@CurrentUser() user: PublicUser, @Param('id') id: string) {
    return this.svc.withdraw(user.id, id);
  }
}
