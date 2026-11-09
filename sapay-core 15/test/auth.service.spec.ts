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

describe('AuthService private beta registration', () => {
  const secret = 'unit-test-secret-that-is-long-enough-123456';
  const inviteCode = 'unit-test-invitation-code-0123456789';
  let service: AuthService;
  let client: { query: jest.Mock };
  let db: { withTransaction: jest.Mock; query: jest.Mock };
  beforeEach(() => {
    process.env.AUTH_TOKEN_SECRET = secret;
    client = { query: jest.fn(async (sql: string) => {
      if (sql.includes('UPDATE beta_invitations SET used_at')) return { rowCount: 1, rows: [{ id: 'invite-1' }] };
      if (sql.includes('INSERT INTO app_users')) return { rowCount: 1, rows: [{ id: 'user-1', email: 'tester@example.com' }] };
      return { rowCount: 1, rows: [] };
    }) };
    db = { withTransaction: jest.fn(async (work: (c: typeof client) => Promise<unknown>) => work(client)), query: jest.fn() };
    service = new AuthService(db as any);
  });
  afterAll(() => { delete process.env.AUTH_TOKEN_SECRET; });

  it('creates an account and consumes the matching invitation in one transaction', async () => {
    const result = await service.register({ email: 'Tester@Example.com', password: 'correct-horse-battery', inviteCode });
    const crypto = require('node:crypto');
    const expectedHash = crypto.createHash('sha256').update(inviteCode).digest('hex');
    expect(db.withTransaction).toHaveBeenCalledTimes(1);
    expect(client.query.mock.calls[0][0]).toContain('used_at IS NULL AND expires_at > now()');
    expect(client.query.mock.calls[0][1]).toEqual([expectedHash]);
    expect(client.query.mock.calls[1][0]).toContain('INSERT INTO app_users');
    expect(client.query.mock.calls[2][0]).toContain('SET used_by=$2');
    expect(result.user).toEqual({ id: 'user-1', email: 'tester@example.com' });
    expect(JSON.stringify(result)).not.toContain(inviteCode);
    expect(JSON.stringify(client.query.mock.calls)).not.toContain(inviteCode);
  });

  it('rejects missing or malformed invitation codes before touching the database', async () => {
    await expect(service.register({ email: 'tester@example.com', password: 'correct-horse-battery', inviteCode: '' })).rejects.toThrow('A valid invitation code is required');
    await expect(service.register({ email: 'tester@example.com', password: 'correct-horse-battery', inviteCode: 'bad code' })).rejects.toThrow('A valid invitation code is required');
    expect(db.withTransaction).not.toHaveBeenCalled();
  });

  it('rejects invalid, expired, or previously used invitations', async () => {
    client.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(service.register({ email: 'tester@example.com', password: 'correct-horse-battery', inviteCode })).rejects.toThrow('Invitation code is invalid, expired, or already used');
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('rolls back invitation consumption when account creation fails', async () => {
    client.query.mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE beta_invitations SET used_at')) return { rowCount: 1, rows: [{ id: 'invite-1' }] };
      if (sql.includes('INSERT INTO app_users')) throw Object.assign(new Error('duplicate'), { code: '23505' });
      return { rowCount: 1, rows: [] };
    });
    await expect(service.register({ email: 'tester@example.com', password: 'correct-horse-battery', inviteCode })).rejects.toThrow('An account with this email already exists');
    expect(db.withTransaction).toHaveBeenCalledTimes(1);
  });
});
