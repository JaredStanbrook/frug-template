// worker/lib/validator.ts
//
// zValidator from @hono/zod-validator, answering a bad request the way every
// other error here is answered: `{ error: "<a sentence>" }`, status 400.
// Left to itself it sends `{ success: false, error: <ZodError> }`, an
// object, which the browser's error helper then printed as "[object Object]".
// Import zValidator from here, unless the route answers with its own hook
// (worker/routes/admin/access.tsx redirects with a toast).

import { zValidator as packageValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType, ZodError } from "zod";

/** The first problem, as a sentence a person can act on. */
export function firstIssue(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "That request was not valid.";
  const field = issue.path.length ? String(issue.path[issue.path.length - 1]) : "";
  // Zod's own default messages ("Invalid input: expected string, received
  // null") mean nothing to a visitor; name the field instead.
  return /^Invalid input|^Invalid (string|type)|^Expected|^Required$/i.test(issue.message) && field
    ? `Please check the ${field.replace(/([A-Z])/g, " $1").toLowerCase()} field.`
    : issue.message;
}

export const zValidator = <T extends ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) =>
  packageValidator(target, schema, (result, c) => {
    if (!result.success)
      return c.json({ error: firstIssue(result.error as unknown as ZodError) }, 400);
  });
