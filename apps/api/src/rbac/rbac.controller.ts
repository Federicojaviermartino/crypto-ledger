import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@Controller('rbac')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('roles')
  @RequirePermissions({ resource: 'roles', action: 'read' })
  async listRoles() {
    return this.rbacService.listRoles();
  }

  @Post('roles')
  @RequirePermissions({ resource: 'roles', action: 'create' })
  async createRole(@Body() data: any) {
    return this.rbacService.createRole(data);
  }

  @Post('users/:userId/roles/:roleId')
  @RequirePermissions({ resource: 'roles', action: 'assign' })
  async assignRole(
    @Param('userId') userId: string,
    @Param('roleId') roleId: string,
    @Body() body: { entityId?: string },
  ) {
    return this.rbacService.assignRole(userId, roleId, body.entityId);
  }

  @Delete('users/:userId/roles/:roleId')
  @RequirePermissions({ resource: 'roles', action: 'revoke' })
  async revokeRole(
    @Param('userId') userId: string,
    @Param('roleId') roleId: string,
  ) {
    return this.rbacService.revokeRole(userId, roleId);
  }

  @Get('permissions')
  @RequirePermissions({ resource: 'permissions', action: 'read' })
  async listPermissions() {
    return this.rbacService.listPermissions();
  }

  @Post('initialize')
  @RequirePermissions({ resource: 'roles', action: 'create' })
  async initializeDefaults() {
    await this.rbacService.initializeDefaultRoles();
    return { message: 'Default roles initialized' };
  }
}
