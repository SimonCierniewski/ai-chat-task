import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  validation?: any;
}

export function errorHandler(
  error: FastifyError | ApiError,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const reqId = request.id;
  const statusCode = error.statusCode || 500;
  
  request.log.error({
    req_id: reqId,
    err: error,
    statusCode,
    method: request.method,
    url: request.url,
    userId: (request as any).user?.id,
  }, 'Request error');
  
  if (error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
    reply.status(415).send({
      error: 'Unsupported Media Type',
      message: 'Content-Type must be application/json',
      statusCode: 415,
      req_id: reqId,
    });
    return;
  }
  
  if (error.validation) {
    reply.status(400).send({
      error: 'Validation Error',
      message: 'Request validation failed',
      statusCode: 400,
      validation: error.validation,
      req_id: reqId,
    });
    return;
  }
  
  if (error.message === 'Not allowed by CORS') {
    reply.status(403).send({
      error: 'Forbidden',
      message: 'CORS policy violation: Origin not allowed',
      statusCode: 403,
      req_id: reqId,
    });
    return;
  }
  
  if (statusCode === 401) {
    reply.status(401).send({
      error: 'Unauthorized',
      message: error.message || 'Authentication required',
      statusCode: 401,
      req_id: reqId,
    });
    return;
  }
  
  if (statusCode === 403) {
    reply.status(403).send({
      error: 'Forbidden',
      message: error.message || 'Insufficient permissions',
      statusCode: 403,
      req_id: reqId,
    });
    return;
  }
  
  if (statusCode === 404) {
    reply.status(404).send({
      error: 'Not Found',
      message: error.message || 'Resource not found',
      statusCode: 404,
      req_id: reqId,
    });
    return;
  }
  
  if (statusCode === 429) {
    reply.status(429).send({
      error: 'Too Many Requests',
      message: error.message || 'Rate limit exceeded',
      statusCode: 429,
      req_id: reqId,
    });
    return;
  }
  
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  if (statusCode >= 500) {
    reply.status(statusCode).send({
      error: 'Internal Server Error',
      message: isDevelopment ? error.message : 'An unexpected error occurred',
      statusCode,
      req_id: reqId,
      ...(isDevelopment && { stack: error.stack }),
    });
    return;
  }
  
  reply.status(statusCode).send({
    error: error.name || 'Error',
    message: error.message || 'An error occurred',
    statusCode,
    req_id: reqId,
    ...(isDevelopment && { stack: error.stack }),
  });
}

export function createError(
  message: string,
  statusCode: number = 500,
  code?: string
): ApiError {
  const error: ApiError = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}