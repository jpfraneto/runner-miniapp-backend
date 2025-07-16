import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.message;
    } else if (exception instanceof TypeError && exception.message.includes('toLowerCase')) {
      // Handle the specific toLowerCase() error
      this.logger.error('TypeError in header processing (toLowerCase):', {
        message: exception.message,
        stack: exception.stack,
        url: request.url,
        method: request.method,
        headers: this.sanitizeHeaders(request.headers),
      });
      
      status = HttpStatus.BAD_REQUEST;
      message = 'Invalid request headers';
    } else {
      this.logger.error('Unhandled exception:', {
        message: exception.message,
        stack: exception.stack,
        url: request.url,
        method: request.method,
      });
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    });
  }

  private sanitizeHeaders(headers: any): any {
    const sanitized = { ...headers };
    
    // Remove sensitive headers from logs
    delete sanitized.authorization;
    delete sanitized.cookie;
    delete sanitized['x-api-key'];
    
    return sanitized;
  }
}