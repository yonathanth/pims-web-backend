import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly requestCache = new Map<
    string,
    { response: any; timestamp: number }
  >();
  private readonly CACHE_TTL = 60000; // 60 seconds

  constructor() {
    // Clean up old cache entries every minute
    setInterval(() => this.cleanupCache(), 60000);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, user } = request;

    // Only apply to POST/PUT/PATCH requests
    if (!['POST', 'PUT', 'PATCH'].includes(method)) {
      return next.handle();
    }

    // Skip for certain endpoints that should allow duplicates
    const skipPaths = ['/auth/login', '/auth/logout'];
    if (skipPaths.some((path) => url.includes(path))) {
      return next.handle();
    }

    // Generate idempotency key from request
    const idempotencyKey =
      request.headers['idempotency-key'] ||
      this.generateKey(method, url, body, user?.userId);

    // Check cache
    const cached = this.requestCache.get(idempotencyKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      throw new HttpException(
        {
          message: 'Duplicate request detected. Please wait before retrying.',
          code: 'DUPLICATE_REQUEST',
        },
        HttpStatus.CONFLICT,
      );
    }

    return next.handle().pipe(
      tap((response) => {
        // Cache successful response
        this.requestCache.set(idempotencyKey, {
          response,
          timestamp: Date.now(),
        });
      }),
      catchError((error) => {
        // Don't cache errors, allow retry
        throw error;
      }),
    );
  }

  private generateKey(
    method: string,
    url: string,
    body: any,
    userId?: number,
  ): string {
    // Normalize URL (remove query params for idempotency)
    const normalizedUrl = url.split('?')[0];
    const bodyHash = JSON.stringify(body || {});
    return `${method}:${normalizedUrl}:${userId || 'anonymous'}:${this.hashString(bodyHash)}`;
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private cleanupCache() {
    const now = Date.now();
    for (const [key, value] of this.requestCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.requestCache.delete(key);
      }
    }
  }
}







