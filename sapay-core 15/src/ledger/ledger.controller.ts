import { Body, Controller, Get, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { PostgresLedgerService } from '../database/postgres-ledger.service';
type AuthRequest = Request & { user: { userId: string } };
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
  @Get('ledger/journals')
  journals(@Req() req: AuthRequest) { return this.ledger.listJournals(req.user.userId); }
}
