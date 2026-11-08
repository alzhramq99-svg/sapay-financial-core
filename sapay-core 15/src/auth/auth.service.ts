import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { DatabaseService } from '../database/database.service';
const scrypt = promisify(scryptCallback);
const TTL = 900;
const TOKEN_ISSUER = 'sapay-api';
const TOKEN_AUDIENCE = 'sapay-client';
@Injectable()
export class AuthService {
  constructor(private readonly db: DatabaseService) {}
  private secret(): string {
    const value = process.env.AUTH_TOKEN_SECRET;
    if (!value || value.length < 32) throw new Error('AUTH_TOKEN_SECRET must be set to at least 32 characters.');
    return value;
  }
  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const hash = await scrypt(password, salt, 64) as Buffer;
    return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
  }
  private async verifyPassword(password: string, stored: string): Promise<boolean> {
    const [scheme, saltHex, hashHex] = stored.split(':');
    if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length) as Buffer;
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
  private issueToken(userId: string): string {
    const now = Math.floor(Date.now() / 1000);
    const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const p = Buffer.from(JSON.stringify({ sub: userId, iss: TOKEN_ISSUER, aud: TOKEN_AUDIENCE, iat: now, exp: now + TTL })).toString('base64url');
    const data = `${h}.${p}`;
    return `${data}.${createHmac('sha256', this.secret()).update(data).digest('base64url')}`;
  }
  verifyToken(token: string): { userId: string } {
    try {
      const parts = token.split('.');
      if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) throw new Error();
      const data = `${parts[0]}.${parts[1]}`;
      const expected = createHmac('sha256', this.secret()).update(data).digest();
      const actual = Buffer.from(parts[2]!, 'base64url');
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
      const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString());
      const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString());
      if (header.alg !== 'HS256' || header.typ !== 'JWT' ||
          typeof payload.sub !== 'string' || payload.sub.length === 0 ||
          payload.iss !== TOKEN_ISSUER || payload.aud !== TOKEN_AUDIENCE ||
          !Number.isInteger(payload.iat) || payload.iat > Math.floor(Date.now() / 1000) + 60 ||
          !Number.isInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000) ||
          payload.exp <= payload.iat || payload.exp - payload.iat > TTL) throw new Error();
      return { userId: payload.sub };
    } catch { throw new UnauthorizedException('Invalid or expired access token'); }
  }
  async register(input: { email: string; password: string; inviteCode: string }) {
    const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
    const password = input?.password;
    const inviteCode = typeof input?.inviteCode === 'string' ? input.inviteCode.trim() : '';
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || email.length > 254) throw new BadRequestException('A valid email is required');
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw new BadRequestException('Password must be 12–128 characters');
    if (!/^[A-Za-z0-9_-]{40,64}$/.test(inviteCode)) throw new BadRequestException('A valid invitation code is required');
    const passwordHash = await this.hashPassword(password);
    const codeHash = createHmac('sha256', 'sapay-beta-invitation-v1').update(inviteCode).digest('hex');
    try {
      const user = await this.db.withTransaction(async (client) => {
        const invitation = await client.query(
          `UPDATE beta_invitations SET used_at=now()
           WHERE code_hash=$1 AND used_at IS NULL AND expires_at > now()
           RETURNING id`, [codeHash],
        );
        if (invitation.rowCount !== 1) throw new BadRequestException('Invitation code is invalid, expired, or already used');
        const created = await client.query(
          `INSERT INTO app_users (external_ref,email,password_hash) VALUES ($1,$1,$2) RETURNING id,email`,
          [email,passwordHash],
        );
        if (!created.rows[0]) throw new Error('User registration did not return a record');
        await client.query(
          `UPDATE beta_invitations SET used_by=$2 WHERE id=$1`,
          [invitation.rows[0].id,created.rows[0].id],
        );
        return created.rows[0];
      });
      return { user:{id:user.id,email:user.email}, accessToken:this.issueToken(user.id), tokenType:'Bearer', expiresIn:TTL };
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictException('An account with this email already exists');
      throw error;
    }
  }
  async login(input: { email: string; password: string }) {
    const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
    const password = typeof input?.password === 'string' ? input.password : '';
    const result = await this.db.query(`SELECT id,email,password_hash FROM app_users WHERE email=$1 AND status='ACTIVE'`,[email]);
    const user = result.rows[0];
    const valid = user?.password_hash ? await this.verifyPassword(password,user.password_hash) : false;
    if (!valid || !user) throw new UnauthorizedException('Invalid email or password');
    return { user:{id:user.id,email:user.email}, accessToken:this.issueToken(user.id), tokenType:'Bearer', expiresIn:TTL };
  }
}
