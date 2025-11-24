import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info?: any, context?: any, status?: any) {
    if (err || !user) {
      const message =
        info?.message || 'Invalid or missing authentication token';
      throw new UnauthorizedException({ statusCode: 401, message });
    }
    return user;
  }
}
