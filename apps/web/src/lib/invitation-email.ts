type InvitationEmailInput = {
  email: string;
  organizationName: string;
  inviterName: string;
  role: string;
  acceptanceUrl: string;
  expiresAt: Date;
};

type DeliveryResult = { delivered: true } | { delivered: false; reason: "NOT_CONFIGURED" };

export async function sendOrganizationInvitationEmail(input: InvitationEmailInput): Promise<DeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return { delivered: false, reason: "NOT_CONFIGURED" };

  const expires = input.expiresAt.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: `Invitation to join ${input.organizationName} on SignalForge`,
      text: [
        `${input.inviterName} invited you to join ${input.organizationName} as ${input.role}.`,
        "",
        "Accept your invitation using this secure, single-use link:",
        input.acceptanceUrl,
        "",
        `This invitation expires at ${expires}.`,
        "If you were not expecting this invitation, you can ignore this email.",
      ].join("\n"),
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    // Do not log the invitation URL, token, recipient payload, or provider response.
    throw new Error("INVITATION_EMAIL_DELIVERY_FAILED");
  }
  return { delivered: true };
}
