export type UserRole = 'ADMIN' | 'DISTRIBUTOR' | 'CLIENT';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  forcePasswordChange?: boolean;
  clientId?: string;
}

export interface LoginCredentials {
  email: string;
  password?: string;
  rememberMe?: boolean;
}
