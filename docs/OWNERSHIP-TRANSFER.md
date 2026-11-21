# Organization ownership transfer

## Endpoint

`POST /api/organizations/:organizationId/ownership-transfer`

Requires an authenticated organization OWNER. ADMIN, MEMBER, and VIEWER roles cannot initiate this operation.

Request body:

```json
{
  "targetMemberId": "an-existing-organization-member-id",
  "confirmation": "TRANSFER OWNERSHIP"
}
```

The target must be an existing member of the same organization and cannot be the current owner. Pending invitations and users outside the organization are not eligible.

## Transaction guarantees

The service performs three operations in one Prisma transaction:

1. Conditionally changes the current OWNER membership to ADMIN.
2. Conditionally promotes the selected member from their observed role to OWNER.
3. Writes an `organization.ownership.transferred` audit event.

If either conditional membership update affects anything other than exactly one row, the transaction aborts and returns HTTP 409. This prevents a stale request from partially changing ownership. The previous owner remains an administrator and can continue managing the workspace.

## User experience and safety

The team page exposes the transfer action only to the current OWNER. The user must type the exact phrase `TRANSFER OWNERSHIP`; cancelling or entering a different phrase does not send the request. The API independently enforces the exact phrase and role check, so client-side controls are not treated as authorization.

The audit record includes the previous and new owner user IDs and the previous target role. No credentials or invitation tokens are involved.

## Verification

Automated route tests cover successful transactional handoff, authorization, organization membership scope, exact confirmation, and rollback on a concurrent membership change.
