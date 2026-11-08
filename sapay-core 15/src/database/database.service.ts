import { Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

const STARTUP_CONNECTION_ATTEMPTS = 5;
const STARTUP_RETRY_DELAY_MS = 1000;
const NON_RETRYABLE_DATABASE_CODES = new Set(['28P01', '28000', '3D000']);

function getDatabaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

/**
 * PostgreSQL connection pool. This is the connection layer only.
 * The existing LedgerService remains in-memory until its repository is migrated.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool?: Pool;

  async onModuleInit(): Promise<void> {
    const connectionString = process.env.DATABASE_URL?.trim() || undefined;
    const configuredPgSettings = [
      'PGHOST',
      'PGPORT',
      'PGDATABASE',
      'PGUSER',
      'PGPASSWORD',
    ].some((key) => process.env[key] !== undefined && process.env[key] !== '');
    const host = process.env.PGHOST?.trim();
    if (!connectionString && !configuredPgSettings) {
      this.logger.warn('Database connection settings are not set; PostgreSQL connection is disabled.');
      return;
    }

    let parsedConnectionString: URL | undefined;
    if (connectionString) {
      try {
        parsedConnectionString = new URL(connectionString);
      } catch {
        throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
      }
      if (
        !['postgres:', 'postgresql:'].includes(parsedConnectionString.protocol) ||
        !parsedConnectionString.hostname ||
        parsedConnectionString.hostname.includes(',') ||
        !parsedConnectionString.username ||
        parsedConnectionString.pathname.length <= 1 ||
        !parsedConnectionString.port ||
        parsedConnectionString.hash
      ) {
        throw new Error('DATABASE_URL must specify a PostgreSQL host, port, user, and database.');
      }
      const targetQueryParameters = [
        'host',
        'hostaddr',
        'port',
        'database',
        'dbname',
        'user',
        'username',
        'password',
        'passfile',
        'service',
        'servicefile',
      ];
      const targetQueryParameterSet = new Set(targetQueryParameters);
      if (
        Array.from(parsedConnectionString.searchParams.keys()).some((key) =>
          targetQueryParameterSet.has(key.toLowerCase()),
        )
      ) {
        throw new Error('DATABASE_URL must not override its target through query parameters.');
      }
    }

    const portInput = process.env.PGPORT?.trim();
    let pgPort: number | undefined;
    if (portInput) {
      pgPort = Number(portInput);
      if (!/^\d+$/.test(portInput) || !Number.isInteger(pgPort) || pgPort < 1 || pgPort > 65535) {
        throw new Error('PGPORT must be an integer between 1 and 65535.');
      }
    }
    const database = process.env.PGDATABASE?.trim();
    const user = process.env.PGUSER?.trim();
    const password = process.env.PGPASSWORD;
    let pgSettings: { host: string; port: number; database: string; user: string; password?: string } | undefined;
    if (!connectionString) {
      if (!host) {
        throw new Error('PGHOST is required when using PG* connection settings.');
      }
      if (host.includes(',')) {
        throw new Error('PGHOST must specify exactly one PostgreSQL host.');
      }
      if (!pgPort || !database || !user) {
        throw new Error('PGPORT, PGDATABASE, and PGUSER are required when using PGHOST.');
      }
      pgSettings = { host, port: pgPort, database, user, password };
    }
    if (parsedConnectionString) {
      let urlUser: string;
      let urlDatabase: string;
      let urlPassword: string;
      try {
        urlUser = decodeURIComponent(parsedConnectionString.username);
        urlDatabase = decodeURIComponent(parsedConnectionString.pathname.slice(1));
        urlPassword = decodeURIComponent(parsedConnectionString.password);
      } catch {
        throw new Error('DATABASE_URL contains invalid encoded connection values.');
      }
      const normalizeHost = (value: string) => value.toLowerCase().replace(/^\[|\]$/g, '');
      const conflictingPgSetting =
        (host !== undefined &&
          host !== '' &&
          normalizeHost(host) !== normalizeHost(parsedConnectionString.hostname)) ||
        (pgPort !== undefined && pgPort !== Number(parsedConnectionString.port)) ||
        (database !== undefined && database !== '' && database !== urlDatabase) ||
        (user !== undefined && user !== '' && user !== urlUser) ||
        (password !== undefined && password !== urlPassword);
      if (conflictingPgSetting) {
        throw new Error('DATABASE_URL conflicts with the configured PG* connection settings.');
      }
    }
    const connectionConfig = connectionString ? { connectionString } : pgSettings;
    if (!connectionConfig) {
      throw new Error('PostgreSQL connection settings are incomplete.');
    }
    this.pool = new Pool({
      ...connectionConfig,
      max: 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      application_name: 'sapay-demo-api',
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
    });
    this.pool.on('error', (error) => this.logger.error(`PostgreSQL idle client error: ${error.message}`));
    for (let attempt = 1; attempt <= STARTUP_CONNECTION_ATTEMPTS; attempt++) {
      try {
        await this.pool.query('SELECT 1');
        if (process.env.DB_AUTO_MIGRATE === 'true') {
          const schemaPath = join(process.cwd(), 'database', 'init', '001_schema.sql');
          const schemaSql = readFileSync(schemaPath, 'utf8');
          await this.pool.query(schemaSql);
          this.logger.log('Demo database schema migration applied.');
        }
        this.logger.log('PostgreSQL connection established (demo environment).');
        return;
      } catch (error) {
        const code = getDatabaseErrorCode(error);
        if (
          attempt === STARTUP_CONNECTION_ATTEMPTS ||
          (code !== undefined && NON_RETRYABLE_DATABASE_CODES.has(code))
        ) {
          this.logger.error(`PostgreSQL startup connection failed${code ? ` (${code})` : ''}.`);
          throw error;
        }

        const delayMs = STARTUP_RETRY_DELAY_MS * 2 ** (attempt - 1);
        this.logger.warn(
          `PostgreSQL startup connection attempt ${attempt} failed; retrying in ${delayMs}ms${code ? ` (${code})` : ''}.`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  get isConfigured(): boolean {
    return Boolean(this.pool);
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new ServiceUnavailableException('Database is not configured; set DATABASE_URL and start PostgreSQL');
    }
    return this.pool.query<T>(sql, params);
  }

  async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) {
      throw new ServiceUnavailableException('Database is not configured; set DATABASE_URL and start PostgreSQL');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async ping(): Promise<{ configured: boolean; reachable: boolean }> {
    if (!this.pool) return { configured: false, reachable: false };
    try {
      await this.pool.query('SELECT 1');
      return { configured: true, reachable: true };
    } catch {
      return { configured: true, reachable: false };
    }
  }
}
