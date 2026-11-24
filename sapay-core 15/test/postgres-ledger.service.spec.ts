import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../src/database/database.service';
import { PostgresLedgerService } from '../src/database/postgres-ledger.service';

describe('PostgresLedgerService transfer wallet IDs', () => {
  const fromId = 'bbf20e21-fdea-4053-a0a9-2d03b277e9f9';
  const toId = '4c6a9c0d-4f2a-4a1b-8c3d-2a6e5d7f8b90';
  const walletQuery = jest.fn();
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('SELECT request_hash')) return { rowCount: 0, rows: [] } as any;
    if (sql.includes('SELECT w.id, w.user_id')) return walletQuery(sql);
    return { rowCount: 0, rows: [] } as any;
  });
  const database = {
    withTransaction: jest.fn(async (work: (client: any) => Promise<unknown>) => work({ query })),
  } as unknown as DatabaseService;
  const service = new PostgresLedgerService(database);

  beforeEach(() => {
    jest.clearAllMocks();
    walletQuery.mockResolvedValue({ rowCount: 0, rows: [] });
  });

  it('normalizes a copied ID: UUID before sending it to PostgreSQL', async () => {
    await expect(service.transfer({
      fromWalletId: `ID: ${fromId}`,
      toWalletId: toId,
      amountMinor: '10',
      currency: 'SDG',
      idempotencyKey: 'uuid-normalization-test',
      userId: 'user-id',
    })).rejects.toBeInstanceOf(NotFoundException);

    expect(walletQuery).toHaveBeenCalledTimes(1);
    expect(walletQuery.mock.calls[0][0]).toContain('ANY($1::uuid[])');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), ['uuid-normalization-test']);
  });

  it('rejects a non-UUID wallet ID before opening a database transaction', async () => {
    await expect(service.transfer({
      fromWalletId: `ID: ${fromId}`,
      toWalletId: 'not-a-uuid',
      amountMinor: '10',
      currency: 'SDG',
      idempotencyKey: 'invalid-uuid-test',
      userId: 'user-id',
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(database.withTransaction).not.toHaveBeenCalled();
  });
});
