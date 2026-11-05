import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { LedgerModule } from './ledger/ledger.module';
import { DatabaseModule } from './database/database.module';
import { DatabaseController } from './database/database.controller';
import { RateLimitMiddleware } from './security/rate-limit.middleware';
@Module({ imports:[DatabaseModule,AuthModule,LedgerModule],controllers:[DatabaseController],providers:[RateLimitMiddleware] })
export class AppModule implements NestModule {
 configure(consumer:MiddlewareConsumer) { consumer.apply(RateLimitMiddleware).forRoutes('*'); }
}
