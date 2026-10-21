import { getWorkspace } from "@/lib/proofpay/service";
import { respond } from "@/lib/proofpay/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return respond(() => getWorkspace(request));
}
