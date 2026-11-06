import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Client } from 'pg';

process.env.AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'integration-only-secret-key-at-least-32-chars';
const integrationDatabaseUrl = requireIntegrationDatabaseUrl();

function requireIntegrationDatabaseUrl(value = process.env.DATABASE_URL): string {
  const expectedPassword = process.env.TEST_POSTGRES_PASSWORD;
  if (!value || !expectedPassword) {
    throw new Error('Integration tests require DATABASE_URL and TEST_POSTGRES_PASSWORD.');
  }

  let parsed: URL;
  let decodedPassword: string;
  try {
    parsed = new URL(value);
    decodedPassword = decodeURIComponent(parsed.password);
  } catch {
    throw new Error('Integration test DATABASE_URL is invalid; refusing to connect.');
  }

  const isTestDatabase =
    parsed.protocol === 'postgresql:' &&
    parsed.hostname === '127.0.0.1' &&
    parsed.port === '5433' &&
    parsed.username === 'sapay_test' &&
    parsed.pathname === '/sapay_integration_test' &&
    !parsed.search &&
    !parsed.hash &&
    decodedPassword === expectedPassword;

  if (!isTestDatabase) {
    throw new Error('DATABASE_URL must target only the isolated local integration-test database.');
  }

  return value;
}

async function verifyIntegrationDatabaseIdentity(connectionString: string): Promise<void> {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 5000,
  });
  let verificationError: Error | undefined;

  try {
    await client.connect();
    const result = await client.query<{ database_name: string }>(
      'SELECT current_database() AS database_name',
    );
    if (result.rows[0]?.database_name !== 'sapay_integration_test') {
      verificationError = new Error(
        'Connected PostgreSQL database is not sapay_integration_test; refusing to run integration tests.',
      );
    }
  } catch {
    verificationError = new Error(
      'Could not verify the integration-test PostgreSQL database; refusing to run integration tests.',
    );
  } finally {
    try {
      await client.end();
    } catch {
      verificationError = new Error(
        'Could not safely close the PostgreSQL identity-check connection; refusing to run integration tests.',
      );
    }
  }

  if (verificationError) throw verificationError;
}

async function createIntegrationApplication(connectionString: string): Promise<INestApplication> {
  const validatedConnectionString = requireIntegrationDatabaseUrl(connectionString);
  await verifyIntegrationDatabaseIdentity(validatedConnectionString);
  process.env.DATABASE_URL = validatedConnectionString;
  const { AppModule } = await import('../src/app.module');
  return NestFactory.create(AppModule);
}

describe('Integration database guard', () => {
  it('rejects sapay_demo before creating the NestJS application', async () => {
    const demoDatabaseUrl = new URL(integrationDatabaseUrl);
    demoDatabaseUrl.pathname = '/sapay_demo';
    const createApplication = jest.spyOn(NestFactory, 'create');

    try {
      await expect(createIntegrationApplication(demoDatabaseUrl.toString())).rejects.toThrow(
        'DATABASE_URL must target only the isolated local integration-test database.',
      );
      expect(createApplication).not.toHaveBeenCalled();
    } finally {
      createApplication.mockRestore();
    }
  });
});

describe('PostgreSQL API integration (isolated test database only)', () => {
  let app: INestApplication | undefined;
  let baseUrl: string;
  let accessToken: string;

  beforeAll(async () => {
    app = await createIntegrationApplication(integrationDatabaseUrl);
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    const registration = await fetch(`${baseUrl}/api/auth/register`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({email:`integration-${randomUUID()}@example.test`,password:'integration-password-2026'}) });
    expect(registration.status).toBe(201);
    accessToken = (await registration.json() as {accessToken:string}).accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  async function requestJson(path: string, init?: RequestInit) {
    const headers = new Headers(init?.headers);
    if (accessToken && !headers.has('authorization')) headers.set('authorization', `Bearer ${accessToken}`);
    const response = await fetch(`${baseUrl}/api${path}`, { ...init, headers });
    const body = await response.json() as Record<string, unknown>;
    return { response, body };
  }

  async function createWallet(ownerId: string) {
    const { response, body } = await requestJson('/demo/wallets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currency: 'SDG' }),
    });
    expect(response.status).toBe(201);
    expect(typeof body.id).toBe('string');
    return body.id as string;
  }

  async function getBalance(walletId: string): Promise<string> {
    const { response, body } = await requestJson(`/demo/wallets/${walletId}`);
    expect(response.status).toBe(200);
    return body.balanceMinor as string;
  }

  async function submitTransfer(input: {
    fromWalletId: string;
    toWalletId: string;
    amountMinor: string;
    idempotencyKey: string;
  }) {
    return requestJson('/transfers', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': input.idempotencyKey,
      },
      body: JSON.stringify({
        fromWalletId: input.fromWalletId,
        toWalletId: input.toWalletId,
        amountMinor: input.amountMinor,
        currency: 'SDG',
      }),
    });
  }

  it('accepts a copied wallet ID with its visible ID: label and rejects malformed UUIDs cleanly', async () => {
    const runId = randomUUID();
    const fromWalletId = await createWallet(`integration-id-prefix-from-${runId}`);
    const toWalletId = await createWallet(`integration-id-prefix-to-${runId}`);

    const credit = await requestJson(`/demo/wallets/${fromWalletId}/credit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amountMinor: '1000', reference: `integration-id-prefix-credit-${runId}` }),
    });
    expect(credit.response.status).toBe(201);

    const prefixedTransfer = await submitTransfer({
      fromWalletId: `ID: ${fromWalletId}`,
      toWalletId: `ID: ${toWalletId}`,
      amountMinor: '250',
      idempotencyKey: `integration-id-prefix-transfer-${runId}`,
    });
    expect(prefixedTransfer.response.status).toBe(201);
    await expect(getBalance(fromWalletId)).resolves.toBe('750');
    await expect(getBalance(toWalletId)).resolves.toBe('250');

    const malformed = await submitTransfer({
      fromWalletId,
      toWalletId: 'ID: not-a-uuid',
      amountMinor: '1',
      idempotencyKey: `integration-invalid-uuid-${runId}`,
    });
    expect(malformed.response.status).toBe(400);
    expect(String(malformed.body.message)).toContain('toWalletId must be a valid wallet UUID');
  });

  it('creates PostgreSQL wallets and transfers through the API with persisted balances', async () => {
    const runId = randomUUID();
    const fromWalletId = await createWallet(`integration-from-${runId}`);
    const toWalletId = await createWallet(`integration-to-${runId}`);

    const credit = await requestJson(`/demo/wallets/${fromWalletId}/credit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amountMinor: '10000', reference: `integration-credit-${runId}` }),
    });
    expect(credit.response.status).toBe(201);

    const transfer = await requestJson('/transfers', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': `integration-transfer-${runId}`,
      },
      body: JSON.stringify({
        fromWalletId,
        toWalletId,
        amountMinor: '2500',
        currency: 'SDG',
      }),
    });
    expect(transfer.response.status).toBe(201);
    expect(transfer.body.status).toBe('COMPLETED');
    expect(transfer.body.idempotentReplay).toBe(false);
    await expect(getBalance(fromWalletId)).resolves.toBe('7500');
    await expect(getBalance(toWalletId)).resolves.toBe('2500');
  });

  it('rejects an underfunded PostgreSQL API transfer without changing balances', async () => {
    const runId = randomUUID();
    const fromWalletId = await createWallet(`integration-empty-${runId}`);
    const toWalletId = await createWallet(`integration-recipient-${runId}`);

    const transfer = await requestJson('/transfers', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': `integration-insufficient-${runId}`,
      },
      body: JSON.stringify({
        fromWalletId,
        toWalletId,
        amountMinor: '1',
        currency: 'SDG',
      }),
    });
    expect(transfer.response.status).toBe(422);
    await expect(getBalance(fromWalletId)).resolves.toBe('0');
    await expect(getBalance(toWalletId)).resolves.toBe('0');
  });

  it('rejects concurrent transfers whose combined amount exceeds the source balance', async () => {
    const runId = randomUUID();
    const fromWalletId = await createWallet(`integration-concurrent-from-${runId}`);
    const firstToWalletId = await createWallet(`integration-concurrent-to-1-${runId}`);
    const secondToWalletId = await createWallet(`integration-concurrent-to-2-${runId}`);

    const credit = await requestJson(`/demo/wallets/${fromWalletId}/credit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amountMinor: '1000', reference: `integration-concurrent-credit-${runId}` }),
    });
    expect(credit.response.status).toBe(201);

    const results = await Promise.all([
      submitTransfer({
        fromWalletId,
        toWalletId: firstToWalletId,
        amountMinor: '600',
        idempotencyKey: `integration-concurrent-1-${runId}`,
      }),
      submitTransfer({
        fromWalletId,
        toWalletId: secondToWalletId,
        amountMinor: '600',
        idempotencyKey: `integration-concurrent-2-${runId}`,
      }),
    ]);

    expect(results.map(({ response }) => response.status).sort()).toEqual([201, 422]);
    await expect(getBalance(fromWalletId)).resolves.toBe('400');
    await expect(getBalance(firstToWalletId)).resolves.toBe(
      results[0].response.status === 201 ? '600' : '0',
    );
    await expect(getBalance(secondToWalletId)).resolves.toBe(
      results[1].response.status === 201 ? '600' : '0',
    );
  });

  it('replays the same transfer idempotently without debiting twice', async () => {
    const runId = randomUUID();
    const fromWalletId = await createWallet(`integration-replay-from-${runId}`);
    const toWalletId = await createWallet(`integration-replay-to-${runId}`);
    const idempotencyKey = `integration-replay-${runId}`;

    const credit = await requestJson(`/demo/wallets/${fromWalletId}/credit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amountMinor: '1000', reference: `integration-replay-credit-${runId}` }),
    });
    expect(credit.response.status).toBe(201);

    const input = { fromWalletId, toWalletId, amountMinor: '400', idempotencyKey };
    const first = await submitTransfer(input);
    const replay = await submitTransfer(input);

    expect(first.response.status).toBe(201);
    expect(first.body.idempotentReplay).toBe(false);
    expect(replay.response.status).toBe(201);
    expect(replay.body.idempotentReplay).toBe(true);
    expect(replay.body.transferId).toBe(first.body.transferId);
    await expect(getBalance(fromWalletId)).resolves.toBe('600');
    await expect(getBalance(toWalletId)).resolves.toBe('400');
  });

  it('rejects reuse of an idempotency key with a different amount', async () => {
    const runId = randomUUID();
    const fromWalletId = await createWallet(`integration-amount-mismatch-from-${runId}`);
    const toWalletId = await createWallet(`integration-amount-mismatch-to-${runId}`);
    const idempotencyKey = `integration-amount-mismatch-${runId}`;

    const credit = await requestJson(`/demo/wallets/${fromWalletId}/credit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amountMinor: '1000', reference: `integration-amount-credit-${runId}` }),
    });
    expect(credit.response.status).toBe(201);

    const first = await submitTransfer({
      fromWalletId, toWalletId, amountMinor: '400', idempotencyKey,
    });
    const conflicting = await submitTransfer({
      fromWalletId, toWalletId, amountMinor: '500', idempotencyKey,
    });

    expect(first.response.status).toBe(201);
    expect(conflicting.response.status).toBe(409);
    await expect(getBalance(fromWalletId)).resolves.toBe('600');
    await expect(getBalance(toWalletId)).resolves.toBe('400');
  });

  it('rejects reuse of an idempotency key with a different recipient', async () => {
    const runId = randomUUID();
    const fromWalletId = await createWallet(`integration-recipient-mismatch-from-${runId}`);
    const firstToWalletId = await createWallet(`integration-recipient-mismatch-to-1-${runId}`);
    const differentToWalletId = await createWallet(`integration-recipient-mismatch-to-2-${runId}`);
    const idempotencyKey = `integration-recipient-mismatch-${runId}`;

    const credit = await requestJson(`/demo/wallets/${fromWalletId}/credit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amountMinor: '1000', reference: `integration-recipient-credit-${runId}` }),
    });
    expect(credit.response.status).toBe(201);

    const first = await submitTransfer({
      fromWalletId, toWalletId: firstToWalletId, amountMinor: '400', idempotencyKey,
    });
    const conflicting = await submitTransfer({
      fromWalletId, toWalletId: differentToWalletId, amountMinor: '400', idempotencyKey,
    });

    expect(first.response.status).toBe(201);
    expect(conflicting.response.status).toBe(409);
    await expect(getBalance(fromWalletId)).resolves.toBe('600');
    await expect(getBalance(firstToWalletId)).resolves.toBe('400');
    await expect(getBalance(differentToWalletId)).resolves.toBe('0');
  });

  it('rejects zero, negative, and fractional amounts without changing balances', async () => {
    const runId = randomUUID();
    const fromWalletId = await createWallet(`integration-invalid-amount-from-${runId}`);
    const toWalletId = await createWallet(`integration-invalid-amount-to-${runId}`);

    const credit = await requestJson(`/demo/wallets/${fromWalletId}/credit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amountMinor: '1000', reference: `integration-invalid-credit-${runId}` }),
    });
    expect(credit.response.status).toBe(201);

    for (const [label, amountMinor] of [
      ['zero', '0'],
      ['negative', '-1'],
      ['fractional', '1.5'],
    ] as const) {
      const beforeFrom = await getBalance(fromWalletId);
      const beforeTo = await getBalance(toWalletId);
      const result = await submitTransfer({
        fromWalletId,
        toWalletId,
        amountMinor,
        idempotencyKey: `integration-invalid-${label}-${runId}`,
      });

      expect(result.response.status).toBe(400);
      await expect(getBalance(fromWalletId)).resolves.toBe(beforeFrom);
      await expect(getBalance(toWalletId)).resolves.toBe(beforeTo);
    }

    await expect(getBalance(fromWalletId)).resolves.toBe('1000');
    await expect(getBalance(toWalletId)).resolves.toBe('0');
  });
  it('requires a valid bearer token and prevents cross-user wallet access', async () => {
    const runId = randomUUID();
    const walletId = await createWallet(`auth-owner-${runId}`);
    const noToken = await fetch(`${baseUrl}/api/demo/wallets`);
    expect(noToken.status).toBe(401);
    const second = await fetch(`${baseUrl}/api/auth/register`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:`other-${runId}@example.test`,password:'another-secure-password-2026'})});
    expect(second.status).toBe(201);
    const otherToken = (await second.json() as {accessToken:string}).accessToken;
    const login = await fetch(`${baseUrl}/api/auth/login`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:`other-${runId}@example.test`,password:'another-secure-password-2026'})});
    expect(login.status).toBe(201);
    const loggedInToken = (await login.json() as {accessToken:string}).accessToken;
    const stolen = await fetch(`${baseUrl}/api/demo/wallets/${walletId}`, {headers:{authorization:`Bearer ${loggedInToken}`}});
    expect(stolen.status).toBe(404);
    const otherWalletResponse = await fetch(`${baseUrl}/api/demo/wallets`, {method:'POST',headers:{authorization:`Bearer ${otherToken}`,'content-type':'application/json'},body:JSON.stringify({currency:'SDG'})});
    expect(otherWalletResponse.status).toBe(201);
    const otherWalletId = (await otherWalletResponse.json() as {id:string}).id;
    const unauthorizedTransfer = await fetch(`${baseUrl}/api/transfers`, {method:'POST',headers:{authorization:`Bearer ${otherToken}`,'content-type':'application/json','idempotency-key':`cross-owner-${runId}`},body:JSON.stringify({fromWalletId:walletId,toWalletId:otherWalletId,amountMinor:'1',currency:'SDG'})});
    expect(unauthorizedTransfer.status).toBe(404);
    const invalidToken = await fetch(`${baseUrl}/api/demo/wallets`, {headers:{authorization:'Bearer invalid.token.value'}});
    expect(invalidToken.status).toBe(401);
  });

  it('rate limits repeated login attempts', async () => {
    const attempts = await Promise.all(Array.from({length:6}, () => fetch(`${baseUrl}/api/auth/login?probe=rate-limit-test`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'nobody@example.test',password:'wrong-password'})})));
    expect(attempts.slice(0,4).every(r => r.status === 401)).toBe(true);
    expect(attempts[4]!.status).toBe(429);
    expect(attempts[5]!.status).toBe(429);
  });

});
