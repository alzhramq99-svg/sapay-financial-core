import { Body, Controller, Get, Headers, Post, Req, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { PostgresLedgerService } from '../database/postgres-ledger.service';
type AuthRequest = Request & { user: { userId: string } };
// Simulated external transfers need database/migrations/002_external_demo_transfers.sql,
// which DB_AUTO_MIGRATE does not apply. Without it the insert fails with a raw
// PostgreSQL error (HTTP 500). Keep the endpoint off unless the operator has
// applied the migration and opted in explicitly.
export function externalTransfersEnabled(): boolean {
  return process.env.EXTERNAL_TRANSFERS_ENABLED === 'true';
}
@Controller()
export class LedgerController {
  constructor(private readonly ledger: PostgresLedgerService) {}
  @Get('health')
  health() { return {status:'ok',mode:'DEMO_ONLY',storage:'postgresql',realMoneyEnabled:false,bankIntegrationsEnabled:false}; }
  @UseGuards(AuthGuard)
  @Post('transfers')
  transfer(@Req() req: AuthRequest, @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: {fromWalletId:string;toWalletId:string;amountMinor:string;currency:string}) {
    return this.ledger.transfer({...body,userId:req.user.userId,idempotencyKey:idempotencyKey??''});
  }
  @UseGuards(AuthGuard)
  @Post('transfers/external')
  externalTransfer(@Req() req: AuthRequest, @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: {fromWalletId:string;amountMinor:string;currency:string;destinationType:'SUDAN_BANK'|'GLOBAL';provider:string;beneficiaryName:string;destinationReference:string;destinationCountry?:string}) {
    if (!externalTransfersEnabled()) {
      throw new ServiceUnavailableException('External demo transfers are not available in this environment.');
    }
    return this.ledger.externalTransfer({...body,userId:req.user.userId,idempotencyKey:idempotencyKey??''});
  }
  @UseGuards(AuthGuard)
  @Get('ledger/journals')
  journals(@Req() req: AuthRequest) { return this.ledger.listJournals(req.user.userId); }
}
