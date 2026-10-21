import { ProofPayReview } from "@/components/proofpay-app";

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ProofPayReview token={token} />;
}
