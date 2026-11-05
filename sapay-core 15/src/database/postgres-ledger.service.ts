import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseService } from './database.service';

@Injectable()
export class PostgresLedgerService {
  constructor(private readonly db: DatabaseService) {}

  async createWallet(userId: string, currency: string) {
    const code = typeof currency === 'string' ? currency.trim().toUpperCase() : '';
    if (!/^[A-Z]{3}$/.test(code)) throw new BadRequestException('currency must be a 3-letter code, e.g. SDG');
    return this.db.withTransaction(async (client) => {
      const userResult = await client.query(`SELECT id, status FROM app_users WHERE id = $1`, [userId]);
      if (!userResult.rowCount || userResult.rows[0].status !== 'ACTIVE') throw new NotFoundException('Active user not found');
      const walletResult = await client.query(
        `INSERT INTO wallets (user_id, currency) VALUES ($1, $2) RETURNING id, user_id, currency, status, created_at`,
        [userId, code],
      );
      const wallet = walletResult.rows[0];
      await client.query(`INSERT INTO ledger_accounts (wallet_id, account_code, account_type, currency) VALUES ($1, $2, 'WALLET', $3)`, [wallet.id, `wallet:${wallet.id}`, code]);
      return { id: wallet.id, ownerId: userId, currency: wallet.currency, status: wallet.status, createdAt: wallet.created_at };
    });
  }

  async listWallets(userId: string) {
    const result = await this.db.query(
      `SELECT w.id, w.user_id AS "ownerId", w.currency, w.status, w.created_at AS "createdAt"
       FROM wallets w WHERE w.user_id = $1 ORDER BY w.created_at DESC`, [userId],
    );
    return result.rows;
  }

  async getWallet(walletId: string, userId: string) {
    const result = await this.db.query(
      `SELECT w.id, u.external_ref AS "ownerId", w.currency, w.status,
              w.created_at AS "createdAt",
              COALESCE(SUM(CASE WHEN p.side = 'DEBIT' THEN p.amount_minor
                                ELSE -p.amount_minor END), 0)::text AS "balanceMinor"
       FROM wallets w
       JOIN app_users u ON u.id = w.user_id
       JOIN ledger_accounts a ON a.wallet_id = w.id AND a.account_type = 'WALLET'
       LEFT JOIN ledger_postings p ON p.account_id = a.id
       WHERE w.id = $1 AND w.user_id = $2
       GROUP BY w.id, u.external_ref`,
      [walletId, userId],
    );
    if (!result.rowCount) throw new NotFoundException('Wallet not found');
    return result.rows[0];
  }

  async listJournals(userId: string) {
    const result = await this.db.query(
      `SELECT j.id, j.entry_type AS type, j.reference, j.status,
              j.description, j.metadata, j.created_at AS "createdAt",
              COALESCE(json_agg(json_build_object(
                'accountId', p.account_id, 'side', p.side,
                'amountMinor', p.amount_minor::text, 'currency', p.currency
              ) ORDER BY p.id) FILTER (WHERE p.id IS NOT NULL), '[]'::json) AS postings
       FROM journal_entries j
       LEFT JOIN ledger_postings p ON p.journal_entry_id = j.id
       WHERE EXISTS (SELECT 1 FROM wallets w JOIN ledger_accounts a ON a.wallet_id = w.id WHERE w.user_id = $1 AND a.id = p.account_id)
       GROUP BY j.id
       ORDER BY j.created_at DESC`, [userId],
    );
    return result.rows;
  }

  async demoCredit(walletId: string, userId: string, amountInput: string, referenceInput: string) {
    const amount = this.parseAmount(amountInput);
    const reference = typeof referenceInput === 'string' ? referenceInput.trim() : '';
    if (!reference) throw new BadRequestException('reference is required');

    return this.db.withTransaction(async (client) => {
      const walletResult = await client.query(
        `SELECT w.id, w.user_id, w.currency, w.status, a.id AS account_id
         FROM wallets w JOIN ledger_accounts a ON a.wallet_id = w.id AND a.account_type = 'WALLET'
         WHERE w.id = $1 AND w.user_id = $2 FOR UPDATE OF w`,
        [walletId, userId],
      );
      if (!walletResult.rowCount) throw new NotFoundException('Wallet not found');
      const wallet = walletResult.rows[0];
      if (wallet.status !== 'ACTIVE') throw new UnprocessableEntityException('Wallet is not active');

      const existing = await client.query(
        `SELECT j.id, j.metadata, p.amount_minor::text AS amount_minor
         FROM journal_entries j JOIN ledger_postings p ON p.journal_entry_id = j.id
         WHERE j.entry_type = 'DEMO_CREDIT' AND j.reference = $1
         ORDER BY p.id LIMIT 1`,
        [reference],
      );
      if (existing.rowCount) {
        const row = existing.rows[0];
        if (row.metadata?.walletId !== walletId || row.amount_minor !== amount) {
          throw new ConflictException('reference already used with different details');
        }
        return { journalEntryId: row.id, walletId, amountMinor: amount, replay: true };
      }

      const clearing = await this.ensureSystemAccount(client, `demo-issuance:${wallet.currency}`, 'DEMO_ISSUANCE', wallet.currency);
      const journalId = randomUUID();
      await client.query(
        `INSERT INTO journal_entries (id, entry_type, reference, description, metadata)
         VALUES ($1, 'DEMO_CREDIT', $2, 'Simulated demo funding only', $3::jsonb)`,
        [journalId, reference, JSON.stringify({ walletId, environment: 'demo-only' })],
      );
      await client.query(
        `INSERT INTO ledger_postings (journal_entry_id, account_id, side, amount_minor, currency)
         VALUES ($1, $2, 'DEBIT', $3, $4), ($1, $5, 'CREDIT', $3, $4)`,
        [journalId, wallet.account_id, amount, wallet.currency, clearing.id],
      );
      return { journalEntryId: journalId, walletId, amountMinor: amount, replay: false };
    });
  }

  async transfer(input: {
    fromWalletId: string; toWalletId: string; amountMinor: string;
    currency: string; idempotencyKey: string; userId: string;
  }) {
    const key = typeof input.idempotencyKey === 'string' ? input.idempotencyKey.trim() : '';
    if (!key) throw new BadRequestException('Idempotency-Key header is required');
    if (key.length > 128) throw new BadRequestException('Idempotency-Key must be at most 128 characters');
    const amount = this.parseAmount(input.amountMinor);
    const currency = typeof input.currency === 'string' ? input.currency.trim().toUpperCase() : '';
    if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestException('currency must be a 3-letter code');
    const fingerprint = createHash('sha256').update([
      input.userId, input.fromWalletId, input.toWalletId, amount, currency,
    ].join('|')).digest('hex');

    return this.db.withTransaction(async (client) => {
      // Serialize requests sharing the same key, including across app instances.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
      const prior = await client.query(
        `SELECT request_hash, response_body FROM idempotency_keys WHERE idempotency_key = $1`,
        [key],
      );
      if (prior.rowCount) {
        if (prior.rows[0].request_hash !== fingerprint) {
          throw new ConflictException('Idempotency-Key was already used for a different request');
        }
        return { ...prior.rows[0].response_body, idempotentReplay: true };
      }

      if (input.fromWalletId === input.toWalletId) {
        throw new BadRequestException('Source and destination wallets must differ');
      }
      // Stable lock order reduces deadlock risk.
      const ids = [input.fromWalletId, input.toWalletId].sort();
      const walletRows = await client.query(
        `SELECT w.id, w.user_id, w.currency, w.status, a.id AS account_id
         FROM wallets w
         JOIN ledger_accounts a ON a.wallet_id = w.id AND a.account_type = 'WALLET'
         WHERE w.id = ANY($1::uuid[])
         ORDER BY w.id FOR UPDATE OF w`,
        [ids],
      );
      if (walletRows.rowCount !== 2) throw new NotFoundException('Source or destination wallet not found');
      const byId = new Map(walletRows.rows.map((w) => [w.id, w]));
      const from = byId.get(input.fromWalletId)!;
      const to = byId.get(input.toWalletId)!;
      if (from.user_id !== input.userId) throw new NotFoundException('Source wallet not found');
      if (from.status !== 'ACTIVE' || to.status !== 'ACTIVE') {
        throw new UnprocessableEntityException('Both wallets must be active');
      }
      if (from.currency !== currency || to.currency !== currency) {
        throw new UnprocessableEntityException('Currency mismatch; FX is not supported');
      }

      const balanceResult = await client.query(
        `SELECT COALESCE(SUM(CASE WHEN p.side = 'DEBIT' THEN p.amount_minor
                                  ELSE -p.amount_minor END), 0)::text AS balance
         FROM ledger_postings p WHERE p.account_id = $1`,
        [from.account_id],
      );
      if (BigInt(balanceResult.rows[0].balance) < BigInt(amount)) {
        throw new UnprocessableEntityException('Insufficient balance');
      }

      const journalId = randomUUID();
      const transferId = randomUUID();
      await client.query(
        `INSERT INTO journal_entries (id, entry_type, reference, description, metadata)
         VALUES ($1, 'TRANSFER', $2, 'Demo wallet-to-wallet transfer', $3::jsonb)`,
        [journalId, key, JSON.stringify({ fromWalletId: from.id, toWalletId: to.id, environment: 'demo-only' })],
      );
      await client.query(
        `INSERT INTO ledger_postings (journal_entry_id, account_id, side, amount_minor, currency)
         VALUES ($1, $2, 'CREDIT', $3, $4), ($1, $5, 'DEBIT', $3, $4)`,
        [journalId, from.account_id, amount, currency, to.account_id],
      );
      await client.query(
        `INSERT INTO transfers (id, from_wallet_id, to_wallet_id, amount_minor, currency, status, journal_entry_id)
         VALUES ($1, $2, $3, $4, $5, 'COMPLETED', $6)`,
        [transferId, from.id, to.id, amount, currency, journalId],
      );

      const response = {
        transferId, fromWalletId: from.id, toWalletId: to.id,
        amountMinor: amount, currency, status: 'COMPLETED',
        journalEntryId: journalId, idempotentReplay: false,
      };
      await client.query(
        `INSERT INTO idempotency_keys (idempotency_key, request_hash, response_status, response_body)
         VALUES ($1, $2, 201, $3::jsonb)`,
        [key, fingerprint, JSON.stringify(response)],
      );
      return response;
    });
  }

  private async ensureSystemAccount(client: any, code: string, type: string, currency: string) {
    const result = await client.query(
      `INSERT INTO ledger_accounts (account_code, account_type, currency)
       VALUES ($1, $2, $3)
       ON CONFLICT (account_code) DO UPDATE SET account_code = EXCLUDED.account_code
       RETURNING id`,
      [code, type, currency],
    );
    return result.rows[0];
  }

  private parseAmount(value: string): string {
    if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) {
      throw new BadRequestException('amountMinor must be a positive integer string');
    }
    const amount = BigInt(value);
    if (amount <= 0n) throw new BadRequestException('amountMinor must be greater than zero');
    if (amount > 9_000_000_000_000_000_000n) throw new BadRequestException('amountMinor exceeds demo limit');
    return amount.toString();
  }
}
