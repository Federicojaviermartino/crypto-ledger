import { SetMetadata } from '@nestjs/common';

export const RequirePermissions = (...permissions: Array<{ resource: string; action: string }>) =>
  SetMetadata('permissions', permissions);
