import { UnprocessableEntityException } from '@nestjs/common';
import { DatabaseService } from '../src/database/database.service';
import { PostgresLedgerService } from '../src/database/postgres-ledger.service';

describe('PostgresLedgerService external bank demo transfer', () => {
  const wallet = { id: 'bbf20e21-fdea-4053-a0a9-2d03b277e9f9', user_id: 'user-1', currency: 'SDG', status: 'ACTIVE', account_id: 'wallet-account' };
  let statements: Array<{ sql: string; params: unknown[] }>;
  let balance = '1000';
  const client = { query: jest.fn(async (sql: string, params: unknown[] = []) => {
    statements.push({ sql, params });
    if (sql.includes('SELECT request_hash')) return { rowCount: 0, rows: [] } as any;
    if (sql.includes('SELECT w.id, w.user_id')) return { rowCount: 1, rows: [wallet] } as any;
    if (sql.includes('SELECT COALESCE(SUM')) return { rowCount: 1, rows: [{ balance }] } as any;
    if (sql.includes('INSERT INTO ledger_accounts')) return { rowCount: 1, rows: [{ id: 'demo-clearing-account' }] } as any;
    return { rowCount: 1, rows: [] } as any;
  }) };
  const database = {
    withTransaction: jest.fn(async (work: (tx: any) => Promise<unknown>) => work(client)),
  } as unknown as DatabaseService;
  const service = new PostgresLedgerService(database);
  const input = {
    fromWalletId: wallet.id, amountMinor: '250', currency: 'SDG',
    destinationType: 'SUDAN_BANK' as const, provider: 'بنك الخرطوم',
    beneficiaryName: 'مستفيد تجريبي', destinationReference: 'DEMO-BANK-0001',
    idempotencyKey: 'bank-demo-idempotency-1', userId: 'user-1',
  };

  beforeEach(() => { statements = []; balance = '1000'; jest.clearAllMocks(); });

  it('posts a debit to the wallet and a matching credit to demo clearing in one transaction', async () => {
    const result = await service.externalTransfer(input);
    const posting = statements.find((entry) => entry.sql.includes('INSERT INTO ledger_postings'));
    expect(posting).toBeDefined();
    expect(posting!.sql).toContain("($1, $2, 'CREDIT', $3, $4), ($1, $5, 'DEBIT', $3, $4)");
    expect(posting!.params).toEqual(expect.arrayContaining(['wallet-account', 'demo-clearing-account', '250', 'SDG']));
    expect(result).toMatchObject({ status: 'SIMULATED', execution: 'NOT_SENT', amountMinor: '250' });
    expect(statements.some((entry) => entry.sql.includes('INSERT INTO external_transfers'))).toBe(true);
    expect(statements.some((entry) => entry.sql.includes('INSERT INTO idempotency_keys'))).toBe(true);
  });

  it('rejects an amount above the available demo balance without creating a journal', async () => {
    balance = '100';
    await expect(service.externalTransfer(input)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(statements.some((entry) => entry.sql.includes('INSERT INTO journal_entries'))).toBe(false);
    expect(statements.some((entry) => entry.sql.includes('INSERT INTO ledger_postings'))).toBe(false);
  });
});
