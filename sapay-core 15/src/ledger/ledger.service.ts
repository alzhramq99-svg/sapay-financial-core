import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { JournalEntry, TransferResult, Wallet } from './ledger.types';

/**
 * DEMO ONLY: in-memory ledger. Replace with a durable transactional repository
 * before any deployment. No real funds or external providers are connected.
 */
@Injectable()
export class LedgerService {
  private readonly wallets = new Map<string, Wallet>();
  private readonly balances = new Map<string, bigint>();
  private readonly journals: JournalEntry[] = [];
  private readonly idempotency = new Map<string, TransferResult>();

  health() {
    return {
      status: 'ok',
      mode: 'DEMO_ONLY',
      storage: 'in-memory',
      realMoneyEnabled: false,
      bankIntegrationsEnabled: false,
    } as const;
  }

  createWallet(ownerId: string, currency: string): Wallet {
    const owner = typeof ownerId === 'string' ? ownerId.trim() : '';
    const code = typeof currency === 'string' ? currency.trim().toUpperCase() : '';
    if (!owner) throw new BadRequestException('ownerId is required');
    if (!/^[A-Z]{3,8}$/.test(code)) {
      throw new BadRequestException('currency must be a 3–8 letter code, e.g. SDG');
    }
    const wallet: Wallet = {
      id: randomUUID(),
      ownerId: owner,
      currency: code,
      createdAt: new Date().toISOString(),
    };
    this.wallets.set(wallet.id, wallet);
    this.balances.set(wallet.id, 0n);
    return wallet;
  }

  listWallets(): Wallet[] {
    return [...this.wallets.values()];
  }

  getWallet(walletId: string) {
    const wallet = this.wallets.get(walletId);
    if (!wallet) throw new NotFoundException('Wallet not found');
    return { ...wallet, balanceMinor: this.balance(walletId).toString() };
  }

  getBalance(walletId: string): bigint {
    if (!this.wallets.has(walletId)) throw new NotFoundException('Wallet not found');
    return this.balance(walletId);
  }

  listJournals(): JournalEntry[] {
    return this.journals.map((entry) => ({
      ...entry,
      postings: entry.postings.map((posting) => ({ ...posting })),
      metadata: entry.metadata ? { ...entry.metadata } : undefined,
    }));
  }

  /**
   * Simulated issuance for local demos only. Never expose as a live funding API.
   * Idempotency is reference-scoped in this in-memory process.
   */
  demoCredit(walletId: string, amountMinorInput: string, reference: string) {
    const wallet = this.wallets.get(walletId);
    if (!wallet) throw new NotFoundException('Wallet not found');
    const amount = this.parsePositiveAmount(amountMinorInput);
    const ref = typeof reference === 'string' ? reference.trim() : '';
    if (!ref) throw new BadRequestException('reference is required');

    const prior = this.journals.find(
      (j) => j.type === 'DEMO_CREDIT' && j.reference === ref,
    );
    if (prior) {
      const sameWallet = prior.metadata?.walletId === walletId;
      const sameAmount = prior.postings[0]?.amountMinor === amount.toString();
      if (!sameWallet || !sameAmount) {
        throw new ConflictException('reference already used with different details');
      }
      return { journalEntryId: prior.id, walletId, amountMinor: amount.toString(), replay: true };
    }

    const journal: JournalEntry = {
      id: randomUUID(),
      type: 'DEMO_CREDIT',
      reference: ref,
      createdAt: new Date().toISOString(),
      postings: [
        { accountId: `wallet:${walletId}`, side: 'DEBIT', amountMinor: amount.toString(), currency: wallet.currency },
        { accountId: `demo-issuance:${wallet.currency}`, side: 'CREDIT', amountMinor: amount.toString(), currency: wallet.currency },
      ],
      metadata: { walletId, environment: 'demo-only' },
    };
    this.assertBalanced(journal);
    this.balances.set(walletId, this.balance(walletId) + amount);
    this.journals.push(journal);
    return { journalEntryId: journal.id, walletId, amountMinor: amount.toString(), replay: false };
  }

  transfer(input: {
    fromWalletId: string;
    toWalletId: string;
    amountMinor: string;
    currency: string;
    idempotencyKey: string;
  }): TransferResult {
    const key = typeof input.idempotencyKey === 'string' ? input.idempotencyKey.trim() : '';
    if (!key) throw new BadRequestException('Idempotency-Key header is required');
    if (key.length > 128) throw new BadRequestException('Idempotency-Key must be at most 128 characters');

    const amount = this.parsePositiveAmount(input.amountMinor);
    const currency = typeof input.currency === 'string' ? input.currency.trim().toUpperCase() : '';
    const requestFingerprint = [
      input.fromWalletId, input.toWalletId, amount.toString(), currency,
    ].join('|');

    const previous = this.idempotency.get(key);
    if (previous) {
      const savedFingerprint = (previous as TransferResult & { fingerprint?: string }).fingerprint;
      if (savedFingerprint !== requestFingerprint) {
        throw new ConflictException('Idempotency-Key was already used for a different request');
      }
      return { ...previous, idempotentReplay: true };
    }

    const from = this.wallets.get(input.fromWalletId);
    const to = this.wallets.get(input.toWalletId);
    if (!from || !to) throw new NotFoundException('Source or destination wallet not found');
    if (from.id === to.id) throw new BadRequestException('Source and destination wallets must differ');
    if (!currency || from.currency !== currency || to.currency !== currency) {
      throw new UnprocessableEntityException('Currency mismatch; FX is not supported');
    }
    if (this.balance(from.id) < amount) {
      throw new UnprocessableEntityException('Insufficient demo balance');
    }

    const journal: JournalEntry = {
      id: randomUUID(),
      type: 'TRANSFER',
      reference: key,
      createdAt: new Date().toISOString(),
      postings: [
        { accountId: `wallet:${from.id}`, side: 'CREDIT', amountMinor: amount.toString(), currency },
        { accountId: `wallet:${to.id}`, side: 'DEBIT', amountMinor: amount.toString(), currency },
      ],
      metadata: { fromWalletId: from.id, toWalletId: to.id, environment: 'demo-only' },
    };
    this.assertBalanced(journal);

    // Synchronous in-memory commit. A production adapter must do these writes in one DB transaction.
    this.balances.set(from.id, this.balance(from.id) - amount);
    this.balances.set(to.id, this.balance(to.id) + amount);
    this.journals.push(journal);

    const result: TransferResult & { fingerprint?: string } = {
      transferId: randomUUID(),
      fromWalletId: from.id,
      toWalletId: to.id,
      amountMinor: amount.toString(),
      currency,
      status: 'COMPLETED',
      journalEntryId: journal.id,
      idempotentReplay: false,
      fingerprint: requestFingerprint,
    };
    this.idempotency.set(key, result);
    const { fingerprint: _fingerprint, ...publicResult } = result;
    return publicResult;
  }

  private balance(walletId: string): bigint {
    return this.balances.get(walletId) ?? 0n;
  }

  private parsePositiveAmount(value: string): bigint {
    if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) {
      throw new BadRequestException('amountMinor must be a positive integer string');
    }
    const amount = BigInt(value);
    if (amount <= 0n) throw new BadRequestException('amountMinor must be greater than zero');
    if (amount > 9_000_000_000_000_000_000n) {
      throw new BadRequestException('amountMinor exceeds demo limit');
    }
    return amount;
  }

  private assertBalanced(journal: JournalEntry): void {
    const totals = new Map<string, { debit: bigint; credit: bigint }>();
    for (const p of journal.postings) {
      const amount = BigInt(p.amountMinor);
      if (amount <= 0n) throw new Error('Ledger posting must be positive');
      const current = totals.get(p.currency) ?? { debit: 0n, credit: 0n };
      if (p.side === 'DEBIT') current.debit += amount;
      else current.credit += amount;
      totals.set(p.currency, current);
    }
    for (const [currency, total] of totals) {
      if (total.debit !== total.credit) {
        throw new Error(`Unbalanced journal entry for ${currency}`);
      }
    }
  }
}
