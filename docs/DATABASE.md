# Database migrations

SignalForge uses Prisma Migrate for PostgreSQL schema changes.

## First-time setup

1. Create an empty PostgreSQL database.
2. Configure `DATABASE_URL` in the environment.
3. Install dependencies and generate the Prisma Client.
4. Apply the committed migration history:

```bash
pnpm install
pnpm db:generate
pnpm db:deploy
```

The initial migration at `apps/web/prisma/migrations/20261121063000_initial/migration.sql` creates the current control-plane and event-ingestion schema, including the project-scoped event uniqueness constraint.

## Development workflow

For subsequent schema changes:

1. Update `apps/web/prisma/schema.prisma`.
2. Create a migration against a local development database with `pnpm db:migrate`.
3. Review the generated SQL for destructive changes, missing indexes, and tenant-boundary implications.
4. Commit both the Prisma schema and its migration directory.
5. Apply committed migrations in shared environments with `pnpm db:deploy`.

Do not edit an already-applied migration. Add a new migration for follow-up changes.

## CI verification

GitHub Actions provisions an ephemeral PostgreSQL 16 service and runs `pnpm db:deploy` after generating the Prisma Client and validating the schema. This checks that the committed migration SQL can be applied to a clean database before lint, typecheck, and build run.

The CI database is disposable and contains no production data. Production migration rollout remains an explicit operational step; this workflow does not deploy the application.
