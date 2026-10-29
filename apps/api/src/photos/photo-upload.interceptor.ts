import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { catchError, type Observable, throwError } from 'rxjs';

import { photoTooLarge } from '../common/errors/problem-types.js';
import { RequestValidationException } from '../common/errors/validation.js';

/**
 * Wraps the multer interceptor (declare it first, so it is outermost): maps multer's limit errors to
 * problem details. Nest turns LIMIT_FILE_SIZE into 413 and every other multer error into 400.
 */
@Injectable()
export class PhotoUploadErrorInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((err: unknown) => {
        if (err instanceof PayloadTooLargeException) return throwError(() => photoTooLarge());
        if (err instanceof BadRequestException && !(err instanceof RequestValidationException)) {
          return throwError(
            () =>
              new RequestValidationException([
                { path: 'file', message: 'Send exactly one file in a part named "file"' },
              ]),
          );
        }
        return throwError(() => err);
      }),
    );
  }
}
