import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<
      Array<{ resource: string; action: string }>
    >('permissions', [context.getHandler(), context.getClass()]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Check user permissions
    const userWithPermissions = await this.prisma.user.findUnique({
      where: { id: user.userId },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!userWithPermissions) {
      throw new ForbiddenException('User not found');
    }

    // Extract permissions from roles
    const userPermissions = new Set<string>();
    for (const userRole of userWithPermissions.roles) {
      const rolePermissions = userRole.role.permissions as any[];
      if (rolePermissions) {
        rolePermissions.forEach((p: any) => {
          userPermissions.add(`${p.resource}:${p.action}`);
        });
      }
    }

    // Check each required permission
    for (const permission of requiredPermissions) {
      const permissionKey = `${permission.resource}:${permission.action}`;
      if (!userPermissions.has(permissionKey)) {
        throw new ForbiddenException(
          `Missing permission: ${permissionKey}`
        );
      }
    }

    return true;
  }
}
