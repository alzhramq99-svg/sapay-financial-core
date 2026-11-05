import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Controller('database')
export class DatabaseController {
  constructor(private readonly database: DatabaseService) {}

  @Get('health')
  health() {
    return this.database.ping();
  }
}
