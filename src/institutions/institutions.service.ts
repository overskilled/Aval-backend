import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertInstitutionDto } from './dto/institution.dto';

@Injectable()
export class InstitutionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMine(userId: string) {
    return this.prisma.institution.findUnique({
      where: { ownerId: userId },
      include: { kyc: { include: { documents: true } } },
    });
  }

  async upsertMine(userId: string, dto: UpsertInstitutionDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'manufacturer' && user.role !== 'government') {
      throw new ForbiddenException(
        'Only manufacturer or government accounts can register an institution',
      );
    }
    const existing = await this.prisma.institution.findUnique({
      where: { ownerId: userId },
    });
    if (existing) {
      return this.prisma.institution.update({
        where: { ownerId: userId },
        data: dto,
      });
    }
    return this.prisma.institution.create({
      data: { ownerId: userId, ...dto },
    });
  }

  async listAll() {
    return this.prisma.institution.findMany({
      include: { owner: true, kyc: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
