import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkspaceMemberRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import {
  AddMemberDto,
  CreateNoteDto,
  CreateWorkspaceDto,
  UpdateMemberDto,
} from './dto/workspace.dto';

function slugify(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'workspace'
  );
}

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async assertMember(workspaceId: string, userId: string) {
    const m = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!m) throw new ForbiddenException('Not a member of this workspace');
    return m;
  }

  async assertOwner(workspaceId: string, userId: string) {
    const m = await this.assertMember(workspaceId, userId);
    if (m.role !== 'owner') {
      throw new ForbiddenException('Only the workspace owner can do this');
    }
    return m;
  }

  async listForUser(userId: string) {
    return this.prisma.workspace.findMany({
      where: { members: { some: { userId } } },
      include: {
        _count: { select: { members: true, notes: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async create(userId: string, dto: CreateWorkspaceDto) {
    const baseSlug = slugify(dto.name);
    let slug = baseSlug;
    for (let i = 1; await this.prisma.workspace.findUnique({ where: { slug } }); i++) {
      slug = `${baseSlug}-${i}`;
      if (i > 50) throw new BadRequestException('Could not generate unique slug');
    }
    return this.prisma.workspace.create({
      data: {
        name: dto.name,
        description: dto.description,
        slug,
        ownerId: userId,
        members: {
          create: { userId, role: 'owner' },
        },
      },
      include: {
        members: { include: { user: true } },
      },
    });
  }

  async getDetails(workspaceId: string, userId: string) {
    await this.assertMember(workspaceId, userId);
    return this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: { include: { user: true } },
        notes: {
          include: { author: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });
  }

  async addMember(workspaceId: string, actorId: string, dto: AddMemberDto) {
    await this.assertOwner(workspaceId, actorId);
    const target = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!target) {
      throw new NotFoundException('No user with that email — invite by signup link first');
    }
    const role = dto.role ?? 'editor';
    const existing = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: target.id } },
    });
    if (existing) throw new BadRequestException('User is already a member');

    const member = await this.prisma.workspaceMember.create({
      data: { workspaceId, userId: target.id, role },
      include: { user: true, workspace: true },
    });

    const origin = this.config
      .get<string>('CORS_ORIGIN', 'http://localhost:5173')
      .split(',')[0];
    this.mail
      .sendWorkspaceInvite(
        target.email,
        target.fullName,
        member.workspace.name,
        `${origin}/dashboard/workspace/${workspaceId}`,
      )
      .catch(() => undefined);

    return member;
  }

  async updateMember(
    workspaceId: string,
    actorId: string,
    memberId: string,
    dto: UpdateMemberDto,
  ) {
    await this.assertOwner(workspaceId, actorId);
    const member = await this.prisma.workspaceMember.findUnique({
      where: { id: memberId },
    });
    if (!member || member.workspaceId !== workspaceId) {
      throw new NotFoundException('Member not found');
    }
    if (member.role === 'owner' && dto.role !== 'owner') {
      throw new BadRequestException('Cannot demote the workspace owner');
    }
    return this.prisma.workspaceMember.update({
      where: { id: memberId },
      data: { role: dto.role },
      include: { user: true },
    });
  }

  async removeMember(workspaceId: string, actorId: string, memberId: string) {
    await this.assertOwner(workspaceId, actorId);
    const member = await this.prisma.workspaceMember.findUnique({
      where: { id: memberId },
    });
    if (!member || member.workspaceId !== workspaceId) {
      throw new NotFoundException('Member not found');
    }
    if (member.role === 'owner') {
      throw new BadRequestException('Cannot remove the workspace owner');
    }
    await this.prisma.workspaceMember.delete({ where: { id: memberId } });
    return { ok: true };
  }

  async listNotes(workspaceId: string, userId: string) {
    await this.assertMember(workspaceId, userId);
    return this.prisma.workspaceNote.findMany({
      where: { workspaceId },
      include: { author: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createNote(workspaceId: string, userId: string, dto: CreateNoteDto) {
    const m = await this.assertMember(workspaceId, userId);
    if (m.role === 'viewer') {
      throw new ForbiddenException('Viewers cannot post notes');
    }
    return this.prisma.workspaceNote.create({
      data: {
        workspaceId,
        authorId: userId,
        title: dto.title,
        body: dto.body,
      },
      include: { author: true },
    });
  }

  async deleteNote(workspaceId: string, userId: string, noteId: string) {
    await this.assertMember(workspaceId, userId);
    const note = await this.prisma.workspaceNote.findUnique({
      where: { id: noteId },
    });
    if (!note || note.workspaceId !== workspaceId) {
      throw new NotFoundException('Note not found');
    }
    if (note.authorId !== userId) {
      // Only owners can delete other people's notes
      const m = await this.assertMember(workspaceId, userId);
      if (m.role !== 'owner') {
        throw new ForbiddenException('You can only delete your own notes');
      }
    }
    await this.prisma.workspaceNote.delete({ where: { id: noteId } });
    return { ok: true };
  }
}
