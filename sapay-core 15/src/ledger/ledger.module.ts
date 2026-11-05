import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';
import { DemoController } from './demo.controller';

@Module({
  imports: [AuthModule],
  controllers: [LedgerController, DemoController],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
