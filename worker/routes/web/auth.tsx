// worker/routes/web/auth.ts
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";

import { Home } from "@server/views/pages/Home";
import { Login } from "@server/views/pages/Login";
import { Register } from "@server/views/pages/Register";
import type { AppEnv } from "../../types";
import { flashToast, htmxRedirect } from "@server/lib/htmx-helpers";
import { websiteSchema } from "@server/lib/structured-data";
import { firstIssue } from "@server/lib/validator";
import { logAndSanitise } from "@server/lib/errors";
import { authRateLimit } from "@server/middleware/rate-limit.middleware";
import { emailFlowsAvailable } from "@server/services/email.service";
import {
  EmailLinkPage,
  ForgotPasswordCard,
  ResetPasswordCard,
  VerifyEmailCard,
} from "@server/views/pages/EmailLinks";

export const webAuth = new Hono<AppEnv>();

webAuth.get("/", (c) => {
  const { app } = c.var;

  return c.render(<Home />, {
    // The home page is the site's own entry in search results. The site name
    // alone tells a searcher who has never heard of it nothing, so the title
    // says what the site is — "{tagline} · {name}" — and the tagline doubles
    // as the description. A real site should write both for its home page.
    title: app.tagline || undefined,
    description: app.tagline,
    type: "website",
    jsonLd: [websiteSchema(app)],
  });
});

webAuth.get("/register", async (c) => {
  const { auth, authConfig } = c.var;
  if (auth.user) return c.redirect("/");

  // With SINGLE_ACCOUNT on, the form only exists until the owner has signed
  // up. The API refuses regardless; this just avoids offering a form that
  // cannot succeed.
  if (!(await auth.isRegistrationOpen())) return c.redirect("/login");

  const props = {
    methods: Array.from(authConfig.methods),
    // A restricted role would only be refused on submit, so do not offer it.
    roles: (authConfig.roles?.available || ["user"]).filter(
      (role) => !(authConfig.roles?.restricted || []).includes(role),
    ),
    defaultRole: authConfig.roles?.default || "user",
    // The form should state the rule it will be judged by. Without this the
    // page advertised a minimum of 8 while the server enforced whatever
    // PASSWORD_MIN_LENGTH said, so the only way to learn the real rule was to
    // be rejected by it.
    passwordPolicy: authConfig.password,
  };
  return c.render(<Register {...props} />, {
    title: "Create Account",
  });
});

webAuth.get("/login", async (c) => {
  const { auth, authConfig } = c.var;
  if (auth.user) return c.redirect("/");

  const props = {
    methods: Array.from(authConfig.methods),
    registrationOpen: await auth.isRegistrationOpen(),
    passwordReset: emailFlowsAvailable(c.env),
  };
  return c.render(<Login {...props} />, {
    title: "Sign In",
  });
});
webAuth.post("/web/auth/logout", async (c) => {
  // 1. Clear Cookies/Session
  const { auth } = c.var;
  // Awaited: this revokes the session row, and an un-awaited promise can be
  // dropped when the response goes out — leaving a "logged out" user whose
  // token still works.
  await auth.destroySession();

  flashToast(c, "Logged out successfully", {
    type: "success",
  });
  htmxRedirect(c, "/login");
  return c.body(null);
});

// ==========================================
// EMAILED LINKS: FORGOT PASSWORD, CONFIRM EMAIL
// ==========================================

/**
 * A card from views/pages/EmailLinks. Its own form names it as the HTMX
 * target and gets the card alone; anything else, a boosted link or a plain
 * form post included, gets the whole page.
 */
const card = (c: Context<AppEnv>, id: string, title: string, node: unknown) =>
  c.req.header("HX-Target") === id
    ? c.html(node as any)
    : c.render(<EmailLinkPage>{node}</EmailLinkPage>, { title });

/**
 * For the two pages whose URL carries a token: nothing the page loads or
 * links to is told the URL it came from.
 */
const hideToken = (c: Context<AppEnv>) => c.header("Referrer-Policy", "no-referrer");

const field = (body: Record<string, unknown>, name: string) =>
  typeof body[name] === "string" ? (body[name] as string) : "";

const forgotForm = z.object({ email: z.email("That email address does not look right") });

webAuth.get("/forgot-password", (c) => {
  if (!c.var.authConfig.methods.has("password")) return c.redirect("/login");
  const state = emailFlowsAvailable(c.env)
    ? { step: "form" as const }
    : { step: "unavailable" as const };
  return card(c, "forgot-card", "Reset your password", <ForgotPasswordCard {...state} />);
});

webAuth.post("/forgot-password", authRateLimit, async (c) => {
  const { auth, authConfig } = c.var;
  if (!authConfig.methods.has("password")) return c.redirect("/login");
  const show = (state: Parameters<typeof ForgotPasswordCard>[0]) =>
    card(c, "forgot-card", "Reset your password", <ForgotPasswordCard {...state} />);

  if (!emailFlowsAvailable(c.env)) return show({ step: "unavailable" });

  const body = await c.req.parseBody();
  const parsed = forgotForm.safeParse({ email: field(body, "email").trim() });
  if (!parsed.success) {
    return show({ step: "form", error: firstIssue(parsed.error), email: field(body, "email") });
  }

  // The same answer whether or not the address has an account, and the work
  // done after the response, so neither the words nor the time tell.
  auth.afterResponse(auth.requestPasswordReset(parsed.data.email));
  return show({ step: "sent", email: parsed.data.email });
});

webAuth.get("/reset-password", (c) => {
  const token = c.req.query("token");
  if (!token || !c.var.authConfig.methods.has("password")) return c.redirect("/forgot-password");
  hideToken(c);
  return card(
    c,
    "reset-card",
    "Choose a new password",
    <ResetPasswordCard step="form" token={token} policy={c.var.authConfig.password} />,
  );
});

webAuth.post("/reset-password", authRateLimit, async (c) => {
  const { auth, authConfig } = c.var;
  hideToken(c);
  const body = await c.req.parseBody();
  const token = field(body, "token");
  if (!token || !authConfig.methods.has("password")) return c.redirect("/forgot-password");

  const again = (error: string) =>
    card(
      c,
      "reset-card",
      "Choose a new password",
      <ResetPasswordCard step="form" token={token} policy={authConfig.password} error={error} />,
    );

  const password = field(body, "password");
  if (password !== field(body, "confirmPassword")) return again("The two passwords do not match.");

  try {
    await auth.resetPassword(token, password);
  } catch (e) {
    return again(logAndSanitise("auth.reset", e, "Could not change the password. Try again."));
  }

  // The reset ended every session, this browser's too; clear its cookie to match.
  if (auth.user) await auth.destroySession();
  return card(c, "reset-card", "Password changed", <ResetPasswordCard step="done" />);
});

webAuth.get("/verify-email", (c) => {
  const { auth, authConfig } = c.var;
  const show = (state: Parameters<typeof VerifyEmailCard>[0]) =>
    card(c, "verify-card", "Confirm your email", <VerifyEmailCard {...state} />);

  // From the email. A button, not an immediate confirm: mail scanners open
  // links on their own, and one should not confirm an address that somebody
  // else signed up with.
  const token = c.req.query("token");
  if (token) {
    hideToken(c);
    return show({ step: "confirm", token });
  }

  const user = auth.user;
  if (!user) return c.redirect("/login");
  if (user.emailVerified) return show({ step: "done", signedIn: true });
  return show({
    step: "pending",
    email: user.email ?? "",
    required: authConfig.security.requireEmailVerification,
    canSend: emailFlowsAvailable(c.env),
  });
});

webAuth.post("/verify-email", authRateLimit, async (c) => {
  const { auth } = c.var;
  const show = (state: Parameters<typeof VerifyEmailCard>[0]) =>
    card(c, "verify-card", "Confirm your email", <VerifyEmailCard {...state} />);
  hideToken(c);

  try {
    await auth.verifyEmail(field(await c.req.parseBody(), "token"));
    return show({ step: "done", signedIn: !!auth.user });
  } catch (e) {
    const user = auth.user;
    // Already confirmed (the link clicked twice): nothing went wrong.
    if (user?.emailVerified) return show({ step: "done", signedIn: true });
    return show({
      step: "invalid",
      message: logAndSanitise("auth.verify-email", e, "Could not confirm the email. Try again."),
      signedIn: !!user,
      canResend: !!user && emailFlowsAvailable(c.env),
    });
  }
});

/** Not behind `requireUser`: that would send an unconfirmed user straight back here. */
webAuth.post("/verify-email/resend", authRateLimit, async (c) => {
  const { auth, authConfig } = c.var;
  const user = auth.user;
  if (!user) {
    if (c.req.header("HX-Request")) return htmxRedirect(c, "/login");
    return c.redirect("/login");
  }

  const outcome = await auth.sendEmailVerification(user);
  if (outcome === "verified") {
    return card(c, "verify-card", "Confirm your email", <VerifyEmailCard step="done" signedIn />);
  }

  const notice = {
    sent: "A new link is on its way.",
    too_soon:
      "A link went out less than a minute ago. Give it a moment, and check your spam folder.",
    unavailable: "The link could not be sent just now. Try again in a while.",
  }[outcome];

  return card(
    c,
    "verify-card",
    "Confirm your email",
    <VerifyEmailCard
      step="pending"
      email={user.email ?? ""}
      notice={notice}
      required={authConfig.security.requireEmailVerification}
      canSend={emailFlowsAvailable(c.env)}
    />,
  );
});
