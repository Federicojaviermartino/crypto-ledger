export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface TokenPayload {
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
  iat: number;
  exp: number;
}

export interface UserPermissions {
  userId: string;
  roles: Array<{
    id: string;
    name: string;
    entityId?: string;
  }>;
  permissions: Array<{
    resource: string;
    action: string;
    conditions?: any;
  }>;
}

export type SystemRole = 'admin' | 'accountant' | 'auditor' | 'viewer';
