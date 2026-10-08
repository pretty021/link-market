// Tests run against a real PostgreSQL database (row locks and now() matter here, so no mocks).
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error('Set TEST_DATABASE_URL to a disposable PostgreSQL database (all tables are truncated).');
}
// Enough pooled connections for the 50-way Confirm race.
process.env.DATABASE_URL = url.includes('connection_limit') ? url : `${url}${url.includes('?') ? '&' : '?'}connection_limit=60`;
