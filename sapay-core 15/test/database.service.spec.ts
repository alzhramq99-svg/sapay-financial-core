import { Pool } from 'pg';
import { DatabaseService } from '../src/database/database.service';

describe('DatabaseService startup', () => {
  let service: DatabaseService;
  const connectionEnvironmentKeys = [
    'DATABASE_URL',
    'PGHOST',
    'PGPORT',
    'PGDATABASE',
    'PGUSER',
    'PGPASSWORD',
    'DATABASE_SSL',
  ];
  let originalEnvironment: Map<string, string | undefined>;

  beforeEach(() => {
    originalEnvironment = new Map(
      connectionEnvironmentKeys.map((key) => [key, process.env[key]]),
    );
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    for (const key of connectionEnvironmentKeys) {
      if (key !== 'DATABASE_URL') delete process.env[key];
    }
    service = new DatabaseService();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    jest.restoreAllMocks();
    for (const [key, value] of originalEnvironment) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('retries a transient connection termination during startup', async () => {
    const query = jest.spyOn(Pool.prototype, 'query');
    query.mockImplementationOnce(() =>
      Promise.reject(
        Object.assign(new Error('Connection terminated unexpectedly'), { code: 'ECONNRESET' }),
      ),
    );
    query.mockImplementationOnce(async () => ({} as never));

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('fails immediately when PostgreSQL rejects the configured password', async () => {
    const query = jest.spyOn(Pool.prototype, 'query');
    query.mockImplementationOnce(() =>
      Promise.reject(Object.assign(new Error('password authentication failed'), { code: '28P01' })),
    );

    await expect(service.onModuleInit()).rejects.toThrow('password authentication failed');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each([
    'postgresql:///test_database',
    'postgresql://test_user@127.0.0.1:5432/',
    'postgresql://127.0.0.1:5432/test_database',
    'postgresql://test_user@127.0.0.1/test_database',
  ])('rejects DATABASE_URL without an explicit host, port, user, and database: %s', async (connectionString) => {
    process.env.DATABASE_URL = connectionString;
    const query = jest.spyOn(Pool.prototype, 'query');

    await expect(service.onModuleInit()).rejects.toThrow(
      'DATABASE_URL must specify a PostgreSQL host, port, user, and database.',
    );
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    'postgresql://test_user@127.0.0.1:5432/test_database?host=localhost',
    'postgresql://test_user@127.0.0.1:5432/test_database?dbname=sapay_demo',
  ])('rejects DATABASE_URL target overrides in query parameters', async (connectionString) => {
    process.env.DATABASE_URL = connectionString;
    const query = jest.spyOn(Pool.prototype, 'query');

    await expect(service.onModuleInit()).rejects.toThrow(
      'DATABASE_URL must not override its target through query parameters.',
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('uses a complete DATABASE_URL when PG* settings are incomplete', async () => {
    process.env.DATABASE_URL = 'postgresql://test_user:test_password@127.0.0.1:5432/test_database';
    process.env.PGHOST = '127.0.0.1';
    delete process.env.PGDATABASE;
    delete process.env.PGUSER;
    const query = jest.spyOn(Pool.prototype, 'query');
    query.mockImplementationOnce(async () => ({} as never));

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('uses complete PG* settings when DATABASE_URL is absent', async () => {
    delete process.env.DATABASE_URL;
    process.env.PGHOST = 'localhost';
    process.env.PGPORT = '5432';
    process.env.PGDATABASE = 'test_database';
    process.env.PGUSER = 'test_user';
    process.env.PGPASSWORD = 'test_password';
    const query = jest.spyOn(Pool.prototype, 'query');
    query.mockImplementationOnce(async () => ({} as never));

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('requires an explicit host, port, database, and user for PG* settings', async () => {
    delete process.env.DATABASE_URL;
    const query = jest.spyOn(Pool.prototype, 'query');
    const missingHostError = 'PGHOST is required when using PG* connection settings.';
    const missingSettingsError = 'PGPORT, PGDATABASE, and PGUSER are required when using PGHOST.';

    process.env.PGPORT = '5432';
    await expect(service.onModuleInit()).rejects.toThrow(missingHostError);

    process.env.PGHOST = 'localhost';
    delete process.env.PGDATABASE;
    delete process.env.PGUSER;
    delete process.env.PGPORT;
    await expect(service.onModuleInit()).rejects.toThrow(missingSettingsError);

    process.env.PGPORT = '5432';
    process.env.PGDATABASE = 'sapay_demo';
    await expect(service.onModuleInit()).rejects.toThrow(missingSettingsError);

    process.env.PGUSER = 'sapay_app';
    delete process.env.PGPORT;
    await expect(service.onModuleInit()).rejects.toThrow(missingSettingsError);

    process.env.PGPORT = '5432';
    delete process.env.PGDATABASE;
    await expect(service.onModuleInit()).rejects.toThrow(missingSettingsError);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects comma-separated PGHOST targets', async () => {
    delete process.env.DATABASE_URL;
    process.env.PGHOST = 'localhost,127.0.0.1';
    process.env.PGPORT = '5432';
    process.env.PGDATABASE = 'test_database';
    process.env.PGUSER = 'test_user';
    const query = jest.spyOn(Pool.prototype, 'query');

    await expect(service.onModuleInit()).rejects.toThrow(
      'PGHOST must specify exactly one PostgreSQL host.',
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects conflicting PG* settings when DATABASE_URL is also set', async () => {
    process.env.DATABASE_URL = 'postgresql://test_user:test_password@127.0.0.1:5432/test_database';
    process.env.PGHOST = 'localhost';
    const query = jest.spyOn(Pool.prototype, 'query');

    await expect(service.onModuleInit()).rejects.toThrow(
      'DATABASE_URL conflicts with the configured PG* connection settings.',
    );
    expect(query).not.toHaveBeenCalled();
  });
});
