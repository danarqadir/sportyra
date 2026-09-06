# Database Migrations

The repository uses versioned Drizzle migrations in `./drizzle`. Migration files and
their metadata are tracked in git and must be committed together with schema changes.

## Production / deployment entrypoint

Use the idempotent deploy runner. It safely handles every database state:

```text
pnpm db:migrate:deploy
```

(or directly: `node lib/db/scripts/migrate-deploy.mjs`)

Behavior:

- **Fresh (empty) database**: applies the full baseline schema (`0000`) then pending
  migrations (`0001`, ...).
- **Existing populated database with no migration history**: verifies the expected
  baseline tables exist, records the baseline as already present without re-running it,
  then applies pending migrations. It refuses partial databases.
- **Already migrated database**: applies only pending migrations (a no-op when current).

The production Docker image runs `migrate-deploy.mjs` before starting the API server.

## Manual / local usage

Fresh database:

```text
pnpm db:migrate
```

Existing populated database (manual adoption):

```text
pnpm --filter @workspace/db baseline-existing
pnpm db:migrate
```

`baseline-existing` refuses partial databases and refuses to alter an existing Drizzle
migration history.

## Generating new migrations

After changing `lib/db/src/schema/**`:

```text
pnpm db:generate
```

Then verify:

```text
pnpm db:check
```

Production schema changes must use `db:migrate`/`db:migrate:deploy`, not `db:push` or
`db:push-force` (which are development-only conveniences).