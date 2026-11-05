import { RateLimitMiddleware } from '../src/security/rate-limit.middleware';

describe('RateLimitMiddleware', () => {
  const middleware = new RateLimitMiddleware();
  let sequence = 0;
  function request(path: string, ip = `198.51.100.${++sequence}`) {
    const req = { originalUrl: path, ip, socket: { remoteAddress: ip } } as any;
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (key: string, value: string) => { headers[key] = value; },
      statusCode: 200,
      status(code: number) { this.statusCode = code; return this; },
      json: jest.fn(),
    } as any;
    const next = jest.fn();
    return { req, res, next, headers };
  }

  it('allows five auth requests per IP and blocks the sixth with Retry-After', () => {
    const ip = `203.0.113.${++sequence}`;
    for (let i = 0; i < 5; i++) {
      const call = request('/api/auth/login', ip);
      middleware.use(call.req, call.res, call.next);
      expect(call.next).toHaveBeenCalledTimes(1);
    }
    const blocked = request('/api/auth/login', ip);
    middleware.use(blocked.req, blocked.res, blocked.next);
    expect(blocked.res.statusCode).toBe(429);
    expect(blocked.headers['Retry-After']).toBeDefined();
    expect(blocked.next).not.toHaveBeenCalled();
  });

  it('shares the general API bucket across endpoints for the same IP', () => {
    const ip = `203.0.113.${++sequence}`;
    for (let i = 0; i < 120; i++) {
      const call = request(`/api/wallets?page=${i}`, ip);
      middleware.use(call.req, call.res, call.next);
      expect(call.next).toHaveBeenCalledTimes(1);
    }
    const blocked = request('/api/transfers', ip);
    middleware.use(blocked.req, blocked.res, blocked.next);
    expect(blocked.res.statusCode).toBe(429);
  });
});
