# Organization team management and invitations

SignalForge supports secure, organization-scoped team invitations with role assignment and audited lifecycle actions.

## Invitation lifecycle

1. An authenticated organization OWNER or ADMIN creates an invitation for an email address.
2. The API normalizes the address, limits the assignable role to ADMIN, MEMBER, or VIEWER, and creates a cryptographically random one-time token.
3. Only a SHA-256 hash of the token is stored. When Resend is configured, SignalForge sends a single-use acceptance link by email and does not return the raw token. Without email configuration, the API returns the complete acceptance URL once for secure manual delivery.
4. The invitee signs in with GitHub using the same email address and submits the token to the acceptance endpoint.
5. The API verifies token hash, email match, expiry, and pending state, then atomically marks the invitation accepted, creates organization membership, and writes an audit record.
6. OWNER/ADMIN users can list and revoke pending invitations. Expired or revoked invitations cannot be accepted.

Invitations expire after seven days. A previously expired or revoked invitation for the same organization/email can be reissued; a still-pending invitation cannot be silently replaced. Existing organization members cannot be invited again.

## API

All organization routes require an authenticated session and organization membership.

### List invitations

`GET /api/organizations/:organizationId/invitations`

Returns up to 100 newest invitations, including lifecycle status. Token hashes and raw secrets are never returned.

### Create or reissue an invitation

`POST /api/organizations/:organizationId/invitations`

Requires OWNER or ADMIN.

```json
{
  "email": "analyst@example.com",
  "role": "MEMBER"
}
```

Allowed roles: `ADMIN`, `MEMBER`, `VIEWER`. OWNER cannot be assigned by invitation. Only an OWNER can issue an ADMIN invitation.

When `RESEND_API_KEY` and `EMAIL_FROM` are configured, the 201 response reports `delivery: EMAIL_SENT`; the token is never returned to the caller. Without those settings, the response reports `delivery: MANUAL` and includes `acceptanceUrl` exactly once. Email delivery failures return 502 without exposing the token; resend the invitation after checking provider configuration.

### Revoke an invitation

`DELETE /api/organizations/:organizationId/invitations/:invitationId`

Requires OWNER or ADMIN. Only pending, unexpired invitations can be revoked. The operation is conditional to protect against concurrent acceptance.

### Accept an invitation

`POST /api/invitations/accept`

Requires a signed-in user whose account email matches the invitation email.

```json
{
  "token": "sf_inv_<one-time-secret>"
}
```

Acceptance is single-use and transactional. The endpoint rejects unknown, mismatched, expired, revoked, or already accepted invitations.

## Member administration

### List organization members

`GET /api/organizations/:organizationId/members`

Any organization member can view the directory. The response includes member role, join time, and basic profile fields.

### Change a member role

`PATCH /api/organizations/:organizationId/members/:memberId`

Requires OWNER or ADMIN.

```json
{
  "role": "VIEWER"
}
```

Only OWNER can grant or revoke ADMIN. ADMIN can manage MEMBER and VIEWER roles only. The OWNER role cannot be changed through this endpoint; ownership transfer requires a dedicated workflow.

### Remove a member

`DELETE /api/organizations/:organizationId/members/:memberId`

OWNER can remove non-owner members. ADMIN can remove MEMBER and VIEWER only. Owner removal is blocked until an explicit ownership-transfer workflow exists. Role changes and removals use conditional writes and transactional audit records.

## Security properties

- 256-bit random token material generated with Node.js crypto.
- SHA-256 token hash persisted; plaintext token is never stored.
- Email normalization and exact authenticated-account email match.
- OWNER role cannot be granted through invitation.
- Organization ID is derived from the invitation token, not caller input.
- Conditional database updates prevent acceptance/revocation races.
- Invitation creation, reissue, acceptance, and revocation are audited.
- List responses never expose token hashes.

## Current limitations

- Resend is the supported email adapter; configure `RESEND_API_KEY`, `EMAIL_FROM`, and the externally reachable `AUTH_URL`/`NEXTAUTH_URL` to enable delivery.
- The authenticated team-management UI supports invite creation, one-time token copying, member role changes/removal, and pending invitation revocation.\n- No invitee-facing invitation acceptance UI or automatic email delivery yet; the acceptance API is available.
- Organization member role changes and member removal are not yet implemented.
- The GitHub OAuth account email is used as the invitation identity.
