import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RbacService {
  constructor(private prisma: PrismaService) {}

  async createRole(data: {
    name: string;
    description?: string;
    permissions: Array<{ resource: string; action: string }>;
  }) {
    const role = await this.prisma.role.create({
      data: {
        name: data.name,
        description: data.description,
        isSystem: false,
      },
    });

    // Assign permissions
    for (const perm of data.permissions) {
      const permission = await this.ensurePermission(perm.resource, perm.action);

      await this.prisma.rolePermission.create({
        data: {
          roleId: role.id,
          permissionId: permission.id,
        },
      });
    }

    return role;
  }

  async assignRole(userId: string, roleId: string, entityId?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return this.prisma.userRole.create({
      data: {
        userId,
        roleId,
        entityId,
      },
    });
  }

  async revokeRole(userId: string, roleId: string) {
    return this.prisma.userRole.deleteMany({
      where: {
        userId,
        roleId,
      },
    });
  }

  async listRoles() {
    return this.prisma.role.findMany({
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        _count: {
          select: {
            users: true,
          },
        },
      },
    });
  }

  async listPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
  }

  async initializeDefaultRoles() {
    // Admin role
    const adminPerms = [{ resource: '*', action: '*' }]; // Wildcard: all permissions
    await this.createRoleIfNotExists(
      'admin',
      'Full system access',
      adminPerms,
      true
    );

    // Accountant role
    const accountantPerms = [
      { resource: 'entries', action: 'create' },
      { resource: 'entries', action: 'read' },
      { resource: 'entries', action: 'update' },
      { resource: 'accounts', action: 'create' },
      { resource: 'accounts', action: 'read' },
      { resource: 'accounts', action: 'update' },
      { resource: 'reports', action: 'read' },
      { resource: 'reconciliation', action: 'create' },
      { resource: 'reconciliation', action: 'read' },
      { resource: 'invoices', action: 'create' },
      { resource: 'invoices', action: 'read' },
    ];
    await this.createRoleIfNotExists(
      'accountant',
      'Create and manage entries',
      accountantPerms,
      true
    );

    // Auditor role
    const auditorPerms = [
      { resource: 'entries', action: 'read' },
      { resource: 'accounts', action: 'read' },
      { resource: 'reports', action: 'read' },
      { resource: 'audit', action: 'read' },
      { resource: 'reconciliation', action: 'read' },
    ];
    await this.createRoleIfNotExists(
      'auditor',
      'Read-only audit access',
      auditorPerms,
      true
    );

    // Viewer role
    const viewerPerms = [{ resource: 'reports', action: 'read' }];
    await this.createRoleIfNotExists('viewer', 'View reports only', viewerPerms, true);
  }

  private async createRoleIfNotExists(
    name: string,
    description: string,
    permissions: Array<{ resource: string; action: string }>,
    isSystem: boolean
  ) {
    let role = await this.prisma.role.findUnique({ where: { name } });

    if (!role) {
      role = await this.prisma.role.create({
        data: { name, description, isSystem },
      });

      for (const perm of permissions) {
        const permission = await this.ensurePermission(perm.resource, perm.action);

        await this.prisma.rolePermission.create({
          data: {
            roleId: role.id,
            permissionId: permission.id,
          },
        });
      }
    }

    return role;
  }

  private async ensurePermission(resource: string, action: string) {
    let permission = await this.prisma.permission.findUnique({
      where: {
        resource_action: {
          resource,
          action,
        },
      },
    });

    if (!permission) {
      permission = await this.prisma.permission.create({
        data: {
          resource,
          action,
          description: `${action} ${resource}`,
        },
      });
    }

    return permission;
  }
}
