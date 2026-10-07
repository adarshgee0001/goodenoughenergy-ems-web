export interface ClientUser {
  id: string;
  name: string;
  email: string;
  role: 'CLIENT';
  forcePasswordChange: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClientUserCreatePayload {
  name: string;
  email: string;
}

export interface ClientUserCreateResponse {
  user: ClientUser;
  temporaryPassword?: string;
  invitation?: {
    sent: boolean;
    message?: string;
  };
}

export interface ClientUserResetResponse {
  message: string;
  temporaryPassword?: string;
}
