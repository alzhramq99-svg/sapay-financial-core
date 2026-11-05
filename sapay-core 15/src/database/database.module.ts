import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { PostgresLedgerService } from './postgres-ledger.service';

@Global()
@Module({
  providers: [DatabaseService, PostgresLedgerService],
  exports: [DatabaseService, PostgresLedgerService],
})
export class DatabaseModule {}
