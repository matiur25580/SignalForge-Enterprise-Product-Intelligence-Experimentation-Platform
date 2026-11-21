# Organization team management and invitations

SignalForge supports secure, organization-scoped team invitations with role assignment and audited lifecycle actions.

## Invitation lifecycle

1. An authenticated organization OWNER or ADMIN creates an invitation for an email address.
2. The API normalizes the address, limits the assignable role to ADMIN, MEMBER, or VIEWER, and creates a cryptographically random one-time token.
3. Only a SHA-256 hash of the token is stored. The raw token is returned once in the create response so an operator can deliver it through an approved secure channel.
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

Allowed roles: `ADMIN`, `MEMBER`, `VIEWER`. OWNER cannot be assigned by invitation.

The 201 response includes `acceptanceToken` exactly once. Deliver it securely to the intended invitee. SignalForge does not yet send invitation email automatically; email delivery provider integration is a separate roadmap item.

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

- No email provider integration or automated delivery.
- No self-service invitation acceptance UI yet; API is available.
- Organization member role changes and member removal are not yet implemented.
- The GitHub OAuth account email is used as the invitation identity.
