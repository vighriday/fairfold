export function testDatabaseUrl(environment: NodeJS.ProcessEnv = process.env): string | undefined {
  if (environment.FAIRFOLD_RUN_DB_TESTS !== 'true') return undefined;
  if (!environment.TEST_DATABASE_URL)
    throw new Error('TEST_DATABASE_URL is required for database tests');
  const url = new URL(environment.TEST_DATABASE_URL);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !/^\/fairfold_[a-z0-9_]*test$/.test(url.pathname)
  ) {
    throw new Error(
      'Database tests require an isolated loopback PostgreSQL fairfold_*test database',
    );
  }
  return environment.TEST_DATABASE_URL;
}
