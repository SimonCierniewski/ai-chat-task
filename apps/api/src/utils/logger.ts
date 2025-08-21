/**
 * Logger utility for services and non-route code
 * Uses pino logger which is also used by Fastify internally
 */

import pino from 'pino';
import { config } from '../config';

export const logger = pino({
  level: config.logging.level,
  transport: config.logging.pretty
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
          singleLine: false,
          // Show full depth of objects (default is 5)
          depth: 10,
          // Ensure errors are prettified properly
          errorLikeObjectKeys: ['err', 'error'],
          // Show message key at the end
          messageKey: 'msg'
        },
      }
    : undefined,
  // Improve serialization at the pino level
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err
  }
});