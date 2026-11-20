import { Camera, ChevronLeft, ImageUp, Languages, LogOut, Mic, Plus, Send, ShieldCheck, Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Login } from "../App";
import { Btn, ErrorNote, Pill, inputCls, useToast } from "../components/kit";
import { session } from "../lib/session";
import { ago, useV1, v1 } from "../lib/v1";

const SLOT = "customer" as const;
type Locale = "en" | "hi" | "mr";

const STARTERS: Record<"consumer" | "merchant", Record<Locale, string[]>> = {
  consumer: {
    en: ["₹500 was debited but the merchant didn't receive it. UTR 412345678901", "My ₹1,200 payment is stuck as pending. UTR 412345678902",
         "There's a transaction I didn't make on my account"],
    hi: ["Mere account se 500 rupees debit ho gaye, lekin merchant ko payment nahi mila. UTR 412345678901",
         "मेरा ₹1200 का पेमेंट पेंडिंग में अटका है। UTR 412345678902", "Mere account se ek transaction hua jo maine nahi kiya"],
    mr: ["माझ्या खात्यातून ₹500 कापले गेले पण व्यापाऱ्याला मिळाले नाहीत. UTR 412345678901",
         "माझे ₹1200 चे पेमेंट प्रलंबित आहे. UTR 412345678902", "माझ्या खात्यातून मी न केलेला व्यवहार झाला"],
  },
  merchant: {
    en: ["My Soundbox is not announcing payments", "Customers say my QR code is not accepting payments", "Yesterday's settlement has not reached my account"],
    hi: ["Payment aa raha hai par Soundbox bol nahi raha", "मेरे QR कोड से ग्राहक पेमेंट नहीं कर पा रहे", "Kal ka settlement abhi tak account me nahi aaya"],
    mr: ["पेमेंट येत आहे पण साउंडबॉक्स बोलत नाही", "ग्राहक QR स्कॅन करतात पण पेमेंट होत नाही", "कालचे सेटलमेंट अजून खात्यात जमा झाले नाही"],
  },
};
const UI: Record<Locale, Record<string, string>> = {
  en: { hello: "How can we help?", new: "New issue", send: "Send", placeholder: "Describe your problem…", tickets: "Your tickets",
        privacy: "Never share your PIN, OTP, CVV or password. Messages are masked before AI processing.", photo: "Photo of device" },
  hi: { hello: "हम आपकी कैसे मदद करें?", new: "नई समस्या", send: "भेजें", placeholder: "अपनी समस्या लिखें…", tickets: "आपके टिकट",
        privacy: "अपना PIN, OTP, CVV या पासवर्ड कभी न बताएँ। AI प्रोसेसिंग से पहले संदेश छिपाए जाते हैं।", photo: "डिवाइस की फ़ोटो" },
  mr: { hello: "आम्ही कशी मदत करू?", new: "नवीन तक्रार", send: "पाठवा", placeholder: "तुमची अडचण लिहा…", tickets: "तुमची तिकिटे",
        privacy: "तुमचा PIN, OTP, CVV किंवा पासवर्ड कधीही सांगू नका. AI प्रक्रियेपूर्वी संदेश लपवले जातात.", photo: "डिव्हाइसचा फोटो" },
};
const STEPS = [
  { key: "received", label: { en: "Received", hi: "प्राप्त", mr: "मिळाले" }, states: ["NEW", "INTAKE", "TRIAGED", "CORRELATED"] },
  { key: "checking", label: { en: "Checking", hi: "जाँच", mr: "तपासणी" }, states: ["INVESTIGATING", "EXECUTING", "VERIFYING", "RESOLUTION_PROPOSED", "REOPENED"] },
  { key: "action", label: { en: "In progress", hi: "कार्रवाई", mr: "कार्यवाही" }, states: ["APPROVAL_REQUIRED", "WAITING_PARTNER", "NEEDS_CUSTOMER", "ESCALATED"] },
  { key: "done", label: { en: "Resolved", hi: "हल", mr: "सुटले" }, states: ["RESOLVED"] },
];

function Tracker({ state, locale }: { state: string; locale: Locale }) {
  const idx = STEPS.findIndex((s) => s.states.includes(state));
  return (
    <ol className="flex items-center gap-1" aria-label="Ticket progress">
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex flex-1 flex-col items-center gap-1">
          <span className={`h-1.5 w-full rounded-full ${i <= idx ? (idx === 3 ? "bg-good" : "bg-accentDim") : "bg-line"}`} />
          <span className={`text-[10px] ${i === idx ? "font-bold text-brand" : "text-ink-3"}`}>{s.label[locale]}</span>
        </li>
      ))}
    </ol>
  );
}

function useVoice(locale: Locale, onText: (t: string) => void) {
  const { data: info } = useV1<any>("/voice", 60000, SLOT);
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [mode, setMode] = useState<"sarvam" | "browser" | null>(null);
  const toast = useToast();
  const Browser = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  useEffect(() => { setMode(info?.available ? "sarvam" : Browser ? "browser" : null); }, [info, Browser]);
  const start = async () => {
    if (mode === "browser") {
      const r = new Browser();
      r.lang = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" }[locale];
      r.onresult = (e: any) => onText(e.results[0][0].transcript);
      r.onerror = () => toast("critical", "Speech not recognised - please type instead");
      r.start();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const fd = new FormData();
        fd.append("audio", new Blob(chunks, { type: "audio/webm" }), "speech.webm");
        fd.append("locale", locale);
        try {
          const r = await v1<any>("/voice/transcribe", { form: fd, slot: SLOT });
          onText(r.transcript);
        } catch (e) { toast("critical", `Voice unavailable: ${(e as Error).message}. Please type instead.`); }
      };
      mr.start();
      setRec(mr);
    } catch { toast("critical", "Microphone permission denied - please type instead"); }
  };
  const stop = () => { rec?.stop(); setRec(null); };
  const speak = async (text: string) => {
    if (info?.available) {
      try {
        const r = await v1<any>("/voice/speak", { body: { text, locale }, slot: SLOT });
        new Audio(`data:${r.mime};base64,${r.audio_base64}`).play();
        return;
      } catch { /* fall through to the browser engine */ }
    }
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" }[locale];
      u.rate = 0.95;
      speechSynthesis.speak(u);
    }
  };
  return { mode, recording: !!rec, start, stop, speak, provider: info?.available ? "Sarvam" : "browser speech (fallback)" };
}

function Conversation({ id, locale, onBack }: { id: string; locale: Locale; onBack: () => void }) {
  const { data, reload } = useV1<any>(`/tickets/${id}`, 1500, SLOT);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [diag, setDiag] = useState<any>(null);
  const end = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const user = session.user(SLOT);
  const voice = useVoice(locale, (t) => setText((p) => (p ? p + " " : "") + t));
  const msgs = data?.messages ?? [];
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs.length]);
  const send = async () => {
    if (!text.trim()) return;
    setBusy(true); setErr(null);
    try { await v1(`/tickets/${id}/messages`, { body: { message: text }, slot: SLOT }); setText(""); reload(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const upload = async (blob: Blob, mime: string) => {
    const fd = new FormData();
    fd.append("image", new File([blob], "soundbox.png", { type: mime }));
    fd.append("ticket_id", id);
    setBusy(true);
    try { setDiag(await v1("/vision/diagnose", { form: fd, slot: SLOT })); reload(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const sample = async (state: string) => {
    const b = await (await fetch(`/api/v1/vision/samples/${state}.png`)).blob();
    upload(b, "image/png");
  };
  const t = data?.ticket;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <button onClick={onBack} aria-label="Back" className="rounded-lg p-1 text-ink-3 hover:bg-raised"><ChevronLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold">{t?.title ?? id}</div>
          <div className="font-mono text-[10.5px] text-ink-3">{id}</div>
        </div>
      </div>
      {t && <div className="px-3 pt-2"><Tracker state={t.state} locale={locale} /></div>}
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {msgs.map((m: any) => (
          <div key={m.id} className={`flex ${m.role === "customer" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12.5px] leading-snug ${m.role === "customer"
              ? "rounded-br-sm bg-brand text-white" : m.kind === "safety" ? "rounded-bl-sm border border-warn/40 bg-warn/10 text-ink"
              : m.role === "operator" ? "rounded-bl-sm border border-violet-300 bg-violet-50 text-ink" : "rounded-bl-sm bg-raised text-ink"}`}>
              {m.role === "operator" && <div className="mb-0.5 text-[10px] font-bold text-violet-700">{m.author} · support</div>}
              {m.body}
              {m.role !== "customer" && (
                <button onClick={() => voice.speak(m.body)} aria-label="Read aloud" title={`Read aloud (${voice.provider})`}
                  className="ml-1.5 inline-flex translate-y-0.5 text-ink-3 hover:text-brand"><Volume2 className="h-3 w-3" /></button>
              )}
            </div>
          </div>
        ))}
        {diag && (
          <div className="rounded-xl border border-line bg-panel p-2.5 text-[11.5px]">
            <div className="flex items-center gap-1.5 font-semibold"><Camera className="h-3.5 w-3.5" /> {diag.label}
              <Pill tone={diag.state === "UNKNOWN" ? "warn" : "info"}>{Math.round(diag.confidence * 100)}%</Pill></div>
            <div className="mt-0.5 text-ink-3">{diag.method} · {diag.limits}</div>
          </div>
        )}
        <div ref={end} />
      </div>
      <ErrorNote error={err} />
      {user?.role === "merchant" && t && t.category === "SOUNDBOX" && (
        <div className="border-t border-line px-3 py-2">
          <div className="mb-1 flex items-center justify-between text-[11px] text-ink-3">
            <span>{UI[locale].photo} - still image only, not stored</span>
            <button className="font-semibold text-brand-2 hover:underline" onClick={() => fileRef.current?.click()}><ImageUp className="mr-0.5 inline h-3 w-3" />Upload</button>
          </div>
          <div className="flex gap-1">
            {["NETWORK_PROBLEM", "LOW_BATTERY", "NORMAL", "BLANK"].map((s) => (
              <button key={s} onClick={() => sample(s)} disabled={busy} title={`Demo sample: ${s}`}
                className="flex-1 overflow-hidden rounded-lg border border-line hover:border-accentDim">
                <img src={`/api/v1/vision/samples/${s}.png`} alt={`Sample Soundbox photo: ${s.toLowerCase().replace("_", " ")}`} className="h-10 w-full object-cover" />
              </button>
            ))}
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, f.type); e.target.value = ""; }} />
        </div>
      )}
      <div className="flex items-center gap-1.5 border-t border-line p-2">
        {voice.mode && (
          <button onClick={voice.recording ? voice.stop : voice.start} aria-label={voice.recording ? "Stop recording" : "Speak"}
            title={`Voice input via ${voice.provider}`} className={`rounded-xl p-2 ${voice.recording ? "bg-critical text-white" : "bg-raised text-brand hover:bg-line"}`}>
            {voice.recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        )}
        <input className={inputCls} placeholder={UI[locale].placeholder} value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()} aria-label="Message" />
        <button onClick={send} disabled={busy || !text.trim()} aria-label={UI[locale].send} className="rounded-xl bg-brand p-2 text-white disabled:opacity-40"><Send className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function Portal() {
  const user = session.user(SLOT)!;
  const [locale, setLocale] = useState<Locale>((user.locale as Locale) ?? "en");
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { data, reload } = useV1<any>("/tickets?limit=20", 3000, SLOT);
  const kind = user.role === "merchant" ? "merchant" : "consumer";
  const create = async (message: string) => {
    setBusy(true); setErr(null);
    try {
      const t = await v1<any>("/tickets", { body: { message, locale, channel: "web_chat", context: kind === "merchant" ? { device_type: undefined } : undefined }, slot: SLOT });
      setText(""); reload(); setOpen(t.id);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const voice = useVoice(locale, (t) => setText((p) => (p ? p + " " : "") + t));
  const logout = () => session.set(SLOT, null);
  if (open) return <Conversation id={open} locale={locale} onBack={() => setOpen(null)} />;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 bg-brand px-3 py-2.5 text-white">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-white/60">{kind === "merchant" ? "Merchant" : "Customer"}</div>
          <div className="truncate text-[13px] font-semibold">{user.display_name}</div>
        </div>
        <label className="flex items-center gap-1 text-[11px]">
          <Languages className="h-3.5 w-3.5" aria-hidden />
          <select aria-label="Language" value={locale} onChange={(e) => setLocale(e.target.value as Locale)}
            className="rounded-md bg-white/10 px-1 py-0.5 text-white">
            <option value="en" className="text-ink">English</option><option value="hi" className="text-ink">हिन्दी</option><option value="mr" className="text-ink">मराठी</option>
          </select>
        </label>
        <button onClick={logout} aria-label="Sign out of customer app" className="rounded-lg p-1 hover:bg-white/10"><LogOut className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <div className="text-[15px] font-bold text-ink">{UI[locale].hello}</div>
        <div className="space-y-1.5">
          {STARTERS[kind][locale].map((s) => (
            <button key={s} onClick={() => setText(s)} className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-left text-[12px] text-ink-2 hover:border-accentDim">
              <Plus className="mr-1 inline h-3 w-3 text-accentDim" />{s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {voice.mode && (
            <button onClick={voice.recording ? voice.stop : voice.start} aria-label="Speak your issue" title={`Voice via ${voice.provider}`}
              className={`rounded-xl p-2 ${voice.recording ? "bg-critical text-white" : "bg-raised text-brand"}`}>{voice.recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</button>
          )}
          <input className={inputCls} placeholder={UI[locale].placeholder} value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && text.trim() && create(text)} aria-label="Describe your issue" />
          <Btn variant="primary" busy={busy} disabled={!text.trim()} onClick={() => create(text)}><Send className="h-4 w-4" /></Btn>
        </div>
        {voice.mode && <div className="text-[10.5px] text-ink-3">Voice: {voice.provider}</div>}
        <ErrorNote error={err} />
        <div className="flex items-start gap-1.5 rounded-xl bg-raised p-2 text-[10.5px] text-ink-3"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />{UI[locale].privacy}</div>
        <div>
          <div className="mb-1 text-[12px] font-semibold text-ink-2">{UI[locale].tickets}</div>
          {(data?.items ?? []).length === 0 ? <div className="text-[11.5px] text-ink-3">—</div> : (
            <ul className="space-y-1.5">
              {data.items.map((t: any) => (
                <li key={t.id}>
                  <button onClick={() => setOpen(t.id)} className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-left hover:border-accentDim">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12px] font-semibold">{t.title ?? "…"}</span>
                      <Pill tone={t.state === "RESOLVED" ? "good" : "info"}>{t.status.replace("_", " ")}</Pill>
                    </div>
                    <div className="mt-0.5 font-mono text-[10.5px] text-ink-3">{t.id} · {ago(t.created_at)}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** Phone-framed customer / merchant app with its own sign-in, so an operator can watch both sides at once. */
export function CustomerApp({ compact = false }: { compact?: boolean }) {
  const token = useSyncExternalStore(session.subscribe, () => session.token(SLOT));
  const frame = (
    <div className={`mx-auto flex flex-col overflow-hidden rounded-[28px] border-[6px] border-night bg-bg shadow-card ${compact ? "h-[620px] w-full max-w-[340px]" : "h-[720px] w-[380px]"}`}>
      <div className="flex h-5 items-center justify-center bg-night"><span className="h-1.5 w-14 rounded-full bg-white/20" /></div>
      <div className="min-h-0 flex-1">
        {token ? <Portal /> : (
          <div className="h-full overflow-y-auto p-3">
            <div className="mb-2 text-[14px] font-bold text-ink">Customer & merchant app</div>
            <p className="mb-3 text-[11.5px] text-ink-3">Sign in as a demo customer or merchant to raise an issue in English, Hindi or Marathi.</p>
            <Login slot="customer" compact roles={["customer", "merchant"]} />
          </div>
        )}
      </div>
    </div>
  );
  if (compact) return frame;
  return (
    <div className="flex flex-col items-center gap-4 lg:flex-row lg:items-start lg:justify-center">
      {frame}
      <div className="max-w-sm space-y-3 text-[12.5px] text-ink-2">
        <h2 className="text-[16px] font-bold text-ink">Customer experience</h2>
        <p>Tickets are persisted before any agent runs. The Customer Understanding agent extracts facts (amount, UTR, device) in the customer's language and asks only for what is missing.</p>
        <p>Demo transaction references: <span className="font-mono">412345678901</span> (bank success, merchant not updated), <span className="font-mono">…902</span> (pending), <span className="font-mono">…903</span> (paid), <span className="font-mono">…904</span> (failed).</p>
        <p>Replies come from pre-approved templates in English, Hindi and Marathi. Speaker icons read messages aloud using Sarvam when configured, otherwise the browser's own speech engine (labelled).</p>
      </div>
    </div>
  );
}
