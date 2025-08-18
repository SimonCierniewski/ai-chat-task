import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

export interface CorsOptions {
  adminOrigin?: string;
  androidDevOrigin?: string;
}

const corsPlugin: FastifyPluginAsync<CorsOptions> = async (fastify, options) => {
  const adminOrigin = options.adminOrigin || process.env.APP_ORIGIN_ADMIN;
  const androidDevOrigin = options.androidDevOrigin || process.env.APP_ORIGIN_ANDROID_DEV;

  const allowedOrigins = new Set<string>();
  
  if (adminOrigin) {
    allowedOrigins.add(adminOrigin);
  }
  
  if (androidDevOrigin) {
    allowedOrigins.add(androidDevOrigin);
  }

  fastify.log.info({ allowedOrigins: Array.from(allowedOrigins) }, 'CORS: Configured allowed origins');

  fastify.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    
    if (origin && allowedOrigins.has(origin)) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Credentials', 'true');
      reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      reply.header('Access-Control-Max-Age', '86400');
    }

    if (request.method === 'OPTIONS') {
      if (origin && !allowedOrigins.has(origin)) {
        fastify.log.warn({ origin }, 'CORS: Preflight request from unauthorized origin');
        reply.status(403).send({ error: 'CORS: Origin not allowed' });
        return;
      }
      
      reply.status(204).send();
    }
  });

  fastify.addHook('onSend', async (request, reply, payload) => {
    const origin = request.headers.origin;
    
    if (origin && !allowedOrigins.has(origin) && request.method !== 'OPTIONS') {
      fastify.log.warn({ 
        origin, 
        method: request.method, 
        url: request.url 
      }, 'CORS: Request from unauthorized origin');
    }
    
    return payload;
  });
};

export default fp(corsPlugin, {
  name: 'cors',
  fastify: '4.x',
});