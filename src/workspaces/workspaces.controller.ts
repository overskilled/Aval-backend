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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PublicUser } from '../users/users.service';
import { WorkspacesService } from './workspaces.service';
import {
  AddMemberDto,
  CreateNoteDto,
  CreateWorkspaceDto,
  UpdateMemberDto,
} from './dto/workspace.dto';

@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly svc: WorkspacesService) {}

  @Get()
  list(@CurrentUser() user: PublicUser) {
    return this.svc.listForUser(user.id);
  }

  @Post()
  create(@CurrentUser() user: PublicUser, @Body() dto: CreateWorkspaceDto) {
    return this.svc.create(user.id, dto);
  }

  @Get(':id')
  details(@Param('id') id: string, @CurrentUser() user: PublicUser) {
    return this.svc.getDetails(id, user.id);
  }

  @Post(':id/members')
  addMember(
    @Param('id') id: string,
    @CurrentUser() user: PublicUser,
    @Body() dto: AddMemberDto,
  ) {
    return this.svc.addMember(id, user.id, dto);
  }

  @Patch(':id/members/:memberId')
  updateMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: PublicUser,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.svc.updateMember(id, user.id, memberId, dto);
  }

  @Delete(':id/members/:memberId')
  removeMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: PublicUser,
  ) {
    return this.svc.removeMember(id, user.id, memberId);
  }

  @Get(':id/notes')
  listNotes(@Param('id') id: string, @CurrentUser() user: PublicUser) {
    return this.svc.listNotes(id, user.id);
  }

  @Post(':id/notes')
  createNote(
    @Param('id') id: string,
    @CurrentUser() user: PublicUser,
    @Body() dto: CreateNoteDto,
  ) {
    return this.svc.createNote(id, user.id, dto);
  }

  @Delete(':id/notes/:noteId')
  deleteNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @CurrentUser() user: PublicUser,
  ) {
    return this.svc.deleteNote(id, user.id, noteId);
  }
}
