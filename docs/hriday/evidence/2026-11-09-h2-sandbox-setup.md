# H2 minimal sandbox setup evidence

Observed 9 November 2026 IST on Hriday. Architecture H2/F1 and the original Neel/hoodie definition govern this increment; the full B17 seed remains H8.

- PASS: nine PostgreSQL setup cases, including initial encrypted credentials, repeat/concurrent execution and rejection of client/secret/key/simulation/price/currency/slug conflicts. The complete database suite passed **111 cases**.
- PASS: eleven offline operator-configuration cases enforce the exact sandbox origin, complete credentials, demo mode, a local Fairfold database and safe symbolic errors.
- PASS: pnpm typecheck.
- SKIPPED: pnpm setup:sandbox with the actual absent local sandbox credentials. It made no database or vendor operation.
- NOT RUN: real account provisioning, OAuth, SDK purchase, A4 and real recorded responses.

The setup command inserts only Neel and HD-IND-01 at USD38.00. It preserves an existing compatible listing and encrypted secret, serializes concurrent setup in PostgreSQL, and rolls back on conflicts. It does not rotate credentials, map Maya, seed buyers/history/batches or register webhooks. Test data is synthetic in the isolated loopback test database and is removed by its fixture.
