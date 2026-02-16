// File location: app/akupara/page.tsx
// Accessible at: giantperigee.vercel.app/akupara
// LLM calls → /api/akupara (Gemini, server-side, no CORS)
// Supabase calls → direct from browser (CORS-safe)

"use client";
import { useState } from "react";

// ─── Schema (pre-loaded) ──────────────────────────────────────────────────────
const DEFAULT_SCHEMA = `-- runs: each analysis run for a product
create table runs (
  run_id uuid primary key, date timestamp with time zone,
  product_name text, product_category text,
  config_snapshot jsonb, is_baseline boolean, notes text
);
create table prompts (
  id uuid primary key, run_id uuid references runs(run_id),
  prompt_id text, text text, persona text, intent text,
  context text, region text, prompt_type text, category text,
  generation_method text, model text
);
create table responses (
  response_id uuid primary key, run_id uuid references runs(run_id),
  prompt_id text, platform text, text text, model text,
  latency_ms integer, token_count integer, success boolean,
  error text, metadata jsonb, timestamp timestamp with time zone
);
-- attributes JSONB: { "BrandName": ["attr1","attr2",...] }
create table parsed_responses (
  parsed_id uuid primary key, run_id uuid references runs(run_id),
  response_id uuid references responses(response_id), platform text,
  brands_mentioned jsonb, sentiment jsonb, ranking jsonb,
  attributes jsonb, citations jsonb, text_length integer,
  has_citations boolean, response_complete boolean,
  needs_retry boolean, needs_human_evaluation boolean, error text
);
create table citations (
  citation_id uuid primary key,
  parsed_id uuid references parsed_responses(parsed_id),
  run_id uuid references runs(run_id),
  source text, url text, brand text, verified boolean, verification_error text
);
create table kpi_results (
  kpi_id uuid primary key, run_id uuid references runs(run_id),
  brand text, echo_score float, grade text, visibility_rate float,
  avg_rank float, avg_sentiment float, total_mentions integer, market_position text
);
create table platform_scores (
  score_id uuid primary key, run_id uuid references runs(run_id),
  platform text, echo_score float, visibility_rate float,
  avg_rank float, avg_sentiment float, total_mentions integer
);`;

// ─── Citation classifier SQL ──────────────────────────────────────────────────
// Extract the core brand token (first word, lowercase, alphanumeric only)
// e.g. "Everlane (Tread sneakers)" → "everlane", "Hands of India" → "hands"
// Then check if that token appears in the URL's domain portion.
const CLASSIFY = `CASE
    WHEN c.url ILIKE '%twitter.com%' OR c.url ILIKE '%x.com%'
      OR c.url ILIKE '%linkedin.com%' OR c.url ILIKE '%facebook.com%'
      OR c.url ILIKE '%instagram.com%' OR c.url ILIKE '%reddit.com%'
      OR c.url ILIKE '%youtube.com%'  OR c.url ILIKE '%tiktok.com%'
      OR c.url ILIKE '%pinterest.com%' OR c.url ILIKE '%threads.net%'
      THEN 'Social Media'
    WHEN c.brand IS NOT NULL AND c.brand != ''
      AND LENGTH(LOWER(REGEXP_REPLACE(SPLIT_PART(c.brand, ' ', 1), '[^a-z0-9]', '', 'g'))) >= 3
      AND c.url ILIKE '%' || LOWER(REGEXP_REPLACE(SPLIT_PART(c.brand, ' ', 1), '[^a-z0-9]', '', 'g')) || '%'
      THEN 'Own Brand'
    ELSE 'Third Party Authority'
  END`;

// ─── Pre-wired citation reports ───────────────────────────────────────────────
const CITATION_REPORTS = [
  {
    id: "source_mix", icon: "◉",
    title: "Overall Source Mix",
    desc: "% Own Brand vs Social Media vs Third Party",
    reddit_angle: "How often do AI assistants cite brand pages vs social media vs independent sources?",
    sql: `SELECT ${CLASSIFY} AS citation_type, COUNT(*) AS count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct
FROM citations c WHERE c.url IS NOT NULL
GROUP BY citation_type ORDER BY count DESC;`,
  },
  {
    id: "by_platform", icon: "⊞",
    title: "Source Mix by LLM Platform",
    desc: "How ChatGPT, Claude & Gemini differ in what they cite",
    reddit_angle: "Comparing citation behaviour across ChatGPT, Claude and Gemini — do they trust different source types?",
    sql: `SELECT r.platform, ${CLASSIFY} AS citation_type,
  COUNT(*) AS count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY r.platform), 1) AS pct_within_platform
FROM citations c
JOIN parsed_responses pr ON c.parsed_id = pr.parsed_id
JOIN responses r ON pr.response_id = r.response_id
WHERE c.url IS NOT NULL AND r.platform IS NOT NULL
GROUP BY r.platform, citation_type ORDER BY r.platform, count DESC;`,
  },
  {
    id: "brand_citation", icon: "◈",
    title: "Brand → Citation Pattern",
    desc: "Which brands get cited from authority vs own site vs social",
    reddit_angle: "Some brands dominate AI citations from third-party sources while others only get cited from their own website",
    sql: `SELECT c.brand, COUNT(*) AS total,
  SUM(CASE WHEN ${CLASSIFY} = 'Own Brand' THEN 1 ELSE 0 END) AS own_brand,
  SUM(CASE WHEN ${CLASSIFY} = 'Social Media' THEN 1 ELSE 0 END) AS social,
  SUM(CASE WHEN ${CLASSIFY} = 'Third Party Authority' THEN 1 ELSE 0 END) AS authority,
  ROUND(100.0 * SUM(CASE WHEN ${CLASSIFY} = 'Third Party Authority' THEN 1 ELSE 0 END) / COUNT(*), 1) AS authority_pct
FROM citations c WHERE c.brand IS NOT NULL AND c.url IS NOT NULL
GROUP BY c.brand HAVING COUNT(*) >= 2 ORDER BY authority_pct DESC;`,
  },
  {
    id: "attributes_citation", icon: "⬡",
    title: "Attribute → Citation Correlation",
    desc: "When LLM described brand with attribute X, what source type did it cite?",
    reddit_angle: "Brands described as 'Specialist' in AI responses get cited from authority sources far more often — data inside",
    sql: `WITH brand_attrs AS (
  SELECT pr.parsed_id, kv.key AS brand_name, attr.value AS attribute_text
  FROM parsed_responses pr,
    jsonb_each(pr.attributes) AS kv,
    jsonb_array_elements_text(kv.value) AS attr
  WHERE pr.attributes IS NOT NULL
)
SELECT ba.attribute_text AS brand_attribute,
  COUNT(DISTINCT c.citation_id) AS citations,
  SUM(CASE WHEN ${CLASSIFY} = 'Own Brand' THEN 1 ELSE 0 END) AS own_brand,
  SUM(CASE WHEN ${CLASSIFY} = 'Social Media' THEN 1 ELSE 0 END) AS social,
  SUM(CASE WHEN ${CLASSIFY} = 'Third Party Authority' THEN 1 ELSE 0 END) AS authority,
  ROUND(100.0 * SUM(CASE WHEN ${CLASSIFY} = 'Third Party Authority' THEN 1 ELSE 0 END)
    / NULLIF(COUNT(DISTINCT c.citation_id),0), 1) AS authority_pct
FROM brand_attrs ba
JOIN parsed_responses pr ON ba.parsed_id = pr.parsed_id
JOIN citations c ON c.parsed_id = pr.parsed_id AND LOWER(c.brand) = LOWER(ba.brand_name)
WHERE c.url IS NOT NULL
GROUP BY ba.attribute_text HAVING COUNT(DISTINCT c.citation_id) >= 2
ORDER BY authority_pct DESC LIMIT 20;`,
  },
  {
    id: "intent_citation", icon: "→",
    title: "Prompt Intent → Citation Type",
    desc: "Does intent (comparison vs recommendation) change what gets cited?",
    reddit_angle: "When you ask AI to compare brands vs recommend one, it cites completely different source types",
    sql: `SELECT p.intent, COUNT(DISTINCT c.citation_id) AS total_citations,
  ROUND(100.0 * SUM(CASE WHEN ${CLASSIFY} = 'Own Brand' THEN 1 ELSE 0 END) / NULLIF(COUNT(c.citation_id),0), 1) AS own_brand_pct,
  ROUND(100.0 * SUM(CASE WHEN ${CLASSIFY} = 'Social Media' THEN 1 ELSE 0 END) / NULLIF(COUNT(c.citation_id),0), 1) AS social_pct,
  ROUND(100.0 * SUM(CASE WHEN ${CLASSIFY} = 'Third Party Authority' THEN 1 ELSE 0 END) / NULLIF(COUNT(c.citation_id),0), 1) AS authority_pct
FROM citations c
JOIN parsed_responses pr ON c.parsed_id = pr.parsed_id
JOIN responses r ON pr.response_id = r.response_id
JOIN prompts p ON r.prompt_id = p.prompt_id AND r.run_id = p.run_id
WHERE c.url IS NOT NULL AND p.intent IS NOT NULL
GROUP BY p.intent HAVING COUNT(DISTINCT c.citation_id) >= 2 ORDER BY total_citations DESC;`,
  },
  {
    id: "persona_citation", icon: "◎",
    title: "Persona → Citation Type",
    desc: "Different personas trigger different citation patterns per LLM",
    reddit_angle: "AI cites completely different sources depending on whether you prompt as a researcher vs buyer",
    sql: `SELECT p.persona, r.platform,
  COUNT(DISTINCT c.citation_id) AS total_citations,
  ROUND(100.0 * SUM(CASE WHEN ${CLASSIFY} = 'Own Brand' THEN 1 ELSE 0 END) / NULLIF(COUNT(c.citation_id),0), 1) AS own_brand_pct,
  ROUND(100.0 * SUM(CASE WHEN ${CLASSIFY} = 'Social Media' THEN 1 ELSE 0 END) / NULLIF(COUNT(c.citation_id),0), 1) AS social_pct,
  ROUND(100.0 * SUM(CASE WHEN ${CLASSIFY} = 'Third Party Authority' THEN 1 ELSE 0 END) / NULLIF(COUNT(c.citation_id),0), 1) AS authority_pct
FROM citations c
JOIN parsed_responses pr ON c.parsed_id = pr.parsed_id
JOIN responses r ON pr.response_id = r.response_id
JOIN prompts p ON r.prompt_id = p.prompt_id AND r.run_id = p.run_id
WHERE c.url IS NOT NULL AND p.persona IS NOT NULL
GROUP BY p.persona, r.platform HAVING COUNT(DISTINCT c.citation_id) >= 2
ORDER BY p.persona, total_citations DESC;`,
  },
  {
    id: "top_domains", icon: "↗",
    title: "Top Cited Domains",
    desc: "Which domains appear most across all LLM citations",
    reddit_angle: "These are the domains AI assistants trust most — the authority sites that actually drive AI visibility",
    sql: `SELECT
  LOWER(REGEXP_REPLACE(REGEXP_REPLACE(c.url,'^https?://(www\\.)?',''),'/.*$','')) AS domain,
  COUNT(*) AS citation_count,
  COUNT(DISTINCT c.brand) AS brands_cited,
  STRING_AGG(DISTINCT r.platform, ', ') AS platforms,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS pct_of_all
FROM citations c
JOIN parsed_responses pr ON c.parsed_id = pr.parsed_id
JOIN responses r ON pr.response_id = r.response_id
WHERE c.url IS NOT NULL
GROUP BY domain HAVING COUNT(*) >= 2
ORDER BY citation_count DESC LIMIT 20;`,
  },
];

const TONES = [
  { id: "data",        label: "Data Story" },
  { id: "informative", label: "Informative" },
  { id: "hottake",     label: "Hot Take" },
  { id: "question",    label: "Open Question" },
];

const STEPS = [
  { id: "sql",   label: "Generating SQL..." },
  { id: "query", label: "Querying Supabase..." },
  { id: "post",  label: "Crafting Reddit post..." },
];

// ─── Setup SQL for the RPC function ──────────────────────────────────────────
const SETUP_SQL = `-- Run this in your Supabase SQL Editor (one-time setup)
CREATE OR REPLACE FUNCTION public.execute_readonly_query(query_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '10s'
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Block anything that is not a SELECT
  IF UPPER(TRIM(query_text)) !~ '^(SELECT|WITH)' THEN
    RAISE EXCEPTION 'Only SELECT / WITH queries are allowed';
  END IF;

  EXECUTE 'SELECT jsonb_agg(row_to_json(t))
           FROM (' || query_text || ') t'
    INTO result;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;`;

// ─── Design tokens ────────────────────────────────────────────────────────────
const S = {
  amber: "#c47a0a", amberLight: "#fdf0e0",
  bg: "#f4f3f0", card: "#ffffff",
  border: "#c0bdb8", borderLight: "#d8d5d0",
  input: "#f8f7f4",
  text: "#1a1a1a", textMid: "#444", textSub: "#666",
  green: "#1a6e1a", shadow: "0 2px 8px rgba(0,0,0,0.08)",
};

const card: React.CSSProperties = {
  background: S.card, border: `1px solid ${S.border}`,
  borderRadius: 6, padding: 24, marginBottom: 20, boxShadow: S.shadow,
};
const lbl: React.CSSProperties = {
  display: "block", fontSize: 11, color: S.textMid,
  marginBottom: 6, letterSpacing: "0.06em", fontWeight: "600",
};
const inp: React.CSSProperties = {
  width: "100%", background: S.input, border: "1px solid #b8b5b0",
  borderRadius: 4, padding: "8px 10px", color: S.text, fontSize: 12,
  boxSizing: "border-box", outline: "none", fontFamily: "inherit",
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AkuparaPage() {
  const [tab, setTab] = useState<"nl" | "citations">("nl");
  const [sbUrl, setSbUrl] = useState(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  const [sbKey, setSbKey] = useState(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");
  const [schema, setSchema] = useState(DEFAULT_SCHEMA);
  const [showConfig, setShowConfig] = useState(!process.env.NEXT_PUBLIC_SUPABASE_URL);
  const cfgOk = sbUrl && sbKey;
  const [fnMissing, setFnMissing] = useState(false);
  const [fnChecked, setFnChecked] = useState(false);
  const [setupCopied, setSetupCopied] = useState(false);

  // NL tab
  const [question, setQuestion]   = useState("");
  const [subreddit, setSubreddit] = useState("");
  const [tone, setTone]           = useState("data");
  const [nlStep, setNlStep]       = useState<string | null>(null);
  const [nlSql, setNlSql]         = useState("");
  const [nlPost, setNlPost]       = useState("");
  const [nlErr, setNlErr]         = useState("");
  const [nlSqlOpen, setNlSqlOpen] = useState(false);
  const [nlCopied, setNlCopied]   = useState(false);

  // Citations tab
  const [activeRpt, setActiveRpt]   = useState<string | null>(null);
  const [citStep, setCitStep]       = useState<string | null>(null);
  const [citResults, setCitResults] = useState<any[] | null>(null);
  const [citPost, setCitPost]       = useState("");
  const [citErr, setCitErr]         = useState("");
  const [citSqlOpen, setCitSqlOpen] = useState(false);
  const [citCopied, setCitCopied]   = useState(false);
  const [citSub, setCitSub]         = useState("");
  const [citTone, setCitTone]       = useState("data");

  // ── API helpers ─────────────────────────────────────────────────────────────

  /** Calls /api/akupara → Gemini (server-side, no CORS issues) */
  const callLLM = async (system: string, prompt: string): Promise<string> => {
    const res = await fetch("/api/akupara", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, prompt }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "LLM error");
    return data.text;
  };

  /** Calls Supabase RPC directly — works from browser (CORS enabled) */
  const runQuery = async (sql: string): Promise<any[]> => {
    // Strip trailing semicolons — they cause syntax errors inside the RPC wrapper
    const cleanSql = sql.replace(/;\s*$/, "");
    // First attempt
    let res = await fetch(`${sbUrl}/rest/v1/rpc/execute_readonly_query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: sbKey,
        Authorization: `Bearer ${sbKey}`,
      },
      body: JSON.stringify({ query_text: cleanSql }),
    });

    // If schema cache error, reload cache and retry once
    if (!res.ok) {
      const firstData = await res.json();
      const firstMsg = firstData.message || firstData.hint || "";
      if (firstMsg.includes("schema cache")) {
        // Ask PostgREST to reload its schema cache
        await fetch(`${sbUrl}/rest/v1/`, {
          method: "HEAD",
          headers: {
            apikey: sbKey,
            Authorization: `Bearer ${sbKey}`,
            "Accept-Profile": "public",
          },
        });
        // Wait briefly for cache reload
        await new Promise(r => setTimeout(r, 1500));
        // Retry the query
        res = await fetch(`${sbUrl}/rest/v1/rpc/execute_readonly_query`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: sbKey,
            Authorization: `Bearer ${sbKey}`,
          },
          body: JSON.stringify({ query_text: cleanSql }),
        });
      } else {
        // Not a cache error — handle normally
        if (firstMsg.includes("execute_readonly_query") && (firstMsg.includes("could not find") || firstMsg.includes("does not exist"))) {
          setFnMissing(true);
          throw new Error("The execute_readonly_query function is missing from your Supabase database. See the setup instructions in the Config panel.");
        }
        throw new Error(firstMsg || "Supabase query failed");
      }
    }

    const data = await res.json();
    if (!res.ok) {
      const msg = data.message || data.hint || "Supabase query failed";
      if (msg.includes("execute_readonly_query") && (msg.includes("could not find") || msg.includes("does not exist"))) {
        setFnMissing(true);
        throw new Error("The execute_readonly_query function is missing from your Supabase database. See the setup instructions in the Config panel.");
      }
      throw new Error(msg);
    }
    setFnMissing(false);
    setFnChecked(true);
    // The function returns jsonb (a single value), not rows
    if (Array.isArray(data)) return data;
    if (data === null) return [];
    return Array.isArray(data) ? data : [];
  };

  /** Quick check that the RPC function exists */
  const [testLoading, setTestLoading] = useState(false);
  const testConnection = async () => {
    setTestLoading(true);
    try {
      // Notify PostgREST to reload schema cache before testing
      await fetch(`${sbUrl}/rest/v1/`, {
        method: "HEAD",
        headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
      });
      await new Promise(r => setTimeout(r, 1500));
      await runQuery("SELECT 1 AS ok");
    } catch {
      // error state already set by runQuery
    } finally {
      setTestLoading(false);
    }
  };

  const toneInstructions: Record<string, string> = {
    data:        "Lead with a surprising or striking data point. Hook with numbers.",
    informative: "Write an educational post that teaches something genuinely useful. No promotion.",
    hottake:     "Frame as a bold, counterintuitive finding backed by data. Invite debate.",
    question:    "Share the data as context, end with an open question to drive comments.",
  };

  const buildPostPrompt = (context: string, results: any[], sub: string, t: string) =>
    `Context: ${context}

Data: ${JSON.stringify(results, null, 2)}

Write the Reddit post.${sub ? ` Tailor for r/${sub}.` : ""}`;

  const buildPostSystem = (t: string) =>
    `You are a Reddit expert writing authentic, data-backed posts for technical and marketing communities. People here are skeptical of promotional content.
Tone directive: ${toneInstructions[t]}
Rules: Never mention AkuparaAI by name. Write as genuine research findings. Under 400 words. Plain text only — no markdown headers, no bold, just line breaks. End with a question to drive comments.`;

  // ── NL Generate ─────────────────────────────────────────────────────────────
  const generateNL = async () => {
    if (!question.trim()) return;
    setNlErr(""); setNlSql(""); setNlPost(""); setNlSqlOpen(false); setNlCopied(false);
    try {
      setNlStep("sql");
      const rawSql = await callLLM(
        `You are a PostgreSQL expert. Given this schema, return ONLY a valid SELECT SQL query — no explanation, no markdown, no backticks.\n\nSchema:\n${schema}`,
        `Question: ${question}`
      );
      const cleanSql = rawSql.replace(/```sql|```/gi, "").trim();
      setNlSql(cleanSql);

      setNlStep("query");
      const results = await runQuery(cleanSql);

      setNlStep("post");
      const post = await callLLM(
        buildPostSystem(tone),
        buildPostPrompt(`Question: "${question}"`, results, subreddit, tone)
      );
      setNlPost(post);
      setNlStep("done");
    } catch (e: any) {
      setNlErr(e.message);
      setNlStep("error");
    }
  };

  // ── Citation report run ──────────────────────────────────────────────────────
  const runCitReport = async (rpt: typeof CITATION_REPORTS[0]) => {
    setActiveRpt(rpt.id);
    setCitErr(""); setCitResults(null); setCitPost(""); setCitSqlOpen(false); setCitCopied(false);
    try {
      setCitStep("query");
      const results = await runQuery(rpt.sql);
      setCitResults(results);

      setCitStep("post");
      const post = await callLLM(
        buildPostSystem(citTone),
        buildPostPrompt(rpt.reddit_angle, results, citSub, citTone)
      );
      setCitPost(post);
      setCitStep("done");
    } catch (e: any) {
      setCitErr(e.message);
      setCitStep("error");
    }
  };

  const nlStepIdx = STEPS.findIndex(s => s.id === nlStep);

  // ── Shared UI ────────────────────────────────────────────────────────────────

  const PrimaryBtn = ({ label, onClick, disabled, full }: any) => (
    <button onClick={onClick} disabled={disabled} style={{
      width: full ? "100%" : "auto",
      background: disabled ? "#d8d5d0" : S.amber,
      border: "none", borderRadius: 4,
      color: disabled ? "#999" : "#fff",
      padding: full ? "11px 16px" : "8px 18px",
      fontSize: 12, cursor: disabled ? "not-allowed" : "pointer",
      letterSpacing: "0.08em", textTransform: "uppercase" as const,
      fontWeight: "700", fontFamily: "inherit",
    }}>{label}</button>
  );

  const CopyBtn = ({ text, copied, setCopied }: any) => (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{
        background: copied ? "#f0fdf4" : S.input,
        border: `1px solid ${copied ? "#4ade80" : S.border}`,
        borderRadius: 4, color: copied ? "#16a34a" : S.textMid,
        padding: "6px 14px", fontSize: 11, cursor: "pointer",
        fontWeight: "600", fontFamily: "inherit",
      }}>
      {copied ? "✓ Copied" : "Copy Post"}
    </button>
  );

  const ToneSelector = ({ value, onChange }: any) => (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
      {TONES.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          background: value === t.id ? S.amberLight : S.input,
          border: `1.5px solid ${value === t.id ? S.amber : S.border}`,
          borderRadius: 4, padding: "6px 12px",
          color: value === t.id ? S.amber : S.textMid,
          fontSize: 11, cursor: "pointer",
          fontWeight: value === t.id ? "700" : "500", fontFamily: "inherit",
        }}>{t.label}</button>
      ))}
    </div>
  );

  const SqlToggle = ({ sql, open, setOpen }: any) => (
    <div style={{ border: `1px solid ${S.border}`, borderRadius: 6, marginBottom: 12, overflow: "hidden", boxShadow: S.shadow }}>
      <button onClick={() => setOpen(!open)} style={{
        width: "100%", background: "#f0ede8", border: "none",
        padding: "10px 16px", display: "flex", justifyContent: "space-between",
        cursor: "pointer", fontFamily: "inherit", alignItems: "center",
      }}>
        <span style={{ fontSize: 11, color: S.textMid, letterSpacing: "0.08em", fontWeight: "700" }}>SQL USED</span>
        <span style={{ color: S.textSub, fontSize: 11 }}>{open ? "▲ hide" : "▼ show"}</span>
      </button>
      {open && (
        <div style={{ borderTop: `1px solid ${S.border}`, padding: "14px 16px", background: S.input }}>
          <pre style={{ margin: 0, fontSize: 11, color: S.green, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{sql}</pre>
        </div>
      )}
    </div>
  );

  const ResultsTable = ({ data }: { data: any[] }) => {
    if (!data || data.length === 0)
      return <p style={{ fontSize: 12, color: S.textSub, margin: 0 }}>No results returned.</p>;
    const keys = Object.keys(data[0]);
    return (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr>{keys.map(k => (
              <th key={k} style={{ padding: "7px 10px", background: "#eeebe6", textAlign: "left", color: S.textMid, fontWeight: "700", letterSpacing: "0.04em", borderBottom: `1px solid ${S.border}`, whiteSpace: "nowrap" }}>{k}</th>
            ))}</tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? S.card : S.input }}>
                {keys.map(k => (
                  <td key={k} style={{ padding: "6px 10px", color: S.text, borderBottom: `1px solid ${S.borderLight}`, whiteSpace: "nowrap" }}>
                    {row[k] === null ? <span style={{ color: "#bbb" }}>—</span> : String(row[k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const PipelineProgress = ({ step, stepIdx }: any) => (
    <div style={{ ...card, padding: 20 }}>
      {STEPS.map((s, i) => {
        const current = s.id === step, done = stepIdx > i;
        return (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 0", opacity: done ? 0.4 : current ? 1 : 0.35 }}>
            <div style={{
              width: 20, height: 20, borderRadius: "50%",
              border: `1.5px solid ${current ? S.amber : "#999"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, color: current ? S.amber : "#777", flexShrink: 0, fontWeight: "700",
            }}>
              {done ? "✓" : current
                ? <span style={{ display: "inline-block", animation: "akupara-spin 1s linear infinite" }}>⟳</span>
                : i + 1}
            </div>
            <span style={{ fontSize: 12, color: current ? S.text : "#666", fontWeight: current ? "600" : "400" }}>{s.label}</span>
          </div>
        );
      })}
    </div>
  );

  const PostOutput = ({ post, sub, copied, setCopied }: any) => (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 11, color: S.amber, letterSpacing: "0.1em", fontWeight: "700" }}>
          REDDIT POST {sub ? `→ r/${sub}` : ""}
        </span>
        <CopyBtn text={post} copied={copied} setCopied={setCopied} />
      </div>
      <div style={{ background: S.input, borderRadius: 4, padding: 16, borderLeft: `3px solid ${S.amber}` }}>
        <pre style={{ margin: 0, fontSize: 13, color: S.text, lineHeight: 1.85, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{post}</pre>
      </div>
      <p style={{ margin: "10px 0 0", textAlign: "right", fontSize: 11, color: S.textSub }}>
        Copy → paste into your Reddit tool
      </p>
    </div>
  );

  const ErrorBox = ({ msg }: { msg: string }) => (
    <div style={{ background: "#fff5f5", border: "1px solid #f87171", borderRadius: 6, padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: "#dc2626", fontWeight: "700", marginBottom: 4 }}>ERROR</div>
      <div style={{ fontSize: 12, color: "#991b1b", lineHeight: 1.6 }}>{msg}</div>
    </div>
  );

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Courier New', monospace", background: S.bg, minHeight: "100vh", color: S.text }}>
      <style>{`@keyframes akupara-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } * { box-sizing: border-box; } textarea:focus, input:focus { border-color: ${S.amber} !important; outline: none; box-shadow: 0 0 0 2px rgba(196,122,10,0.10); } textarea::placeholder, input::placeholder { color: #999; }`}</style>

      {/* Header */}
      <div style={{ borderBottom: "2px solid #c8c5c0", background: S.card, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, background: S.amber, borderRadius: "50%" }} />
          <span style={{ fontWeight: "800", letterSpacing: "0.12em", fontSize: 13, color: S.amber }}>AKUPARA AI</span>
          <span style={{ color: "#ccc", margin: "0 6px" }}>/</span>
          <span style={{ fontSize: 12, color: S.textSub }}>insights → reddit</span>
        </div>
        <button onClick={() => setShowConfig(!showConfig)} style={{
          background: showConfig ? S.amberLight : S.input,
          border: `1px solid ${S.border}`, borderRadius: 4,
          color: cfgOk ? S.amber : S.textSub,
          padding: "5px 12px", fontSize: 11, cursor: "pointer",
          letterSpacing: "0.08em", fontWeight: "700", fontFamily: "inherit",
        }}>
          {cfgOk ? "● " : "○ "}CONFIG
        </button>
      </div>

      {/* Tabs */}
      <div style={{ background: S.card, borderBottom: `1px solid ${S.border}`, padding: "0 24px", display: "flex" }}>
        {[{ id: "nl" as const, label: "Ask Your DB" }, { id: "citations" as const, label: "Citation Intelligence" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: "none", border: "none",
            borderBottom: `3px solid ${tab === t.id ? S.amber : "transparent"}`,
            padding: "13px 22px 11px", fontSize: 12, cursor: "pointer",
            fontWeight: tab === t.id ? "700" : "500",
            color: tab === t.id ? S.amber : S.textSub,
            letterSpacing: "0.06em", fontFamily: "inherit", marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 24px" }}>

        {/* Config */}
        {showConfig && (
          <div style={card}>
            <div style={{ fontSize: 11, letterSpacing: "0.1em", color: S.amber, fontWeight: "700", marginBottom: 18 }}>SUPABASE CONFIG</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 14 }}>
              <div>
                <label style={lbl}>SUPABASE URL</label>
                <input value={sbUrl} onChange={e => setSbUrl(e.target.value)} placeholder="https://xxxx.supabase.co" style={inp} />
              </div>
              <div>
                <label style={lbl}>SUPABASE ANON KEY</label>
                <input type="password" value={sbKey} onChange={e => setSbKey(e.target.value)} placeholder="eyJhbGci..." style={inp} />
              </div>
            </div>
            <div>
              <label style={lbl}>SCHEMA <span style={{ fontWeight: "400", color: S.textSub }}>(pre-loaded — edit if needed)</span></label>
              <textarea value={schema} onChange={e => setSchema(e.target.value)} rows={5}
                style={{ ...inp, color: S.green, fontSize: 11, resize: "vertical", lineHeight: 1.6 }} />
            </div>
            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={testConnection} disabled={!sbUrl || !sbKey} style={{
                background: S.input, border: `1px solid ${S.border}`, borderRadius: 4,
                color: S.textMid, padding: "8px 18px", fontSize: 12, cursor: !sbUrl || !sbKey ? "not-allowed" : "pointer",
                letterSpacing: "0.06em", fontWeight: "600", fontFamily: "inherit",
              }}>{testLoading ? "Testing..." : fnChecked && !fnMissing ? "● Connected" : "Test Connection"}</button>
              <PrimaryBtn label="Save & Close" onClick={() => setShowConfig(false)} disabled={!sbUrl || !sbKey} />
            </div>
            {fnMissing && (
              <div style={{ marginTop: 16, background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: 6, padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: "700", color: "#b45309", marginBottom: 8, letterSpacing: "0.08em" }}>
                  SETUP REQUIRED — RPC FUNCTION MISSING
                </div>
                <p style={{ fontSize: 12, color: "#92400e", lineHeight: 1.6, margin: "0 0 10px" }}>
                  The <code style={{ background: "#fef3c7", padding: "1px 4px", borderRadius: 3 }}>execute_readonly_query</code> function does not exist in your Supabase database.
                  Copy the SQL below and run it in your <strong>Supabase SQL Editor</strong> (one-time setup).
                </p>
                <pre style={{ background: "#1a1a1a", color: "#4ade80", padding: 14, borderRadius: 4, fontSize: 11, lineHeight: 1.7, whiteSpace: "pre-wrap", margin: "0 0 10px", overflowX: "auto" }}>{SETUP_SQL}</pre>
                <button onClick={() => { navigator.clipboard.writeText(SETUP_SQL); setSetupCopied(true); setTimeout(() => setSetupCopied(false), 2000); }}
                  style={{
                    background: setupCopied ? "#f0fdf4" : S.input,
                    border: `1px solid ${setupCopied ? "#4ade80" : S.border}`,
                    borderRadius: 4, color: setupCopied ? "#16a34a" : S.textMid,
                    padding: "6px 14px", fontSize: 11, cursor: "pointer",
                    fontWeight: "600", fontFamily: "inherit",
                  }}>
                  {setupCopied ? "✓ SQL Copied" : "Copy SQL"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Ask Your DB ── */}
        {tab === "nl" && (
          <>
            <div style={card}>
              <label style={lbl}>YOUR QUESTION <span style={{ fontWeight: "400", color: S.textSub }}>(plain English)</span></label>
              <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={4}
                placeholder={"Which brands rank #1 on ChatGPT but don't appear on Claude?\nWhich categories have lowest echo scores?\nHow does visibility rate compare across ChatGPT, Claude, Gemini?\nWhich brands grade A on one LLM but D on another?"}
                style={{ ...inp, fontSize: 13, resize: "vertical", lineHeight: 1.7 }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, marginTop: 16, alignItems: "end" }}>
                <div>
                  <label style={lbl}>SUBREDDIT <span style={{ fontWeight: "400", color: S.textSub }}>(optional)</span></label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#777", fontSize: 12, fontWeight: "700" }}>r/</span>
                    <input value={subreddit} onChange={e => setSubreddit(e.target.value)} placeholder="marketing, SEO..." style={{ ...inp, paddingLeft: 24 }} />
                  </div>
                </div>
                <div>
                  <label style={lbl}>TONE</label>
                  <ToneSelector value={tone} onChange={setTone} />
                </div>
              </div>
              <div style={{ marginTop: 18 }}>
                <PrimaryBtn label="→ Generate Reddit Post" onClick={generateNL}
                  disabled={!question.trim() || !cfgOk || (!!nlStep && nlStep !== "done" && nlStep !== "error")} full />
              </div>
            </div>
            {nlStep && nlStep !== "done" && nlStep !== "error" && <PipelineProgress step={nlStep} stepIdx={nlStepIdx} />}
            {nlStep === "error" && <ErrorBox msg={nlErr} />}
            {nlSql && nlStep === "done" && <SqlToggle sql={nlSql} open={nlSqlOpen} setOpen={setNlSqlOpen} />}
            {nlPost && nlStep === "done" && <PostOutput post={nlPost} sub={subreddit} copied={nlCopied} setCopied={setNlCopied} />}
          </>
        )}

        {/* ── TAB: Citation Intelligence ── */}
        {tab === "citations" && (
          <>
            <div style={{ display: "flex", gap: 16, marginBottom: 20, alignItems: "flex-end", flexWrap: "wrap", ...card, padding: "16px 20px" }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={lbl}>SUBREDDIT <span style={{ fontWeight: "400", color: S.textSub }}>(optional)</span></label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#777", fontSize: 12, fontWeight: "700" }}>r/</span>
                  <input value={citSub} onChange={e => setCitSub(e.target.value)} placeholder="marketing, SEO..." style={{ ...inp, paddingLeft: 24 }} />
                </div>
              </div>
              <div>
                <label style={lbl}>POST TONE</label>
                <ToneSelector value={citTone} onChange={setCitTone} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
              {CITATION_REPORTS.map(r => {
                const isActive = activeRpt === r.id;
                const isRunning = isActive && citStep && citStep !== "done" && citStep !== "error";
                return (
                  <div key={r.id} onClick={() => !isRunning && cfgOk && runCitReport(r)} style={{
                    background: isActive ? S.amberLight : S.card,
                    border: `1.5px solid ${isActive ? S.amber : S.border}`,
                    borderRadius: 6, padding: "16px 18px",
                    cursor: cfgOk ? "pointer" : "not-allowed",
                    boxShadow: isActive ? `0 0 0 3px rgba(196,122,10,0.12)` : S.shadow,
                    transition: "all 0.15s", opacity: !cfgOk ? 0.5 : 1,
                  }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span style={{ fontSize: 18, color: isActive ? S.amber : S.textSub, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>{r.icon}</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: "700", color: isActive ? S.amber : S.text, marginBottom: 3 }}>{r.title}</div>
                        <div style={{ fontSize: 11, color: S.textSub, lineHeight: 1.5 }}>{r.desc}</div>
                      </div>
                    </div>
                    {isRunning && <div style={{ marginTop: 10, fontSize: 11, color: S.amber, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ animation: "akupara-spin 1s linear infinite", display: "inline-block" }}>⟳</span>
                      {citStep === "query" ? "Querying Supabase..." : "Generating post..."}
                    </div>}
                    {isActive && citStep === "done" && <div style={{ marginTop: 8, fontSize: 11, color: "#16a34a", fontWeight: "700" }}>✓ Done — results below</div>}
                    {isActive && citStep === "error" && <div style={{ marginTop: 8, fontSize: 11, color: "#dc2626", fontWeight: "700" }}>✗ Error — see below</div>}
                  </div>
                );
              })}
            </div>

            {activeRpt && (
              <>
                {citStep === "error" && <ErrorBox msg={citErr} />}
                {citResults && citStep === "done" && (
                  <>
                    <SqlToggle sql={CITATION_REPORTS.find(r => r.id === activeRpt)?.sql || ""} open={citSqlOpen} setOpen={setCitSqlOpen} />
                    <div style={card}>
                      <div style={{ fontSize: 11, color: S.amber, fontWeight: "700", letterSpacing: "0.08em", marginBottom: 14 }}>
                        {CITATION_REPORTS.find(r => r.id === activeRpt)?.title.toUpperCase()} — RESULTS
                      </div>
                      <ResultsTable data={citResults} />
                    </div>
                    {citPost && <PostOutput post={citPost} sub={citSub} copied={citCopied} setCopied={setCitCopied} />}
                  </>
                )}
              </>
            )}
            {!cfgOk && <p style={{ textAlign: "center", fontSize: 12, color: S.textSub }}>↑ Open Config and enter your Supabase URL + key to run reports</p>}
          </>
        )}
      </div>
    </div>
  );
}
