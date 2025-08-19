/**
 * HTTP Agents for connection pooling and keep-alive
 */

import https from 'https';
import http from 'http';

// ============================================================================
// HTTP Agents
// ============================================================================

/**
 * HTTPS agent with keep-alive for OpenAI API
 */
export const httpsKeepAliveAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000, // 60 seconds
  scheduling: 'lifo' // Last-in-first-out for better connection reuse
});

/**
 * HTTP agent with keep-alive for local services
 */
export const httpKeepAliveAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
  scheduling: 'lifo'
});

/**
 * Get appropriate agent based on URL
 */
export function getAgent(url: string): https.Agent | http.Agent | undefined {
  if (url.startsWith('https://')) {
    return httpsKeepAliveAgent;
  } else if (url.startsWith('http://')) {
    return httpKeepAliveAgent;
  }
  return undefined;
}