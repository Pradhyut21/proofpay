export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "AppError";
  }
}

export function invariant(value: unknown, status: number, code: string, message: string): asserts value {
  if (!value) throw new AppError(status, code, message);
}

export function safeError(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  // Provider response bodies, credentials, approval tokens, and user evidence never enter logs.
  console.error("ProofPay request failed", error instanceof Error ? error.name : "UnknownError");
  return Response.json({ error: "The request could not be completed. Please try again.", code: "INTERNAL_ERROR" }, { status: 500, headers: { "Cache-Control": "no-store" } });
}
