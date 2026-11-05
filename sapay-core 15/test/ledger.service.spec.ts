import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { LedgerService } from '../src/ledger/ledger.service';

describe('LedgerService (demo-only)', () => {
  let service: LedgerService;
  let alice: ReturnType<LedgerService['createWallet']>;
  let bob: ReturnType<LedgerService['createWallet']>;

  beforeEach(() => {
    service = new LedgerService();
    alice = service.createWallet('alice', 'SDG');
    bob = service.createWallet('bob', 'SDG');
    service.demoCredit(alice.id, '10000', 'seed-alice');
  });

  it('creates wallets with zero balance', () => {
    expect(service.getBalance(bob.id)).toBe(0n);
  });

  it('transfers balances and records a balanced journal', () => {
    const result = service.transfer({
      fromWalletId: alice.id, toWalletId: bob.id, amountMinor: '2500',
      currency: 'SDG', idempotencyKey: 'transfer-1',
    });
    expect(result.status).toBe('COMPLETED');
    expect(service.getBalance(alice.id)).toBe(7500n);
    expect(service.getBalance(bob.id)).toBe(2500n);
    const journal = service.listJournals().find((j) => j.id === result.journalEntryId)!;
    const debit = journal.postings.filter((p) => p.side === 'DEBIT').reduce((s, p) => s + BigInt(p.amountMinor), 0n);
    const credit = journal.postings.filter((p) => p.side === 'CREDIT').reduce((s, p) => s + BigInt(p.amountMinor), 0n);
    expect(debit).toBe(credit);
  });

  it('replays the same idempotency key without moving money twice', () => {
    const input = {
      fromWalletId: alice.id, toWalletId: bob.id, amountMinor: '2000',
      currency: 'SDG', idempotencyKey: 'retry-key',
    };
    const first = service.transfer(input);
    const second = service.transfer(input);
    expect(second.idempotentReplay).toBe(true);
    expect(second.transferId).toBe(first.transferId);
    expect(service.getBalance(alice.id)).toBe(8000n);
    expect(service.getBalance(bob.id)).toBe(2000n);
  });

  it('rejects reusing an idempotency key for different details', () => {
    service.transfer({
      fromWalletId: alice.id, toWalletId: bob.id, amountMinor: '1000',
      currency: 'SDG', idempotencyKey: 'same-key',
    });
    expect(() => service.transfer({
      fromWalletId: alice.id, toWalletId: bob.id, amountMinor: '2000',
      currency: 'SDG', idempotencyKey: 'same-key',
    })).toThrow(ConflictException);
  });

  it('rejects insufficient balance without changing balances', () => {
    expect(() => service.transfer({
      fromWalletId: bob.id, toWalletId: alice.id, amountMinor: '1',
      currency: 'SDG', idempotencyKey: 'no-funds',
    })).toThrow(UnprocessableEntityException);
    expect(service.getBalance(alice.id)).toBe(10000n);
    expect(service.getBalance(bob.id)).toBe(0n);
  });

  it('rejects currency mismatch', () => {
    const usd = service.createWallet('charlie', 'USD');
    expect(() => service.transfer({
      fromWalletId: alice.id, toWalletId: usd.id, amountMinor: '1',
      currency: 'SDG', idempotencyKey: 'fx-disabled',
    })).toThrow(UnprocessableEntityException);
  });

  it('rejects zero amount', () => {
    expect(() => service.transfer({
      fromWalletId: alice.id, toWalletId: bob.id, amountMinor: '0',
      currency: 'SDG', idempotencyKey: 'zero',
    })).toThrow();
  });

  it('makes simulated credits idempotent by reference', () => {
    const first = service.demoCredit(bob.id, '50', 'seed-bob');
    const replay = service.demoCredit(bob.id, '50', 'seed-bob');
    expect(replay.replay).toBe(true);
    expect(replay.journalEntryId).toBe(first.journalEntryId);
    expect(service.getBalance(bob.id)).toBe(50n);
  });
});
