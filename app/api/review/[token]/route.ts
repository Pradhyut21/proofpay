import { getReview } from "@/lib/proofpay/service";
import { respond } from "@/lib/proofpay/http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  return respond(async () => getReview((await context.params).token));
}
