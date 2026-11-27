// Regression tests for issue #58: wallet ownership, transfer idempotency and
// wallet ID handling in PostgresLedgerService, using a scripted query mock.
import { BadRequestException, ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DatabaseService } from '../src/database/database.service';
import { PostgresLedgerService } from '../src/database/postgres-ledger.service';

const FROM = 'bbf20e21-fdea-4053-a0a9-2d03b277e9f9';
const TO = '4c6a9c0d-4f2a-4a1b-8c3d-2a6e5d7f8b90';
const OWNER = 'user-owner';

type Row = Record<string, unknown>;

function harness(opts: { balance?: string; owner?: string; currency?: string; prior?: Row } = {}) {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    statements.push({ sql, params });
    if (sql.includes('SELECT request_hash')) {
      return opts.prior ? { rowCount: 1, rows: [opts.prior] } : { rowCount: 0, rows: [] };
    }
    if (sql.includes('SELECT w.id, w.user_id')) {
      // PostgreSQL always returns uuid values in lowercase.
      const ids = [...new Set((params[0] as string[]).map((id) => id.toLowerCase()))];
      const rows = ids.filter((id) => id === FROM || id === TO).map((id) => ({
        id,
        user_id: id === FROM ? opts.owner ?? OWNER : 'user-recipient',
        currency: opts.currency ?? 'SDG',
        status: 'ACTIVE',
        account_id: 'acct-' + id,
      }));
      return { rowCount: rows.length, rows };
    }
    if (sql.includes('AS balance')) return { rowCount: 1, rows: [{ balance: opts.balance ?? '1000' }] };
    return { rowCount: 1, rows: [] };
  });
  const database = {
    withTransaction: jest.fn(async (work: (client: any) => Promise<unknown>) => work({ query })),
  } as unknown as DatabaseService;
  return { service: new PostgresLedgerService(database), statements, database };
}

const request = (overrides: Partial<Parameters<PostgresLedgerService['transfer']>[0]> = {}) => ({
  fromWalletId: FROM,
  toWalletId: TO,
  amountMinor: '100',
  currency: 'SDG',
  idempotencyKey: 'key-1',
  userId: OWNER,
  ...overrides,
});

describe('PostgresLedgerService demo credit replay', () => {
  it('replays an existing credit when its stored wallet UUID differs only by case', async () => {
    const statements: Array<{ sql: string; params: unknown[] }> = [];
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
      statements.push({ sql, params });
      if (sql.includes('SELECT w.id, w.user_id, w.currency')) {
        return {
          rowCount: 1,
          rows: [{ id: FROM, user_id: OWNER, currency: 'SDG', status: 'ACTIVE', account_id: 'acct-' + FROM }],
        };
      }
      if (sql.includes('SELECT j.id, j.metadata, p.amount_minor')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'journal-demo-credit',
            metadata: { walletId: FROM.toUpperCase(), environment: 'demo-only' },
            amount_minor: '100',
          }],
        };
      }
      return { rowCount: 1, rows: [] };
    });
    const database = {
      withTransaction: jest.fn(async (work: (client: any) => Promise<unknown>) => work({ query })),
    } as unknown as DatabaseService;
    const service = new PostgresLedgerService(database);

    const result = await service.demoCredit(FROM.toUpperCase(), OWNER, '100', 'credit-ref');

    expect(result).toEqual({
      journalEntryId: 'journal-demo-credit',
      walletId: FROM,
      amountMinor: '100',
      replay: true,
    });
    expect(statements.some((statement) => statement.sql.includes('INSERT INTO ledger_postings'))).toBe(false);
  });
});

describe('PostgresLedgerService transfer security (issue #58)', () => {
  it('completes a valid transfer and stores the response under the idempotency key', async () => {
    const { service, statements } = harness();
    const result = await service.transfer(request());
    expect(result).toMatchObject({ fromWalletId: FROM, toWalletId: TO, amountMinor: '100', status: 'COMPLETED', idempotentReplay: false });
    const stored = statements.find((s) => s.sql.includes('INSERT INTO idempotency_keys'));
    expect(stored?.params[0]).toBe('key-1');
    expect(statements.findIndex((s) => s.sql.includes('pg_advisory_xact_lock')))
      .toBeLessThan(statements.findIndex((s) => s.sql.includes('SELECT request_hash')));
  });

  it('refuses to debit a wallet the caller does not own (no cross-user transfer)', async () => {
    const { service, statements } = harness({ owner: 'someone-else' });
    await expect(service.transfer(request())).rejects.toBeInstanceOf(NotFoundException);
    expect(statements.some((s) => s.sql.includes('INSERT INTO ledger_postings'))).toBe(false);
  });

  it('rejects a transfer larger than the ledger balance without writing postings', async () => {
    const { service, statements } = harness({ balance: '99' });
    await expect(service.transfer(request())).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(statements.some((s) => s.sql.includes('INSERT INTO ledger_postings'))).toBe(false);
  });

  it('rejects a currency that does not match both wallets (no implicit FX)', async () => {
    const { service } = harness({ currency: 'USD' });
    await expect(service.transfer(request())).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejects zero, negative, decimal and oversized amounts before opening a transaction', async () => {
    const { service, database } = harness();
    for (const amountMinor of ['0', '-5', '1.5', '1e3', '9000000000000000001', '']) {
      await expect(service.transfer(request({ amountMinor }))).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(database.withTransaction).not.toHaveBeenCalled();
  });

  it('requires an Idempotency-Key', async () => {
    const { service } = harness();
    await expect(service.transfer(request({ idempotencyKey: '  ' }))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('replays the stored response for the same key and same request without posting again', async () => {
    const first = harness();
    const original = await first.service.transfer(request());
    const fingerprint = first.statements.find((s) => s.sql.includes('INSERT INTO idempotency_keys'))!.params[1];

    const replay = harness({ prior: { request_hash: fingerprint, response_body: original } });
    const result = await replay.service.transfer(request());
    expect(result).toEqual({ ...original, idempotentReplay: true });
    expect(replay.statements.some((s) => s.sql.includes('INSERT INTO ledger_postings'))).toBe(false);
  });

  it('rejects reuse of a key with a different amount (409) instead of replaying', async () => {
    const first = harness();
    const original = await first.service.transfer(request());
    const fingerprint = first.statements.find((s) => s.sql.includes('INSERT INTO idempotency_keys'))!.params[1];

    const reuse = harness({ prior: { request_hash: fingerprint, response_body: original } });
    await expect(reuse.service.transfer(request({ amountMinor: '101' }))).rejects.toBeInstanceOf(ConflictException);
  });

  it('never replays another user\'s stored transfer response for the same key', async () => {
    const first = harness();
    const original = await first.service.transfer(request());
    const fingerprint = first.statements.find((s) => s.sql.includes('INSERT INTO idempotency_keys'))!.params[1];

    const other = harness({ prior: { request_hash: fingerprint, response_body: original } });
    await expect(other.service.transfer(request({ userId: 'attacker' }))).rejects.toBeInstanceOf(ConflictException);
  });

  it('handles an uppercase wallet UUID as the same wallet instead of crashing (Vortex finding #10)', async () => {
    const { service } = harness();
    const result = await service.transfer(request({ fromWalletId: FROM.toUpperCase() }));
    expect(result).toMatchObject({ fromWalletId: FROM, status: 'COMPLETED' });
  });

  it('treats the same wallet in different letter case as a self-transfer (400), not a 404', async () => {
    const { service } = harness();
    await expect(service.transfer(request({ toWalletId: FROM.toUpperCase() }))).rejects.toBeInstanceOf(BadRequestException);
  });
});
