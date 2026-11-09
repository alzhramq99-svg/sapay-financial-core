import { createHash } from 'node:crypto';
import { AuthService } from '../src/auth/auth.service';

describe('AuthService private beta registration', () => {
  const secret = 'unit-test-secret-that-is-long-enough-123456';
  const invite = 'A'.repeat(43);
  let service: AuthService;
  let client: any;
  let db: any;
  beforeEach(() => {
    process.env.AUTH_TOKEN_SECRET = secret;
    client = { query: jest.fn() };
    db = { withTransaction: jest.fn(async (work: any) => work(client)) };
    service = new AuthService(db);
  });
  afterAll(() => { delete process.env.AUTH_TOKEN_SECRET; });

  it('rejects missing and malformed invitation codes before touching the database', async () => {
    await expect(service.register({ email:'a@example.com',password:'long-password-123' } as any)).rejects.toThrow('A valid invitation code is required');
    await expect(service.register({ email:'a@example.com',password:'long-password-123',inviteCode:'bad' })).rejects.toThrow('A valid invitation code is required');
    expect(db.withTransaction).not.toHaveBeenCalled();
  });

  it('consumes a valid invite and creates the user in one transaction', async () => {
    client.query
      .mockResolvedValueOnce({ rowCount:1, rows:[{id:'invite-1'}] })
      .mockResolvedValueOnce({ rows:[{id:'user-1',email:'a@example.com'}] })
      .mockResolvedValueOnce({ rows:[] });
    const result = await service.register({email:'a@example.com',password:'long-password-123',inviteCode:invite});
    expect(db.withTransaction).toHaveBeenCalledTimes(1);
    expect(client.query.mock.calls[0][0]).toContain('used_at IS NULL AND expires_at > now()');
    expect(client.query.mock.calls[0][1][0]).toBe(createHash('sha256').update(invite).digest('hex'));
    expect(client.query.mock.calls[1][0]).toContain('INSERT INTO app_users');
    expect(client.query.mock.calls[2][0]).toContain('used_by=$2');
    expect(result.user.email).toBe('a@example.com');
  });

  it('rejects invalid, expired, or already-used invitations', async () => {
    client.query.mockResolvedValueOnce({rowCount:0,rows:[]});
    await expect(service.register({email:'a@example.com',password:'long-password-123',inviteCode:invite})).rejects.toThrow('Invitation code is invalid, expired, or already used');
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('rolls back the invitation consumption if user creation fails', async () => {
    client.query.mockResolvedValueOnce({rowCount:1,rows:[{id:'invite-1'}]}).mockRejectedValueOnce({code:'23505'});
    await expect(service.register({email:'a@example.com',password:'long-password-123',inviteCode:invite})).rejects.toThrow('An account with this email already exists');
    expect(client.query).toHaveBeenCalledTimes(2);
  });
});
