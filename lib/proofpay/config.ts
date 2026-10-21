import { env } from "cloudflare:workers";
import type { PaymentMode } from "./types";
import { AppError } from "./errors";
import { configuredPaymentMode } from "./policy";

export interface ProofPayEnvironment {
  DB?: D1Database;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  PAYPAL_INVOICER_EMAIL?: string;
  PAYPAL_WEBHOOK_ID?: string;
  PROOFPAY_PAYMENT_MODE?: string;
  PROOFPAY_SELLER_USER_ID?: string;
}

export function environment(): ProofPayEnvironment {
  return env as unknown as ProofPayEnvironment;
}

export function paymentMode(config = environment()): PaymentMode {
  return configuredPaymentMode(config);
}

export function modelName(config = environment()): string {
  return config.GEMINI_MODEL || "gemini-3.5-flash";
}

export function database(): D1Database {
  const db = environment().DB;
  if (!db) throw new AppError(503, "DATABASE_UNAVAILABLE", "Workspace storage is not configured. Enable the D1 database and apply the included migrations.");
  return db;
}
