import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { PostgresLedgerService } from '../database/postgres-ledger.service';
type AuthRequest = Request & { user: { userId: string } };
@Controller('demo')
@UseGuards(AuthGuard)
export class DemoController {
  constructor(private readonly ledger: PostgresLedgerService) {}
  @Post('wallets')
  createWallet(@Req() req: AuthRequest, @Body() body: { currency: string }) {
    return this.ledger.createWallet(req.user.userId, body?.currency);
  }
  @Get('wallets')
  listWallets(@Req() req: AuthRequest) { return this.ledger.listWallets(req.user.userId); }
  @Get('wallets/:id')
  getWallet(@Req() req: AuthRequest, @Param('id') id: string) { return this.ledger.getWallet(id, req.user.userId); }
  @Post('wallets/:id/credit')
  demoCredit(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: { amountMinor: string; reference: string }) {
    return this.ledger.demoCredit(id, req.user.userId, body?.amountMinor, body?.reference);
  }
}
