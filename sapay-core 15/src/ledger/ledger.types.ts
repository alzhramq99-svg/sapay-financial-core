export type CurrencyCode = string;

export interface Wallet {
  id: string;
  ownerId: string;
  currency: CurrencyCode;
  createdAt: string;
}

export interface Posting {
  accountId: string;
  side: 'DEBIT' | 'CREDIT';
  amountMinor: string;
  currency: CurrencyCode;
}

export interface JournalEntry {
  id: string;
  type: 'DEMO_CREDIT' | 'TRANSFER';
  reference: string;
  createdAt: string;
  postings: Posting[];
  metadata?: Record<string, string>;
}

export interface TransferResult {
  transferId: string;
  fromWalletId: string;
  toWalletId: string;
  amountMinor: string;
  currency: CurrencyCode;
  status: 'COMPLETED';
  journalEntryId: string;
  idempotentReplay: boolean;
}
