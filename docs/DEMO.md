# Demo script (about 8 minutes)

All data below is simulated and labelled as such in the UI. Sign in as **Platform Admin** (or Vikram Shah,
incident manager) in the main window; the customer phone is a separate session.

1. **Mission Control** - empty, honest baseline: every KPI is computed from stored records.
2. **Customer App** → sign in as *Ramesh Kirana Store* (Hindi). Tap "Payment aa raha hai par Soundbox bol nahi
   raha" → send. Watch the acknowledgement, the diagnosis and the verified remote restart - all in Hindi.
   Tap the red-light sample photo: the image diagnostic returns `NETWORK_PROBLEM` with its confidence and limits.
3. **Simulation Lab** → scenario **B - Soundbox failure**, 300 tickets → Start. Point out: tickets streaming in
   (en/hi/mr), the worker pool scaling up (in-process, labelled), one parent incident forming, severity rising as
   it grows, and the split between devices fixed autonomously and those routed for approval.
4. **Operational Incidents → INC-…** - Copilot brief: facts vs hypotheses, why the severity, next actions.
   The leading hypothesis (payment-status defect) is marked *hypothesis*, not fact.
5. **Engineering Remediation → ENG-…** - the existing pipeline reproduced the defect in a subprocess, proposed a
   patch, passed 22/22 locked tests, and is **waiting for a human**. Show the diff and the test matrix. Signed in
   as *Neha (engineer)* the approval is locked (the API also returns 403). Approve as *Rahul (approver)* → activated → post-fix replay →
   hypothesis becomes **confirmed** → the silent-device tickets resolve with that verification as the source.
6. **Resolution & Approvals** - Tier 2 device replacements: evidence, expected effect, reversibility, policy
   reason, payload hash. "Approve all" still checks and audits each one.
7. **Customer App** as *Priya Kulkarni* (Marathi): "माझ्या खात्यातून ₹500 कापले गेले… UTR 412345678901" → bank says
   SUCCESS, merchant not updated → reconciliation needs approval (no money moves). Then send a fraud message:
   urgent guidance, Tier 3, never auto-closed.
8. **Incident report (draft)** → Download: clearly marked as not filed with any regulator.
9. **Historical Analytics** - PRD metrics and the outcome card (assumed baseline is labelled).
10. **Settings & Audit** - policy catalog, autonomy kill switch, hash-chain-verified audit log.

Other scenarios: **A** UPI debit-not-credited (engineering path + reconciliations), **C** QR config push
(re-link approvals), **D** settlement held at partner (one escalation per batch), **E** platform outage
(SEV-1, approve failover → verified health → all linked tickets resolved). Use **Reset** between runs; the same
seed reproduces the same run.
