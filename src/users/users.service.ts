import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type PublicUser = Omit<User, 'passwordHash'>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  toPublic(user: User): PublicUser {
    const { passwordHash, ...rest } = user;
    return rest;
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  findAll() {
    return this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  }

  create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({
      data: { ...data, email: data.email.toLowerCase() },
    });
  }

  update(id: string, data: Prisma.UserUpdateInput) {
    return this.prisma.user.update({ where: { id }, data });
  }

  async setRole(id: string, role: UserRole) {
    try {
      return await this.prisma.user.update({ where: { id }, data: { role } });
    } catch {
      throw new NotFoundException('User not found');
    }
  }

  delete(id: string) {
    return this.prisma.user.delete({ where: { id } });
  }
}
