import type { IncomingMessage } from 'node:http';

/** CORS alone does not protect WebSocket handshakes. */
export function allowedSocketOrigin(req: Pick<IncomingMessage, 'headers'>, configuredOrigin?: string): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // Native clients and same-origin polling may omit Origin.
  try {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) return false;
    if (configuredOrigin) return origin === new URL(configuredOrigin).origin;
    return parsed.host === req.headers.host;
  } catch {
    return false;
  }
}
