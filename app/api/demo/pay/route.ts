import { demoPay } from "@/lib/proofpay/service";
import { respond } from "@/lib/proofpay/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return respond(() => demoPay(request));
}
