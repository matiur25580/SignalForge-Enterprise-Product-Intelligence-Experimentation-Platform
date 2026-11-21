# Identity and organization API

## Local setup

1. Copy the root .env.example to .env and configure PostgreSQL and GitHub OAuth credentials.
2. Run pnpm install from the repository root.
3. Run pnpm --filter @signalforge/web db:generate.
4. Run pnpm --filter @signalforge/web db:migrate.
5. Start the web app with pnpm dev.

GitHub OAuth callback for local development:
http://localhost:3000/api/auth/callback/github

## Endpoints

### GET /api/organizations

Returns organizations for the authenticated user, including their role in each organization.

### POST /api/organizations

Creates an organization and makes the authenticated user its owner.

Request body:
{ "name": "Acme Product", "slug": "acme-product" }

### GET /api/organizations/:organizationId/projects

Lists projects only after verifying organization membership.

### POST /api/organizations/:organizationId/projects

Creates a project. Only OWNER and ADMIN members may create projects.

Request body:
{
  "name": "Web Store",
  "slug": "web-store",
  "environment": "DEVELOPMENT"
}

All tenant-scoped lookups derive the user from the Auth.js session. Never use a client-provided user ID or role as an authorization shortcut.
