import { createHmac } from 'node:crypto';
import { AuthService } from '../src/auth/auth.service';

describe('AuthService access tokens', () => {
  const secret = 'unit-test-secret-that-is-long-enough-123456';
  let service: AuthService;
  beforeEach(() => {
    process.env.AUTH_TOKEN_SECRET = secret;
    service = new AuthService({} as any);
  });
  afterAll(() => { delete process.env.AUTH_TOKEN_SECRET; });

  function token(payload: Record<string, unknown>, header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' }) {
    const data = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
    return `${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`;
  }

  it('accepts a valid token with the expected issuer and audience', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(service.verifyToken(token({ sub: 'user-1', iss: 'sapay-api', aud: 'sapay-client', iat: now, exp: now + 900 }))).toEqual({ userId: 'user-1' });
  });

  it.each([
    ['wrong issuer', { iss: 'other-api', aud: 'sapay-client' }],
    ['wrong audience', { iss: 'sapay-api', aud: 'other-client' }],
    ['missing issuer', { aud: 'sapay-client' }],
    ['missing audience', { iss: 'sapay-api' }],
  ])('rejects a token with %s', (_label, claims) => {
    const now = Math.floor(Date.now() / 1000);
    expect(() => service.verifyToken(token({ sub: 'user-1', ...claims, iat: now, exp: now + 900 }))).toThrow('Invalid or expired access token');
  });

  it('rejects tokens with an excessive lifetime or future issue time', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(() => service.verifyToken(token({ sub: 'user-1', iss: 'sapay-api', aud: 'sapay-client', iat: now, exp: now + 901 }))).toThrow();
    expect(() => service.verifyToken(token({ sub: 'user-1', iss: 'sapay-api', aud: 'sapay-client', iat: now + 120, exp: now + 900 }))).toThrow();
  });

  it('rejects a non-JWT header even with a valid signature', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(() => service.verifyToken(token({ sub: 'user-1', iss: 'sapay-api', aud: 'sapay-client', iat: now, exp: now + 900 }, { alg: 'HS256', typ: 'NOT-JWT' }))).toThrow();
  });
});
