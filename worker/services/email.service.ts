// worker/services/email.service.ts

/**
 * Outgoing email, through Cloudflare Email Service.
 *
 * Two things have to be in place before anything is sent: the `send_email`
 * binding named EMAIL in wrangler.jsonc, and EMAIL_FROM set to an address on
 * a domain onboarded under Email Service in the dashboard. Without either,
 * nothing is sent and the reason is logged — see docs/deploy.md, "Email".
 *
 * Locally (ORIGIN on localhost) a message that cannot be sent is
 * printed in full instead, links and all, so a reset or confirmation can be
 * followed without a mail server. Never in production: the links in these
 * messages are as good as a password, and Workers Logs keeps what is logged.
 */

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** The parts of the Worker env this module reads. */
export interface EmailEnv {
  EMAIL?: SendEmail;
  EMAIL_FROM?: string;
  APP_NAME?: string;
  ORIGIN?: string;
}

/** Both halves are configured, so a send can at least be attempted. */
export const canSendEmail = (env: EmailEnv) => Boolean(env.EMAIL && env.EMAIL_FROM?.trim());

/**
 * Running on a developer's machine, judged by ORIGIN (`.dev.vars` sets it to
 * localhost). Unset is not local: printing a live link is only ever safe on
 * a machine nobody else's logs come from.
 */
export const isLocalOrigin = (env: EmailEnv) => {
  if (!env.ORIGIN) return false;
  try {
    const { hostname } = new URL(env.ORIGIN);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
};

/**
 * Whether a flow that depends on email (password reset, confirming an
 * address) can work here: email is configured, or this is local development,
 * where the message is printed instead.
 */
export const emailFlowsAvailable = (env: EmailEnv) => canSendEmail(env) || isLocalOrigin(env);

/**
 * Send one message. Resolves `true` once it has gone where mail goes here
 * (Email Service, or the console in local development) and `false` when it
 * could not be sent. Never throws, so a failed send cannot break the request
 * that asked for it; a caller that must tell the user decides from the result.
 */
export async function sendEmail(env: EmailEnv, email: OutgoingEmail): Promise<boolean> {
  if (!canSendEmail(env)) {
    if (isLocalOrigin(env)) {
      console.log(
        `[email] Not configured, so printed instead. To: ${email.to}\n` +
          `Subject: ${email.subject}\n\n${email.text}`,
      );
      return true;
    }
    console.warn(
      `[email] "${email.subject}" was not sent: set EMAIL_FROM and the EMAIL send_email ` +
        "binding (docs/deploy.md, Email).",
    );
    return false;
  }

  const from = env.EMAIL_FROM!.trim();
  try {
    await env.EMAIL!.send({
      from: { email: from, name: env.APP_NAME || from },
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    return true;
  } catch (e) {
    // `code` says why (E_SENDER_DOMAIN_NOT_AVAILABLE, E_RECIPIENT_PLAN_RESTRICTED,
    // E_RATE_LIMIT_EXCEEDED, ...). Not the recipient: logs outlive the request.
    const code = (e as { code?: string })?.code ?? "unknown";
    console.error(`[email] "${email.subject}" failed (${code}): ${(e as Error)?.message}`);
    return false;
  }
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!,
  );

/**
 * A message whose point is one link: a sentence or two, the link, and what
 * to do if it was not you. Plain text plus the same in minimal HTML, with no
 * colours or images, so it reads in any mail client and in its dark mode.
 */
export function linkEmail(opts: {
  to: string;
  subject: string;
  intro: string;
  action: string;
  url: string;
  outro: string;
}): OutgoingEmail {
  const { to, subject, intro, action, url, outro } = opts;
  return {
    to,
    subject,
    text: `${intro}\n\n${url}\n\n${outro}\n`,
    html:
      `<p>${escapeHtml(intro)}</p>` +
      `<p><a href="${escapeHtml(url)}">${escapeHtml(action)}</a></p>` +
      `<p>Or paste this into your browser:<br>${escapeHtml(url)}</p>` +
      `<p>${escapeHtml(outro)}</p>`,
  };
}
