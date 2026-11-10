# H2 creation fixture repeatability

Date: 9 November 2026 IST. Branch: Hriday. Test-only correction following dd41945.

An integration rerun failed the listing-change case with CHECKOUT_PERSISTENCE_FAILED because its synthetic UPDATEDLISTINGORDER ID already existed from the preceding run. The real database’s unique PayPal-order constraint behaved correctly. The fixture now derives that ID from its fresh order UUID, as the other creation fixtures do.

PASS: the same 19-case creation suite ran twice consecutively against the same isolated loopback PostgreSQL test database without resetting or deleting prior rows. PASS: pnpm typecheck. Lint also passed during this verification pass. No application logic, request/response contract, schema, credential, private source or PayPal/Render resource changed.

The local cluster had stopped before this pass and initially returned ECONNREFUSED on 127.0.0.1:55432. It was restarted using the existing ignored PostgreSQL 16 cluster and loopback settings. This was not a migration to the installed PostgreSQL 17 service and did not create or reset databases.
