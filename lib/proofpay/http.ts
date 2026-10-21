import { safeError } from "./errors";

export async function respond(action: () => unknown | Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await action(), { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return safeError(error); }
}
