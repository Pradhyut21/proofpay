import type { Activity, Workspace } from "./types";

export const SAMPLE_BRIEF = "Website handoff for Alder Studio. Deliver Home, About, and Contact pages with working navigation. Supply screenshots showing all three pages at a mobile viewport. Supply a contact-form test report demonstrating a successful form submission and an email received in the studio inbox. The milestone price is USD 300. Client reviews the evidence and explicitly approves before an invoice is created.";

export function event(type: Activity["type"], message: string): Activity {
  return { id: crypto.randomUUID(), at: new Date().toISOString(), type, message };
}

export function seedWorkspace(id: string = crypto.randomUUID()): Workspace {
  const at = new Date().toISOString();
  return {
    id, revision: 0, contentVersion: 1,
    project: { name: "Alder Studio website", client: "Alder Studio", clientEmail: "", milestone: "Website handoff", amountMinor: 30000, currency: "USD", brief: SAMPLE_BRIEF, dueDate: "2026-11-06" },
    requirements: [
      { id: "req-pages", title: "Three complete pages", description: "Home, About, and Contact pages must be delivered with working navigation.", sourceQuote: "Deliver Home, About, and Contact pages with working navigation." },
      { id: "req-mobile", title: "Mobile screenshots", description: "Supply screenshots showing all three pages at a mobile viewport.", sourceQuote: "Supply screenshots showing all three pages at a mobile viewport." },
      { id: "req-contact", title: "Contact-form delivery test", description: "Supply a contact-form test report showing successful submission and email delivery to the studio inbox.", sourceQuote: "Supply a contact-form test report demonstrating a successful form submission and an email received in the studio inbox." },
    ],
    evidence: [
      { id: "ev-handoff", title: "Website delivery note", kind: "delivery_note", text: "Home, About, and Contact pages are delivered. Navigation links between all three pages pass the manual click-through test. Handoff commit: demo-a13. This is a sample text artifact; ProofPay has not opened a live website.", createdAt: at },
      { id: "ev-mobile", title: "Mobile screenshot manifest", kind: "test_report", text: "Mobile screenshot manifest at 390 × 844: home-mobile.png captured; about-mobile.png captured; contact-mobile.png missing. The two captured pages show no horizontal overflow. This manifest is sample evidence, not uploaded images.", createdAt: at },
      { id: "ev-contact", title: "Contact form QA — incomplete", kind: "test_report", text: "Contact form displays the success message after clicking Submit. Email delivery to the studio inbox has not been tested; no received-message ID is available.", createdAt: at },
    ],
    analysis: null, approval: null, invoice: null,
    activity: [event("project", "Sample Alder Studio handoff loaded. USD 300; no money has moved.")],
  };
}
