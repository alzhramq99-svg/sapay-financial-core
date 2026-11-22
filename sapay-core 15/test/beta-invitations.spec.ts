import { AuthService } from '../src/auth/auth.service';

describe('Invitation-only registration', () => {
  const rejection = 'Invitation code is invalid, expired, or already used';
  beforeAll(() => { process.env.AUTH_TOKEN_SECRET = 'unit-test-secret-that-is-long-enough-123456'; });
  afterAll(() => { delete process.env.AUTH_TOKEN_SECRET; });

  it.each([undefined, '', 'bad', 'a'.repeat(32)])('rejects missing or invalid/unrecognized invitation %s without inserting a user', async (inviteCode) => {
    const query = jest.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    const withTransaction = jest.fn(async (work: (client: any) => Promise<any>) => work({ query }));
    const service = new AuthService({ withTransaction, query: jest.fn() } as any);
    await expect(service.register({ email: 'new@example.test', password: 'long-enough-password', inviteCode } as any))
      .rejects.toThrow(rejection);
    expect(query.mock.calls.some(([sql]) => /INSERT INTO app_users/i.test(sql))).toBe(false);
  });

  it('claims a valid invitation and creates the user in one transaction', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'invite-id' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'user-id', email: 'new@example.test' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const withTransaction = jest.fn(async (work: (client: any) => Promise<any>) => work({ query }));
    const service = new AuthService({ withTransaction, query: jest.fn() } as any);
    const result = await service.register({ email: 'new@example.test', password: 'long-enough-password', inviteCode: 'a'.repeat(32) } as any);
    expect(result.user).toEqual({ id: 'user-id', email: 'new@example.test' });
    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.map(([sql]) => String(sql))).toEqual([
      expect.stringMatching(/UPDATE beta_invitations.*used_at/is),
      expect.stringMatching(/INSERT INTO app_users/i),
      expect.stringMatching(/UPDATE beta_invitations.*used_by/is),
    ]);
  });
  it('refuses to claim an invitation when the token-signing secret is missing', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'invite-id' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'user-id', email: 'new@example.test' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const withTransaction = jest.fn(async (work: (client: any) => Promise<any>) => work({ query }));
    const service = new AuthService({ withTransaction, query: jest.fn() } as any);
    const oldSecret = process.env.AUTH_TOKEN_SECRET;
    delete process.env.AUTH_TOKEN_SECRET;
    try {
      await expect(service.register({
        email: 'new@example.test',
        password: 'long-enough-password',
        inviteCode: 'a'.repeat(32),
      })).rejects.toThrow('AUTH_TOKEN_SECRET must be set');
      expect(withTransaction).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
    } finally {
      if (oldSecret === undefined) delete process.env.AUTH_TOKEN_SECRET;
      else process.env.AUTH_TOKEN_SECRET = oldSecret;
    }
  });

});
