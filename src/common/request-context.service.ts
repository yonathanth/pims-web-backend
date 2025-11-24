import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    role: string;
    username: string;
  };
}

@Injectable({ scope: Scope.REQUEST })
export class RequestContextService {
  constructor(@Inject(REQUEST) private request: AuthenticatedRequest) {}

  getCurrentUserId(): number | null {
    return this.request.user?.userId || null;
  }

  getCurrentUser(): { userId: number; role: string; username: string } | null {
    return this.request.user || null;
  }

  isAuthenticated(): boolean {
    return !!this.request.user;
  }
}
