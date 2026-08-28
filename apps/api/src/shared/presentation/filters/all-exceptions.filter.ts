import {
  Catch,
  HttpException,
  HttpStatus,
  Inject,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { LOGGER, isApplicationError, type ErrorKind, type Logger } from '@kora/core';
import type { ApiError } from '@kora/contracts';
import { ZodError } from 'zod';

/**
 * Traduce cualquier excepción a la respuesta de error única del sistema.
 *
 * Este es el único lugar del backend que conoce códigos HTTP asociados a
 * errores de negocio. Un caso de uso devuelve `ConflictError`; que eso sea un
 * 409 se decide aquí. Si mañana la API se expone por gRPC o por una cola, se
 * cambia este archivo y nada más.
 */

const STATUS_BY_KIND: Record<ErrorKind, HttpStatus> = {
  validation: HttpStatus.BAD_REQUEST,
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  unauthorized: HttpStatus.UNAUTHORIZED,
  forbidden: HttpStatus.FORBIDDEN,
  unprocessable: HttpStatus.UNPROCESSABLE_ENTITY,
  rate_limited: HttpStatus.TOO_MANY_REQUESTS,
  internal: HttpStatus.INTERNAL_SERVER_ERROR,
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<FastifyReply>();
    const request = http.getRequest<FastifyRequest & { id?: string }>();
    const requestId = typeof request.id === 'string' ? request.id : undefined;

    const { status, body } = this.toErrorResponse(exception, requestId);

    if (status >= 500) {
      this.logger.error('Error no controlado', {
        requestId,
        method: request.method,
        url: request.url,
        error: exception instanceof Error ? exception.stack : String(exception),
      });
    } else {
      this.logger.debug('Petición rechazada', {
        requestId,
        method: request.method,
        url: request.url,
        code: body.code,
      });
    }

    void response.status(status).send(body);
  }

  private toErrorResponse(
    exception: unknown,
    requestId: string | undefined,
  ): { status: number; body: ApiError } {
    if (isApplicationError(exception)) {
      return {
        status: STATUS_BY_KIND[exception.kind],
        body: { ...exception.toJSON(), ...(requestId ? { requestId } : {}) },
      };
    }

    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          code: 'VALIDATION_ERROR',
          kind: 'validation',
          message: 'Los datos enviados no son válidos.',
          details: { issues: formatZodIssues(exception) },
          ...(requestId ? { requestId } : {}),
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      return {
        status,
        body: {
          code: httpStatusToCode(status),
          kind: httpStatusToKind(status),
          message: typeof payload === 'string' ? payload : exception.message,
          ...(requestId ? { requestId } : {}),
        },
      };
    }

    // Cualquier otra cosa es un fallo nuestro: se registra completo pero al
    // cliente solo le llega un mensaje genérico, para no filtrar internals.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        code: 'INTERNAL_ERROR',
        kind: 'internal',
        message: 'Ocurrió un error inesperado. Inténtalo de nuevo.',
        ...(requestId ? { requestId } : {}),
      },
    };
  }
}

/** Aplana los problemas de Zod a `campo → mensajes`, que es lo que el formulario necesita. */
export function formatZodIssues(error: ZodError): Record<string, string[]> {
  const issues: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.join('.') : '_';
    const existing = issues[path];
    if (existing) {
      existing.push(issue.message);
    } else {
      issues[path] = [issue.message];
    }
  }

  return issues;
}

function httpStatusToKind(status: number): ErrorKind {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'validation';
    case HttpStatus.UNAUTHORIZED:
      return 'unauthorized';
    case HttpStatus.FORBIDDEN:
      return 'forbidden';
    case HttpStatus.NOT_FOUND:
      return 'not_found';
    case HttpStatus.CONFLICT:
      return 'conflict';
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return 'unprocessable';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'rate_limited';
    default:
      return 'internal';
  }
}

function httpStatusToCode(status: number): string {
  return `HTTP_${status}`;
}
