/**
 * One consistent FIXCHAIN sample story shared by every screen, so numbers agree across pages.
 * Everything here is SAMPLE data for the UI concept: no backend is connected and no money moves.
 * Content mirrors the real FIXCHAIN backend (backend/app/): the PENDING-as-FAILED callback defect,
 * the 22-test locked verifier suite, policy tiers 0-3, scenarios A-E and en / hi / mr tickets.
 */
import type { Ticket } from "@/types";

export const SIGNED_IN = { name: "Vikram Shah", role: "Incident manager", initials: "VS" };

// ------------------------------------------------------------------ incidents
export type FxIncident = {
  id: string;
  title: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  status: "detected" | "investigating" | "awaiting_approval" | "resolved";
  kind: "code_defect" | "operational" | "external";
  confidence: number;
  tickets: number;
  affectedMerchants: number;
  affectedCustomers: number;
  regions: string[];
  rootCause: string;
  facts: string[];
  actions: string[];
  detectedMinsAgo: number;
  growth: number;
};

export const INCIDENTS: FxIncident[] = [
  {
    id: "INC-001",
    title: "Paid UPI orders marked failed by the merchant callback handler",
    category: "UPI payments",
    severity: "critical",
    status: "awaiting_approval",
    kind: "code_defect",
    confidence: 96,
    tickets: 42,
    affectedMerchants: 38,
    affectedCustomers: 41,
    regions: ["Maharashtra", "Gujarat"],
    rootCause: "map_gateway_status() treats every non-SUCCESS status as PAYMENT_FAILED, so a PENDING callback closes the order before the bank confirms.",
    facts: [
      "42 callbacks recorded PENDING → PAYMENT_FAILED (contract requires PAYMENT_PENDING)",
      "31 later SUCCESS callbacks were ignored because the orders were already final",
      "Replay in sandbox reproduces it: baseline passes 10 of 22 locked tests",
    ],
    actions: ["Approve verified patch #2 (22/22 tests)", "Reconcile 31 orders from the gateway's status", "Tell customers in their language once orders are paid"],
    detectedMinsAgo: 14,
    growth: 12,
  },
  {
    id: "INC-002",
    title: "Soundbox SB-Pro 2 not announcing successful payments",
    category: "Soundbox",
    severity: "high",
    status: "investigating",
    confidence: 81,
    kind: "operational",
    tickets: 23,
    affectedMerchants: 23,
    affectedCustomers: 0,
    regions: ["Delhi NCR"],
    rootCause: "Devices on firmware 4.2.1 lost network after an overnight push; payments are received but not announced.",
    facts: ["23 merchants report silence after payment", "Telemetry: 19 devices offline, 4 online but silent", "Remote restart fixed 6 of 9 tried"],
    actions: ["Remote restart remaining devices (Tier 1, autonomous)", "Order replacements where restart failed (Tier 2, approval)"],
    detectedMinsAgo: 62,
    growth: -5,
  },
  {
    id: "INC-003",
    title: "Merchant QR codes not accepting payments after VPA change",
    category: "Merchant QR",
    severity: "medium",
    status: "investigating",
    confidence: 77,
    kind: "operational",
    tickets: 9,
    affectedMerchants: 9,
    affectedCustomers: 14,
    regions: ["Karnataka"],
    rootCause: "QR codes still point at a deactivated VPA after merchants updated their bank account.",
    facts: ["9 merchants changed bank account in the last 48 h", "QR config check: VPA inactive on all 9"],
    actions: ["Re-link each QR to its active VPA (Tier 2, approval)"],
    detectedMinsAgo: 130,
    growth: 0,
  },
  {
    id: "INC-004",
    title: "Settlement batch held at partner bank",
    category: "Settlement",
    severity: "medium",
    status: "detected",
    confidence: 88,
    kind: "operational",
    tickets: 12,
    affectedMerchants: 12,
    affectedCustomers: 0,
    regions: ["Tamil Nadu", "Karnataka"],
    rootCause: "Batch SB-1121 is on hold at the partner bank pending a file re-submission.",
    facts: ["Settlement status API: batch SB-1121 HELD since 06:10", "12 merchants expected credit yesterday"],
    actions: ["Escalate batch to partner bank (Tier 2, approval)", "Send merchants a dated update"],
    detectedMinsAgo: 190,
    growth: 0,
  },
  {
    id: "INC-005",
    title: "Burst of callbacks with invalid signatures",
    category: "Gateway",
    severity: "high",
    status: "detected",
    confidence: 99,
    kind: "external",
    tickets: 0,
    affectedMerchants: 1,
    affectedCustomers: 0,
    regions: ["—"],
    rootCause: "Not a merchant code defect: the handler correctly rejected 3 forged or mis-signed callbacks. Check the gateway secret.",
    facts: ["3 invalid signatures in 120 s, all rejected with HTTP 401", "No order changed state"],
    actions: ["Verify the gateway webhook secret, then close (no patch)"],
    detectedMinsAgo: 25,
    growth: 0,
  },
];

// ------------------------------------------------------------------ approvals (policy-gated actions)
export type FxApproval = {
  id: string;
  incidentId: string;
  title: string;
  action: string;
  tier: 2 | 3;
  role: string;
  evidence: string[];
  expectedEffect: string;
  reversible: boolean;
  payloadHash: string;
  minsAgo: number;
};

export const APPROVALS: FxApproval[] = [
  {
    id: "APR-101",
    incidentId: "INC-001",
    title: "Activate verified patch #2 for payment_handler.py",
    action: "code_patch_activation",
    tier: 2,
    role: "approver",
    evidence: ["22 of 22 locked payment tests pass (baseline: 10 of 22)", "Replayed PENDING callback → order PAYMENT_PENDING", "Patch #1 was rejected by the verifier at 15 of 22"],
    expectedEffect: "New PENDING payments stay pending until the bank confirms",
    reversible: true,
    payloadHash: "9f2c4e1a…b07d",
    minsAgo: 3,
  },
  {
    id: "APR-102",
    incidentId: "INC-001",
    title: "Reconcile 31 orders from the gateway's authoritative status",
    action: "payment_reconciliation_request",
    tier: 2,
    role: "approver",
    evidence: ["Gateway status API: 31 transactions SUCCESS, merchant shows PAYMENT_FAILED", "Runs only after the patch is active"],
    expectedEffect: "31 customers get their orders; no money is moved",
    reversible: false,
    payloadHash: "41ad90c3…e221",
    minsAgo: 3,
  },
  {
    id: "APR-103",
    incidentId: "INC-002",
    title: "Order replacement Soundbox for 3 merchants",
    action: "device_replacement",
    tier: 2,
    role: "approver",
    evidence: ["Remote restart failed verification on SBX-B42-0005, -0011, -0022", "Devices under warranty"],
    expectedEffect: "Replacement devices shipped within 48 h",
    reversible: false,
    payloadHash: "29b7a911…c6e5",
    minsAgo: 18,
  },
  {
    id: "APR-104",
    incidentId: "INC-003",
    title: "Re-link 9 merchant QR codes to their active VPA",
    action: "qr_remap",
    tier: 2,
    role: "approver",
    evidence: ["QR config check: VPA inactive for all 9", "Merchants confirmed new bank accounts"],
    expectedEffect: "QR payments accepted again",
    reversible: true,
    payloadHash: "7c03f5d2…19aa",
    minsAgo: 41,
  },
  {
    id: "APR-105",
    incidentId: "TK-1007",
    title: "Hand a suspected fraud report to a human investigator",
    action: "fraud_case_handoff",
    tier: 3,
    role: "approver",
    evidence: ["Customer reports a payment they did not make (TK-1007)"],
    expectedEffect: "Investigator owns the case; FIXCHAIN only drafts and routes",
    reversible: false,
    payloadHash: "b18e6d70…3f04",
    minsAgo: 55,
  },
];

export const TIER_LABEL: Record<number, string> = {
  0: "Tier 0: informational, runs on its own",
  1: "Tier 1: read-only or low risk, runs on its own",
  2: "Tier 2: consequential, needs an approver",
  3: "Tier 3: sensitive, a person leads it",
};

// ------------------------------------------------------------------ tickets (en / hi / mr)
export type FxTicket = Ticket & { language: "en" | "hi" | "mr"; message: string };

export const TICKETS: FxTicket[] = [
  { id: "TK-1001", customerId: "C-8842", customerName: "Meera Joshi", customerEmail: "", customerPhone: "+91 98•••• 3210", category: "upi_payment", priority: "critical", status: "in_progress", subject: "Charged ₹1,299 but the order says failed", description: "Payment went through on UPI; the shop's app shows the order as failed.", message: "I was debited Rs 1299 but the order says failed!", language: "en", amount: 1299, transactionId: "TXN_0004", createdAt: "2026-11-20T08:14:00Z", updatedAt: "2026-11-20T08:20:00Z", assignedTo: "Customer understanding", incidentId: "INC-001", channel: "app" },
  { id: "TK-1002", customerId: "C-8843", customerName: "Ananya Rao", customerEmail: "", customerPhone: "+91 98•••• 3211", category: "upi_payment", priority: "critical", status: "in_progress", subject: "Money debited, order failed", description: "Customer charged ₹2,399; order marked failed.", message: "Mere paise kat gaye lekin order fail dikha raha hai", language: "hi", amount: 2399, transactionId: "TXN_0006", createdAt: "2026-11-20T08:16:00Z", updatedAt: "2026-11-20T08:21:00Z", assignedTo: "Triage", incidentId: "INC-001", channel: "app" },
  { id: "TK-1003", customerId: "C-8844", customerName: "Vihaan Kulkarni", customerEmail: "", customerPhone: "+91 98•••• 3212", category: "upi_payment", priority: "high", status: "open", subject: "Money deducted, order not received", description: "Customer charged ₹349; no order.", message: "पैसे कापले पण ऑर्डर मिळाले नाही", language: "mr", amount: 349, transactionId: "TXN_0007", createdAt: "2026-11-20T08:18:00Z", updatedAt: "2026-11-20T08:18:00Z", assignedTo: "Incident intelligence", incidentId: "INC-001", channel: "app" },
  { id: "TK-1004", customerId: "M-0207", customerName: "Ramesh Kirana Store", customerEmail: "", customerPhone: "+91 97•••• 1188", category: "soundbox", priority: "high", status: "in_progress", subject: "Soundbox silent after payments", description: "Device SB-Pro 2 not announcing successful payments since this morning.", message: "Soundbox bol nahi raha, payment aa raha hai par awaaz nahi", language: "hi", amount: 0, createdAt: "2026-11-20T07:05:00Z", updatedAt: "2026-11-20T07:40:00Z", assignedTo: "Investigation", incidentId: "INC-002", channel: "call" },
  { id: "TK-1005", customerId: "M-0311", customerName: "Shree Medicals", customerEmail: "", customerPhone: "+91 99•••• 4521", category: "merchant_qr", priority: "medium", status: "open", subject: "QR code not accepting payments", description: "Customers say scan fails since bank account change.", message: "Customers can't pay by scanning our QR since yesterday", language: "en", amount: 0, createdAt: "2026-11-20T05:50:00Z", updatedAt: "2026-11-20T05:50:00Z", assignedTo: "Resolution", incidentId: "INC-003", channel: "web" },
  { id: "TK-1006", customerId: "M-0412", customerName: "Sai Tiffin Centre", customerEmail: "", customerPhone: "+91 90•••• 7754", category: "settlement", priority: "high", status: "open", subject: "Yesterday's settlement not credited", description: "Settlement of ₹45,000 not credited.", message: "कालचे सेटलमेंट खात्यात जमा झाले नाही", language: "mr", amount: 45000, createdAt: "2026-11-20T06:30:00Z", updatedAt: "2026-11-20T06:30:00Z", assignedTo: "Investigation", incidentId: "INC-004", channel: "app" },
  { id: "TK-1007", customerId: "C-8850", customerName: "Rohan Mehta", customerEmail: "", customerPhone: "+91 98•••• 6640", category: "other", priority: "critical", status: "escalated", subject: "A payment I did not make", description: "Customer reports an unauthorized UPI debit of ₹4,800.", message: "Ek payment maine nahi kiya, yeh fraud hai", language: "hi", amount: 4800, transactionId: "TXN_0019", createdAt: "2026-11-20T07:55:00Z", updatedAt: "2026-11-20T08:02:00Z", assignedTo: "Human investigator", channel: "call" },
  { id: "TK-1008", customerId: "C-8851", customerName: "Isha Patil", customerEmail: "", customerPhone: "+91 98•••• 2209", category: "upi_payment", priority: "medium", status: "resolved", subject: "Payment pending for 10 minutes", description: "Payment was pending; confirmed by bank, order paid.", message: "Payment pending dikh raha tha, ab theek hai", language: "hi", amount: 899, transactionId: "TXN_0002", createdAt: "2026-11-20T04:10:00Z", updatedAt: "2026-11-20T04:30:00Z", resolvedAt: "2026-11-20T04:30:00Z", assignedTo: "Verification", satisfactionScore: 5, channel: "app" },
];

export const LANG_LABEL: Record<string, string> = { en: "English", hi: "Hindi", mr: "Marathi" };

// ------------------------------------------------------------------ engineering remediation (the real patch)
export const PATCH_DIFF = `--- payment_handler.py (live, v2)
+++ payment_handler.py (patch #2)
@@ def map_gateway_status(gateway_status: str) -> str:
     status = (gateway_status or "").strip().upper()
     if status == "SUCCESS":
         return "PAID"
-    # Simplified: anything that is not a success is a failed payment.
-    return "PAYMENT_FAILED"
+    if status == "PENDING":
+        return "PAYMENT_PENDING"
+    if status == "FAILED":
+        return "PAYMENT_FAILED"
+    raise ValueError(f"Unknown gateway status: {gateway_status!r}")`;

export const PATCH_ATTEMPTS = [
  { n: 1, by: "Repair agent", passed: 15, total: 22, verdict: "rejected", note: "Added a PENDING branch but still failed unknown statuses (REFUNDED, CHARGEBACK…)." },
  { n: 2, by: "Repair agent, with verifier feedback", passed: 22, total: 22, verdict: "verified", note: "Rebuilt the mapping from the gateway contract; unknown statuses raise so the gateway retries." },
];

export const RUN_LOG = [
  ["08:14:02", "detection", "Contract mismatch: gateway PENDING recorded as PAYMENT_FAILED (expected PAYMENT_PENDING)"],
  ["08:14:02", "orchestrator", "Sandbox created from live code v2; verifier suite SHA pinned"],
  ["08:14:05", "verifier", "Reproduced: baseline passes 10 of 22; replayed PENDING → PAYMENT_FAILED"],
  ["08:14:09", "investigator", "Root cause in payment_handler.py::map_gateway_status() lines 25-31"],
  ["08:14:12", "repairer", "Patch #1 generated; safety gate passed"],
  ["08:14:15", "verifier", "Patch #1 rejected: 15 of 22 tests pass. Failing tests sent back"],
  ["08:14:19", "repairer", "Patch #2 generated using verifier feedback; safety gate passed"],
  ["08:14:22", "verifier", "Patch #2 passes 22 of 22; replayed PENDING → PAYMENT_PENDING"],
  ["08:14:22", "orchestrator", "Awaiting a named approver. Nothing has been activated"],
] as const;

// ------------------------------------------------------------------ knowledge
export const KNOWLEDGE = [
  { id: "MEM-001", title: "PENDING collapsed into FAILED in the status mapping", category: "Defect memory", confidence: 96, status: "verified", resolved: 3, updated: "20 Nov 2026", description: "A refactor of map_gateway_status() drops the PENDING branch. Seen before: use as a hint only; the fix is regenerated and must pass the locked suite again.", tags: ["callback", "upi", "pending"] },
  { id: "PB-UPI-v3", title: "Debited but not credited (UPI)", category: "Playbook v3", confidence: 92, status: "verified", resolved: 214, updated: "18 Nov 2026", description: "Check authoritative payment status (Tier 1), request reconciliation if the bank shows success (Tier 2), update the customer in their language.", tags: ["upi", "reconciliation"] },
  { id: "PB-SBX-v2", title: "Soundbox silent or offline", category: "Playbook v2", confidence: 88, status: "verified", resolved: 131, updated: "15 Nov 2026", description: "Read telemetry and run a test announcement, remote restart (Tier 1), order a replacement only if restart fails verification (Tier 2).", tags: ["soundbox", "device"] },
  { id: "PB-QR-v1", title: "QR not accepting payments", category: "Playbook v1", confidence: 79, status: "verified", resolved: 46, updated: "12 Nov 2026", description: "Read QR and VPA configuration (Tier 1), re-link to the active VPA with approval (Tier 2).", tags: ["qr", "vpa"] },
  { id: "LP-014", title: "Proposed: restart Soundbox before asking the merchant to power-cycle", category: "Learning proposal", confidence: 71, status: "pending", resolved: 0, updated: "20 Nov 2026", description: "From 23 verified outcomes: remote restart fixed 67% without merchant effort. Needs a human to approve before the playbook changes.", tags: ["soundbox", "proposal"] },
];

// ------------------------------------------------------------------ simulation scenarios (backend ops/simulation.py)
export const SCENARIOS = [
  { id: "A", name: "UPI payment failure", note: "Includes the callback code-defect path", category: "upi_payment", incidents: 1, defect: true },
  { id: "B", name: "Soundbox failure", note: "Payments arrive, no announcement", category: "soundbox", incidents: 1, defect: true },
  { id: "C", name: "Merchant QR failure", note: "QR points at an inactive VPA", category: "merchant_qr", incidents: 1, defect: false },
  { id: "D", name: "Settlement delay", note: "Batch held at partner bank", category: "settlement", incidents: 1, defect: false },
  { id: "E", name: "Platform outage", note: "Many complaints in a short window", category: "platform_outage", incidents: 1, defect: false },
] as const;
export const SIM_SIZES = [50, 100, 300] as const;
