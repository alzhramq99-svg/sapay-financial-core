import { ServiceUnavailableException } from '@nestjs/common';
import { LedgerController } from '../src/ledger/ledger.controller';
import { PostgresLedgerService } from '../src/database/postgres-ledger.service';

describe('LedgerController external transfers gate', () => {
  const body = {
    fromWalletId: '11111111-1111-4111-8111-111111111111', amountMinor: '100', currency: 'SDG',
    destinationType: 'SUDAN_BANK' as const, provider: 'Demo Bank', beneficiaryName: 'Demo', destinationReference: 'DEMO-TEST-0001',
  };
  const req = { user: { userId: 'user-1' } } as never;
  let ledger: { externalTransfer: jest.Mock };
  let controller: LedgerController;
  const original = process.env.EXTERNAL_TRANSFERS_ENABLED;

  beforeEach(() => {
    ledger = { externalTransfer: jest.fn().mockResolvedValue({ status: 'SIMULATED' }) };
    controller = new LedgerController(ledger as unknown as PostgresLedgerService);
  });
  afterEach(() => {
    if (original === undefined) delete process.env.EXTERNAL_TRANSFERS_ENABLED;
    else process.env.EXTERNAL_TRANSFERS_ENABLED = original;
  });

  it.each([undefined, '', 'false', '1', 'TRUE'])('returns 503 without touching the ledger when the flag is %p', async (value) => {
    if (value === undefined) delete process.env.EXTERNAL_TRANSFERS_ENABLED;
    else process.env.EXTERNAL_TRANSFERS_ENABLED = value;

    await expect(Promise.resolve().then(() => controller.externalTransfer(req, 'key-1', body))).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(ledger.externalTransfer).not.toHaveBeenCalled();
  });

  it('delegates to the ledger only when EXTERNAL_TRANSFERS_ENABLED is exactly "true"', async () => {
    process.env.EXTERNAL_TRANSFERS_ENABLED = 'true';

    await expect(controller.externalTransfer(req, 'key-1', body)).resolves.toEqual({ status: 'SIMULATED' });
    expect(ledger.externalTransfer).toHaveBeenCalledWith({ ...body, userId: 'user-1', idempotencyKey: 'key-1' });
  });
});
