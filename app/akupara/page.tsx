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

// ─── SQL helpers ─────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/'/g, "''");

const CATEGORIES_SQL = `SELECT DISTINCT product_category FROM runs
WHERE product_category IS NOT NULL ORDER BY product_category`;

const DATA_BANNER_SQL = (cat: string) => `SELECT
  COUNT(DISTINCT c.citation_id) AS total_citations,
  COUNT(DISTINCT c.brand) AS brands_analyzed,
  COUNT(DISTINCT r2.platform) AS platforms,
  COUNT(DISTINCT ru.run_id) AS runs
FROM citations c
JOIN runs ru ON c.run_id = ru.run_id
JOIN parsed_responses pr ON c.parsed_id = pr.parsed_id
JOIN responses r2 ON pr.response_id = r2.response_id
WHERE ru.product_category = '${esc(cat)}'
  AND c.url IS NOT NULL`;

// ─── Citation Intelligence Reports ───────────────────────────────────────────
// Category-filtered. 5 reports answering 3 questions.
type CitReport = {
  id: string; icon: string; title: string;
  question: string; desc: string; reddit_angle: string;
  sql: (cat: string) => string;
};

const CITATION_REPORTS: CitReport[] = [
  // ── Q1+Q2: WHAT CONTENT TO CREATE & WHERE ──────────────────────────────────
  {
    id: "intent_citations", icon: "⚡",
    question: "What content to create & where to place it",
    title: "Intent → Citations & Placement",
    desc: "Which intent types generate citations in this category, and from what source types",
    reddit_angle: "We analyzed AI citation patterns by question type — comparison queries generate way more third-party citations than recommendations",
    sql: (cat) => `SELECT p.intent,
  COUNT(DISTINCT c.citation_id) AS citations,
  ROUND(100.0 * SUM(CASE WHEN ${CLASSIFY} = 'Own Brand' THEN 1 ELSE 0 END)::numeric
    / NULLIF(COUNT(c.citation_id), 0), 0) AS own_brand_pct,
  ROUND(100.0 * SUM(CASE WHEN ${CLASSIFY} = 'Social Media' THEN 1 ELSE 0 END)::numeric
    / NULLIF(COUNT(c.citation_id), 0), 0) AS social_pct,
  ROUND(100.0 * SUM(CASE WHEN ${CLASSIFY} = 'Third Party Authority' THEN 1 ELSE 0 END)::numeric
    / NULLIF(COUNT(c.citation_id), 0), 0) AS authority_pct
FROM citations c
JOIN parsed_responses pr ON c.parsed_id = pr.parsed_id
JOIN responses r ON pr.response_id = r.response_id
JOIN prompts p ON r.prompt_id = p.prompt_id AND r.run_id = p.run_id
JOIN runs ru ON p.run_id = ru.run_id
WHERE ru.product_category = '${esc(cat)}'
  AND c.url IS NOT NULL AND p.intent IS NOT NULL
GROUP BY p.intent
HAVING COUNT(DISTINCT c.citation_id) >= 2
ORDER BY citations DESC`,
  },
  {
    id: "winning_attributes", icon: "◆",
    question: "What content to create",
    title: "Winning Attributes for Rank #1",
    desc: "In this category, which brand attributes correlate with ranking #1 vs #3+",
    reddit_angle: "We compared brand attributes of #1-ranked vs lower-ranked brands in AI responses — the winning traits are not what you'd expect",
    sql: (cat) => `WITH brand_ranks AS (
  SELECT pr.parsed_id, kv.key AS brand,
    MIN((rv.value)::numeric) AS best_rank
  FROM parsed_responses pr
  JOIN runs ru ON pr.run_id = ru.run_id,
    jsonb_each(pr.ranking) AS kv,
    jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(kv.value) = 'array' THEN kv.value ELSE jsonb_build_array(kv.value) END
    ) AS rv
  WHERE ru.product_category = '${esc(cat)}'
  GROUP BY pr.parsed_id, kv.key
),
brand_attrs AS (
  SELECT pr.parsed_id, kv.key AS brand, attr.value AS attribute
  FROM parsed_responses pr
  JOIN runs ru ON pr.run_id = ru.run_id,
    jsonb_each(pr.attributes) AS kv,
    jsonb_array_elements_text(kv.value) AS attr
  WHERE ru.product_category = '${esc(cat)}'
    AND pr.attributes IS NOT NULL
)
SELECT ba.attribute,
  SUM(CASE WHEN br.best_rank = 1 THEN 1 ELSE 0 END) AS rank_1,
  SUM(CASE WHEN br.best_rank >= 3 THEN 1 ELSE 0 END) AS rank_3_plus,
  ROUND(SUM(CASE WHEN br.best_rank = 1 THEN 1 ELSE 0 END)::numeric
    / NULLIF(SUM(CASE WHEN br.best_rank >= 3 THEN 1 ELSE 0 END), 0), 1) AS win_ratio
FROM brand_attrs ba
JOIN brand_ranks br ON br.parsed_id = ba.parsed_id AND LOWER(br.brand) = LOWER(ba.brand)
GROUP BY ba.attribute
HAVING SUM(CASE WHEN br.best_rank = 1 THEN 1 ELSE 0 END)
     + SUM(CASE WHEN br.best_rank >= 3 THEN 1 ELSE 0 END) >= 3
ORDER BY win_ratio DESC NULLS LAST
LIMIT 20`,
  },
  // ── Q2: WHERE TO PUBLISH ───────────────────────────────────────────────────
  {
    id: "authority_domains", icon: "↗",
    question: "Where to publish content",
    title: "Top Authority Domains",
    desc: "In this category, which third-party domains get cited most by LLMs",
    reddit_angle: "These are the exact domains AI assistants cite most for this category — if you want AI visibility, get on these sites",
    sql: (cat) => `SELECT
  LOWER(REGEXP_REPLACE(REGEXP_REPLACE(c.url, '^https?://(www\\.)?', ''), '/.*$', '')) AS domain,
  COUNT(*) AS citations,
  COUNT(DISTINCT c.brand) AS brands_cited,
  STRING_AGG(DISTINCT r.platform, ', ') AS platforms,
  ROUND(100.0 * COUNT(*)::numeric / SUM(COUNT(*)) OVER (), 1) AS pct_of_category
FROM citations c
JOIN parsed_responses pr ON c.parsed_id = pr.parsed_id
JOIN responses r ON pr.response_id = r.response_id
JOIN runs ru ON c.run_id = ru.run_id
WHERE ru.product_category = '${esc(cat)}'
  AND c.url IS NOT NULL
  AND ${CLASSIFY} = 'Third Party Authority'
GROUP BY domain
HAVING COUNT(*) >= 2
ORDER BY citations DESC
LIMIT 20`,
  },
  {
    id: "platform_source_mix", icon: "⊞",
    question: "Where to publish content",
    title: "Source Mix by LLM Platform",
    desc: "In this category, how ChatGPT, Claude & Gemini differ in what they cite",
    reddit_angle: "ChatGPT, Claude and Gemini cite completely different source types — your placement strategy should differ per platform",
    sql: (cat) => `SELECT r.platform,
  COUNT(*) AS total_citations,
  ROUND(100.0 * SUM(CASE WHEN ${CLASSIFY} = 'Own Brand' THEN 1 ELSE 0 END)::numeric / COUNT(*), 0) AS own_brand_pct,
  ROUND(100.0 * SUM(CASE WHEN ${CLASSIFY} = 'Social Media' THEN 1 ELSE 0 END)::numeric / COUNT(*), 0) AS social_pct,
  ROUND(100.0 * SUM(CASE WHEN ${CLASSIFY} = 'Third Party Authority' THEN 1 ELSE 0 END)::numeric / COUNT(*), 0) AS authority_pct
FROM citations c
JOIN parsed_responses pr ON c.parsed_id = pr.parsed_id
JOIN responses r ON pr.response_id = r.response_id
JOIN runs ru ON c.run_id = ru.run_id
WHERE ru.product_category = '${esc(cat)}'
  AND c.url IS NOT NULL AND r.platform IS NOT NULL
GROUP BY r.platform
ORDER BY total_citations DESC`,
  },
  // ── Q3: HOW DO LLMs PICK UP CONTENT ────────────────────────────────────────
  {
    id: "source_vs_rank", icon: "◎",
    question: "How LLMs pick up content",
    title: "Does Source Type Predict Rank?",
    desc: "In this category, do brands with more third-party citations rank higher?",
    reddit_angle: "We checked whether the type of sources AI cites for a brand predicts its ranking — here's what the data shows",
    sql: (cat) => `WITH brand_source AS (
  SELECT c.brand,
    ${CLASSIFY} AS source_type,
    COUNT(*) AS cnt
  FROM citations c
  JOIN runs ru ON c.run_id = ru.run_id
  WHERE ru.product_category = '${esc(cat)}'
    AND c.url IS NOT NULL AND c.brand IS NOT NULL
  GROUP BY c.brand, source_type
),
brand_dominant AS (
  SELECT DISTINCT ON (brand) brand, source_type AS dominant_source
  FROM brand_source
  ORDER BY brand, cnt DESC
),
brand_kpi AS (
  SELECT k.brand,
    ROUND(AVG(k.avg_rank)::numeric, 1) AS avg_rank,
    ROUND(AVG(k.avg_sentiment)::numeric, 2) AS avg_sentiment,
    SUM(k.total_mentions) AS total_mentions
  FROM kpi_results k
  JOIN runs ru ON k.run_id = ru.run_id
  WHERE ru.product_category = '${esc(cat)}'
  GROUP BY k.brand
)
SELECT bd.dominant_source,
  COUNT(*) AS brand_count,
  ROUND(AVG(bk.avg_rank)::numeric, 1) AS avg_rank,
  ROUND(AVG(bk.avg_sentiment)::numeric, 2) AS avg_sentiment,
  SUM(bk.total_mentions) AS total_mentions
FROM brand_dominant bd
JOIN brand_kpi bk ON LOWER(bd.brand) = LOWER(bk.brand)
GROUP BY bd.dominant_source
ORDER BY avg_rank ASC`,
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
  const [citCategory, setCitCategory] = useState("");
  const [categories, setCategories]   = useState<string[]>([]);
  const [catLoading, setCatLoading]   = useState(false);
  const [dataBanner, setDataBanner]   = useState<any>(null);
  const [bannerLoading, setBannerLoading] = useState(false);
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

  /** Fetch available categories from the DB */
  const fetchCategories = async () => {
    setCatLoading(true);
    try {
      const rows = await runQuery(CATEGORIES_SQL);
      setCategories(rows.map((r: any) => r.product_category).filter(Boolean));
    } catch { /* runQuery sets error state */ }
    finally { setCatLoading(false); }
  };

  /** Fetch data context banner for selected category */
  const fetchBanner = async (cat: string) => {
    setBannerLoading(true); setDataBanner(null);
    try {
      const rows = await runQuery(DATA_BANNER_SQL(cat));
      if (rows.length > 0) setDataBanner(rows[0]);
    } catch { /* ignore */ }
    finally { setBannerLoading(false); }
  };

  /** When category changes, load banner and reset reports */
  const onCategoryChange = (cat: string) => {
    setCitCategory(cat);
    setActiveRpt(null); setCitResults(null); setCitPost(""); setCitErr("");
    if (cat) fetchBanner(cat);
    else setDataBanner(null);
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
  const runCitReport = async (rpt: CitReport) => {
    if (!citCategory) return;
    setActiveRpt(rpt.id);
    setCitErr(""); setCitResults(null); setCitPost(""); setCitSqlOpen(false); setCitCopied(false);
    try {
      setCitStep("query");
      const sql = rpt.sql(citCategory);
      const results = await runQuery(sql);
      setCitResults(results);

      setCitStep("post");
      const post = await callLLM(
        buildPostSystem(citTone),
        buildPostPrompt(`Category: ${citCategory}. ${rpt.reddit_angle}`, results, citSub, citTone)
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
            {/* Category selector + Reddit config */}
            <div style={card}>
              <div style={{ fontSize: 11, letterSpacing: "0.1em", color: S.amber, fontWeight: "700", marginBottom: 16 }}>CITATION INTELLIGENCE</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={lbl}>CATEGORY</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {categories.length > 0 ? (
                      <select value={citCategory} onChange={e => onCategoryChange(e.target.value)}
                        style={{ ...inp, cursor: "pointer", flex: 1 }}>
                        <option value="">Select a category...</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : (
                      <button onClick={fetchCategories} disabled={!cfgOk || catLoading}
                        style={{ ...inp, cursor: cfgOk ? "pointer" : "not-allowed", textAlign: "left", color: S.textSub, flex: 1 }}>
                        {catLoading ? "Loading..." : "Load categories from DB"}
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label style={lbl}>SUBREDDIT <span style={{ fontWeight: "400", color: S.textSub }}>(optional)</span></label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#777", fontSize: 12, fontWeight: "700" }}>r/</span>
                    <input value={citSub} onChange={e => setCitSub(e.target.value)} placeholder="marketing, SEO..." style={{ ...inp, paddingLeft: 24 }} />
                  </div>
                </div>
              </div>
              <div>
                <label style={lbl}>POST TONE</label>
                <ToneSelector value={citTone} onChange={setCitTone} />
              </div>
            </div>

            {/* Data context banner */}
            {bannerLoading && (
              <div style={{ ...card, padding: "14px 20px", textAlign: "center", fontSize: 12, color: S.textSub }}>
                Loading data summary...
              </div>
            )}
            {dataBanner && citCategory && (
              <div style={{ ...card, padding: "14px 20px", background: S.amberLight, border: `1px solid ${S.amber}` }}>
                <span style={{ fontSize: 12, color: S.text, lineHeight: 1.6 }}>
                  Based on <strong>{dataBanner.total_citations}</strong> citations across <strong>{dataBanner.brands_analyzed}</strong> brands
                  in <strong>{citCategory}</strong> from <strong>{dataBanner.platforms}</strong> platforms
                  ({dataBanner.runs} analysis runs)
                </span>
              </div>
            )}

            {/* Report cards */}
            {citCategory && (
              <>
                {/* Group by question */}
                {["What content to create & where to place it", "What content to create", "Where to publish content", "How LLMs pick up content"].map(q => {
                  const reportsInGroup = CITATION_REPORTS.filter(r => r.question === q);
                  if (reportsInGroup.length === 0) return null;
                  return (
                    <div key={q} style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 10, letterSpacing: "0.12em", color: S.textSub, fontWeight: "700", marginBottom: 10, textTransform: "uppercase" as const }}>{q}</div>
                      <div style={{ display: "grid", gridTemplateColumns: reportsInGroup.length > 1 ? "1fr 1fr" : "1fr", gap: 12 }}>
                        {reportsInGroup.map(r => {
                          const isActive = activeRpt === r.id;
                          const isRunning = isActive && citStep && citStep !== "done" && citStep !== "error";
                          return (
                            <div key={r.id} onClick={() => !isRunning && runCitReport(r)} style={{
                              background: isActive ? S.amberLight : S.card,
                              border: `1.5px solid ${isActive ? S.amber : S.border}`,
                              borderRadius: 6, padding: "16px 18px",
                              cursor: "pointer",
                              boxShadow: isActive ? `0 0 0 3px rgba(196,122,10,0.12)` : S.shadow,
                              transition: "all 0.15s",
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
                    </div>
                  );
                })}
              </>
            )}

            {/* Results area */}
            {activeRpt && (
              <>
                {citStep === "error" && <ErrorBox msg={citErr} />}
                {citResults && citStep === "done" && (
                  <>
                    <SqlToggle sql={CITATION_REPORTS.find(r => r.id === activeRpt)?.sql(citCategory) || ""} open={citSqlOpen} setOpen={setCitSqlOpen} />
                    <div style={card}>
                      <div style={{ fontSize: 11, color: S.amber, fontWeight: "700", letterSpacing: "0.08em", marginBottom: 14 }}>
                        {CITATION_REPORTS.find(r => r.id === activeRpt)?.title.toUpperCase()} — {citCategory.toUpperCase()}
                      </div>
                      <ResultsTable data={citResults} />
                    </div>
                    {citPost && <PostOutput post={citPost} sub={citSub} copied={citCopied} setCopied={setCitCopied} />}
                  </>
                )}
              </>
            )}

            {!cfgOk && <p style={{ textAlign: "center", fontSize: 12, color: S.textSub }}>↑ Open Config and enter your Supabase URL + key to run reports</p>}
            {cfgOk && !citCategory && categories.length > 0 && (
              <p style={{ textAlign: "center", fontSize: 12, color: S.textSub, marginTop: 20 }}>Select a category above to see reports</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
