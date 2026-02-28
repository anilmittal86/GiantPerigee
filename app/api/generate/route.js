import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { MODELS } from "../../config/models";

// Curated Pexels search queries that are VERIFIED to return relevant,
// professional images. Grouped by theme so the AI can pick the best match.
const CURATED_IMAGE_THEMES = {
    analytics: ["laptop analytics graph", "computer data charts", "screen dashboard metrics"],
    marketing: ["digital marketing laptop", "marketing team computer", "content strategy planning"],
    ai_tech: ["artificial intelligence technology", "robot technology modern", "circuit board technology"],
    search: ["search engine laptop", "google search computer", "SEO optimization screen"],
    business: ["business presentation meeting", "startup team office", "professional workspace laptop"],
    data: ["data visualization screen", "big data technology", "database server room"],
    social: ["social media marketing", "social media phone", "online engagement mobile"],
    growth: ["business growth chart", "revenue graph computer", "performance metrics screen"],
    finance: ["stock market trading screen", "investment portfolio chart", "financial planning documents"],
    investing: ["wall street bull statue", "stock exchange trading floor", "investment growth coins"],
    wealth: ["luxury office executive desk", "gold coins investment", "wealth management meeting"],
    innovation: ["lightbulb creative idea", "startup innovation whiteboard", "futuristic technology concept"],
    leadership: ["confident business leader", "executive keynote speech", "team leadership meeting"],
    economy: ["global economy world map", "economic trends newspaper", "market analysis charts"],
};

// Get a themed image from Pexels using curated queries
async function getThemedPexelsImage(theme) {
    const PEXELS_API_KEY = process.env.PEXELS_API_KEY || 'YOUR_PEXELS_API_KEY';
    const queries = CURATED_IMAGE_THEMES[theme] || CURATED_IMAGE_THEMES.analytics;

    for (const query of queries) {
        try {
            const response = await fetch(
                `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape&size=large`,
                {
                    headers: { 'Authorization': PEXELS_API_KEY }
                }
            );

            if (response.ok) {
                const data = await response.json();
                if (data.photos && data.photos.length > 0) {
                    // Pick a random photo from results for variety
                    const photo = data.photos[Math.floor(Math.random() * Math.min(data.photos.length, 8))];
                    return {
                        url: photo.src.large,
                        photographer: photo.photographer,
                        photographer_url: photo.photographer_url
                    };
                }
            }
        } catch (error) {
            console.error(`Pexels search error for query "${query}":`, error);
        }
    }
    return null;
}

// Generate custom Pexels search queries using LLM
async function generateImageQueriesLLM(posts, genAI, modelName = "gemini-2.0-flash") {
    const postContents = posts.map((p, i) => `${i + 1}. "${p.content}"`).join("\n");

    const prompt = `You are an expert at finding the perfect stock photo for a LinkedIn post. Analyze the ACTUAL TOPIC of these posts and generate 4-5 specific Pexels search queries (2-4 words each) that would find visually compelling, on-topic images.

CRITICAL RULES:
- Match the SUBJECT MATTER of the post, not just generic "business" or "technology" images
- If the post is about investing/finance, use finance-related queries (e.g. "stock market trading", "investment portfolio growth", "wall street finance")
- If about startups, use startup imagery (e.g. "startup founders meeting", "venture capital pitch")
- If about AI/tech, use specific tech imagery (e.g. "artificial intelligence neural network", "machine learning data")
- If about marketing, use marketing imagery (e.g. "digital marketing campaign", "brand strategy whiteboard")
- AVOID generic queries like "business meeting" or "laptop office" unless the post is truly about that
- Generate queries from MOST SPECIFIC to LEAST SPECIFIC so we try the best match first
- Think about what image would make someone STOP SCROLLING on LinkedIn when paired with this post

Return ONLY valid JSON array of strings (no markdown):
["most_specific_query", "specific_query", "broader_query", "fallback_query"]

Posts:
${postContents}`;

    try {
        const model = genAI.getGenerativeModel({
            model: modelName,
            tools: [{ googleSearch: {} }]  // grounding enabled
        });
        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();

        // Extract JSON array
        const match = text.match(/\[[\s\S]*\]/);
        if (match) {
            const queries = JSON.parse(match[0]);
            return queries.slice(0, 5); // Return max 5 queries
        }
    } catch (error) {
        console.error("LLM image query generation error:", error);
    }
    return null;
}

// Score a Pexels photo's relevance to the search query using alt text
function scorePhotoRelevance(photo, query) {
    const queryWords = query.toLowerCase().split(/\s+/);
    const alt = (photo.alt || '').toLowerCase();
    const url = (photo.url || '').toLowerCase();

    let score = 0;
    for (const word of queryWords) {
        if (alt.includes(word)) score += 2;
        if (url.includes(word)) score += 1;
    }
    // Prefer landscape photos with good dimensions for LinkedIn
    const ratio = photo.width / photo.height;
    if (ratio >= 1.2 && ratio <= 2.0) score += 1; // Good LinkedIn aspect ratio
    return score;
}

// Get image from Pexels using custom LLM-generated queries
async function getImageFromLLMQueries(queries, usedUrls = new Set()) {
    const PEXELS_API_KEY = process.env.PEXELS_API_KEY || 'YOUR_PEXELS_API_KEY';

    for (const query of queries) {
        try {
            const response = await fetch(
                `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=30&orientation=landscape&size=large`,
                {
                    headers: { 'Authorization': PEXELS_API_KEY }
                }
            );

            if (response.ok) {
                const data = await response.json();
                if (data.photos && data.photos.length > 0) {
                    // Score and rank photos by relevance, filter out already-used URLs
                    const candidates = data.photos
                        .filter(p => !usedUrls.has(p.src.large))
                        .map(p => ({ photo: p, score: scorePhotoRelevance(p, query) }))
                        .sort((a, b) => b.score - a.score);

                    if (candidates.length > 0) {
                        // Pick from top 3 scored results with slight randomness for variety
                        const topN = Math.min(3, candidates.length);
                        const pick = candidates[Math.floor(Math.random() * topN)].photo;
                        return {
                            url: pick.src.large,
                            photographer: pick.photographer,
                            photographer_url: pick.photographer_url,
                            query_used: query,
                            alt: pick.alt || ''
                        };
                    }
                }
            }
        } catch (error) {
            console.error(`Pexels search error for query "${query}":`, error);
        }
    }
    return null;
}

// Fallback: Map post content to best image theme (keyword-based)
function pickImageTheme(postContent, usedThemes) {
    const content = postContent.toLowerCase();

    const themeScores = {
        analytics: ['analytics', 'dashboard', 'metrics', 'measure', 'track', 'monitor', 'kpi', 'performance', 'report'].filter(k => content.includes(k)).length,
        marketing: ['marketing', 'content', 'campaign', 'brand awareness', 'audience', 'engagement', 'strategy'].filter(k => content.includes(k)).length,
        ai_tech: ['ai', 'artificial intelligence', 'chatgpt', 'llm', 'machine learning', 'algorithm', 'automation'].filter(k => content.includes(k)).length,
        search: ['search', 'seo', 'google', 'visibility', 'ranking', 'optimization', 'discover'].filter(k => content.includes(k)).length,
        business: ['business', 'revenue', 'roi', 'enterprise', 'company', 'leadership', 'executive'].filter(k => content.includes(k)).length,
        data: ['data', 'insight', 'analysis', 'intelligence', 'information', 'research'].filter(k => content.includes(k)).length,
        social: ['social media', 'linkedin', 'twitter', 'post', 'share', 'community', 'network'].filter(k => content.includes(k)).length,
        growth: ['growth', 'scale', 'increase', 'improve', 'boost', 'accelerate', 'opportunity'].filter(k => content.includes(k)).length,
        finance: ['stock', 'trading', 'market', 'portfolio', 'returns', 'financial', 'fund', 'asset', 'equity', 'capital', 'dividend'].filter(k => content.includes(k)).length,
        investing: ['invest', 'allocation', 'compounding', 'alpha', 'microcap', 'small cap', 'hedge', 'wealth creation', 'long-term'].filter(k => content.includes(k)).length,
        wealth: ['wealth', 'prosperity', 'affluent', 'high-net-worth', 'retirement', 'financial freedom', 'millionaire'].filter(k => content.includes(k)).length,
        innovation: ['innovation', 'disrupt', 'exponential', 'emerging', 'paradigm', 'frontier', 'breakthrough', 'transform'].filter(k => content.includes(k)).length,
        leadership: ['leader', 'ceo', 'founder', 'visionary', 'mentor', 'executive', 'decision'].filter(k => content.includes(k)).length,
        economy: ['economy', 'macro', 'global', 'gdp', 'inflation', 'recession', 'demographic', 'fiscal'].filter(k => content.includes(k)).length,
    };

    const sorted = Object.entries(themeScores).sort((a, b) => b[1] - a[1]);
    for (const [theme] of sorted) {
        if (!usedThemes.has(theme)) {
            return theme;
        }
    }
    return sorted[0][0];
}


export async function POST(req) {
    try {
        console.log("Generate API called");
        const { product_info, post_type, gemini_api_key: clientKey, subreddit = "AEO_AkuparaAI" } = await req.json();

        let gemini_api_key = clientKey;

        // Fallback to server-side env var if not provided by client
        if (!gemini_api_key) {
            console.log("Using server-side GEMINI_API_KEY");
            gemini_api_key = process.env.GEMINI_API_KEY;
        } else {
            console.log("Using client-side provided key");
        }

        if (!gemini_api_key) {
            console.error("No API key found");
            return NextResponse.json(
                { error: "Gemini API Key is required" },
                { status: 400 }
            );
        }

        const genAI = new GoogleGenerativeAI(gemini_api_key);

        // Model fallback chain: try best model first, fall back on rate limit errors
        const MODEL_CHAIN = MODELS.generate;

        async function tryGenerateWithFallback(prompt) {
            for (let i = 0; i < MODEL_CHAIN.length; i++) {
                const modelName = MODEL_CHAIN[i];
                try {
                    console.log(`Trying model: ${modelName}...`);
                    const model = genAI.getGenerativeModel({
                        model: modelName,
                        tools: [{ googleSearch: {} }],
                    });
                    const result = await model.generateContent(prompt);
                    console.log(`Success with model: ${modelName}`);
                    return result;
                } catch (err) {
                    const isRateLimit = err.status === 429 ||
                        err.message?.includes('429') ||
                        err.message?.includes('RESOURCE_EXHAUSTED') ||
                        err.message?.includes('quota');
                    if (isRateLimit && i < MODEL_CHAIN.length - 1) {
                        console.warn(`Rate limited on ${modelName}, falling back to ${MODEL_CHAIN[i + 1]}...`);
                        continue;
                    }
                    throw err; // Re-throw if not rate limit or no more fallbacks
                }
            }
        }


        let taskInstruction = "";

        switch (post_type) {
            case "research":
                taskInstruction = `Goal: Write 3 Deep Dive / Research-backed LinkedIn posts about the Context.

                Each post MUST follow this structure:
                1. Hook (line 1): A startling statistic, counterintuitive fact, or bold claim that stops the scroll. This line alone must make someone want to read more.
                2. Tension: Why this matters NOW. Create urgency with a "the old way is broken" angle.
                3. Insight: 2-3 short paragraphs with data, research, or expert-level analysis. Use specific numbers when possible.
                4. Takeaway: One clear, actionable lesson the reader walks away with.
                5. CTA: End with a thought-provoking question that invites comments.

                Tone: Authoritative but accessible. Write like a senior industry analyst sharing insider knowledge, not an academic paper.`;
                break;
            case "pun":
                taskInstruction = `Goal: Write 3 Short, Punchy, Humorous LinkedIn posts about the Context.

                Each post MUST follow this structure:
                1. Hook (line 1): A relatable "you know this feeling" setup OR a bold statement that makes people nod.
                2. Build: 2-3 short lines that build the relatable scenario.
                3. Punchline: The witty twist, observation, or "hard truth" delivered with humor.
                4. CTA: A lighthearted question or "Tag someone who..." prompt.

                Tone: Witty, self-aware, slightly irreverent. Think clever LinkedIn satire, NOT corporate cringe. The humor should make people think AND smile.`;
                break;
            case "feature":
                taskInstruction = `Goal: Write 3 Product/Feature Launch LinkedIn posts about the Context.

                Each post MUST follow this structure:
                1. Hook (line 1): Name the painful problem your audience faces. Be specific, not generic.
                2. Agitate: 2-3 lines showing you deeply understand the frustration (failed attempts, wasted time, etc.).
                3. Reveal: Introduce the solution naturally - not as a sales pitch but as "here's what changed."
                4. Proof: One specific benefit with a concrete outcome (saved X hours, increased Y%, etc.).
                5. CTA: Clear next step - "Link in comments" or "DM me for access."

                Tone: Exciting but authentic. You're sharing something genuinely useful, not selling. Focus on transformation, not features.`;
                break;
            case "question":
                taskInstruction = `Goal: Write 3 Engaging, Discussion-Driving LinkedIn posts about the Context.

                Each post MUST follow this structure:
                1. Hook (line 1): A provocative question OR a bold statement that challenges conventional wisdom.
                2. Context: 3-4 short paragraphs that set up the tension. Present both sides or reveal a surprising angle.
                3. Personal take: Share a brief, authentic perspective (1-2 lines).
                4. Open question: End with a specific question that has no obvious right answer - this is what drives comments.

                Tone: Curiosity-driven, intellectually honest. You're starting a real conversation, not fishing for engagement.`;
                break;
            case "mixed":
            default:
                taskInstruction = `Goal: Write 3 Opinionated, High-Impact LinkedIn posts about the Context.
                Style: Assertive thought-leader. Each post should take a clear stance.

                Style Reference (Emulate this energy and structure):
                "Most brands are completely blind when it comes to their AI visibility.

                We spend millions on SEO, yet we have zero infrastructure for tracking ChatGPT.

                You can't optimize what you can't measure.

                Designing 'golden prompts' isn't just a fun exercise; it is the only way to audit your reality."

                Each of the 3 posts should use a DIFFERENT angle:
                1. The Wake-Up Call: Call out a common mistake or blind spot. Make the reader uncomfortable, then offer clarity.
                2. The Strategic Pivot: Argue why the old way is dead. Present the Context as the inevitable future.
                3. The Unpopular Opinion: Take a genuinely controversial stance on the Context. Back it up with logic.`;
                break;
        }

        const prompt = `Role: You are an elite LinkedIn ghostwriter who has grown multiple accounts to 100K+ followers. You understand what makes content go viral on LinkedIn.

        Context (Product/Topic):
        ${product_info}

        Task:
        ${taskInstruction}

        LINKEDIN FORMATTING RULES (CRITICAL - this is what separates viral posts from ignored ones):
        1. **First line is EVERYTHING**: The hook must create curiosity, shock, or a "wait, what?" reaction. LinkedIn shows only ~2 lines before "see more" - your hook must earn that click.
        2. **One idea per line**: Short sentences. One thought per paragraph. Walls of text get scrolled past.
        3. **White space is your weapon**: Use double line breaks (\\n\\n) between EVERY paragraph. Dense text kills engagement on LinkedIn.
        4. **Rhythm and pacing**: Alternate between short punchy lines (3-8 words) and slightly longer explanatory lines. This creates a reading "flow."
        5. **NO structural labels**: Never write "Hook:", "Body:", "CTA:" or any labels. The structure should be invisible.
        6. **Hashtags**: 3-5 relevant hashtags at the very end, separated by a blank line from the main content.
        7. **Length**: 150-300 words per post. Long enough to deliver value, short enough to keep attention.
        8. **Human voice**: Write like a real person sharing a genuine insight, NOT like a marketing AI. Use "I", share perspectives, be conversational.

        ADDITIONAL PLATFORM CONTENT:
        Also generate 3 Reddit posts and 3 Twitter threads:

        **Reddit** (for r/${subreddit}):
            - **Title**: Catchy, specific, no clickbait.
            - **Body**: Conversational, community-focused, discussion-driven. NO HASHTAGS. Write like a helpful community member, not a marketer.

        **Twitter**:
            - **Thread Format**: Each option = array of 3-6 tweets.
            - **Tweet Length**: Each tweet MUST be 280 characters or less.
            - **Tweet 1**: Strong hook. **Tweets 2-4**: Key points. **Last Tweet**: CTA + 1-2 hashtags.
            - **Style**: Conversational, punchy, minimal emojis.

        SCORING (The "Simon Cowell" Rule - be brutally honest):
        - **6.0-7.5**: Competent, professional, but forgettable. Would get a few likes.
        - **7.6-8.9**: Strong hook, real value, "Scroll Stopper." Would get shares and saves.
        - **9.0+**: RARE. Viral-quality. Only score this if it genuinely made you think "damn, that's good."

        Output Schema (return ONLY valid JSON, no markdown wrapping):
        {
            "linkedin": [
                { "content": "full post text here...", "score": 7.2 },
                { "content": "full post text here...", "score": 8.1 },
                { "content": "full post text here...", "score": 7.9 }
            ],
            "reddit": [
                { "title": "Post Title", "content": "post body...", "score": 8.5 },
                ...
            ],
            "twitter": [
                { "thread": ["Tweet 1...", "Tweet 2...", "Tweet 3..."], "score": 8.0 },
                ...
            ]
        }`;

        console.log("Sending prompt to Gemini...");
        const result = await tryGenerateWithFallback(prompt);
        console.log("Received response from Gemini");
        const response = await result.response;
        let text = response.text();
        console.log("Raw text response:", text.substring(0, 500) + "...");

        // Strip markdown code block wrapping if present
        text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

        // Smart JSON extraction that fixes "Bad control character" errors
        // by escaping newlines inside strings.
        function sanitizeAndParseJson(str) {
            // Find start of JSON (either object or array)
            const startObj = str.indexOf('{');
            const startArr = str.indexOf('[');

            let startIndex = -1;
            let openChar = '';
            let closeChar = '';

            if (startObj !== -1 && (startArr === -1 || startObj < startArr)) {
                startIndex = startObj;
                openChar = '{';
                closeChar = '}';
            } else if (startArr !== -1) {
                startIndex = startArr;
                openChar = '[';
                closeChar = ']';
            } else {
                return null;
            }

            let result = "";
            let depth = 0;
            let inString = false;
            let escape = false;

            for (let i = startIndex; i < str.length; i++) {
                const char = str[i];

                // Handle escaping within strings
                if (inString) {
                    if (escape) {
                        escape = false;
                        result += char;
                    } else if (char === '\\') {
                        escape = true;
                        result += char;
                    } else if (char === '"') {
                        inString = false;
                        result += char;
                    } else if (char === '\n' || char === '\r') {
                        // FIX: Escape literal newlines inside strings
                        result += "\\n";
                    } else if (char === '\t') {
                        result += "\\t";
                    } else {
                        result += char;
                    }
                } else {
                    // Not in string - track ALL bracket types for proper depth
                    if (char === '"') {
                        inString = true;
                    } else if (char === '{' || char === '[') {
                        depth++;
                    } else if (char === '}' || char === ']') {
                        depth--;
                    }
                    result += char;

                    if (depth === 0) {
                        // Found the matching closing bracket
                        return JSON.parse(result);
                    }
                }
            }
            return null;
        }

        let posts;
        try {
            posts = sanitizeAndParseJson(text);
        } catch (e) {
            console.error("Smart parse failed:", e);
        }

        if (!posts) {
            // Fallback: try basic regex clean and parse
            console.warn("Extractor failed, trying fallback parse");
            const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();
            // Try to rudimentary fix newlines if basic parse fails
            try {
                posts = JSON.parse(cleanText);
            } catch (e2) {
                // Last ditch: global replace of newlines? Risks breaking structure.
                // Let's assume the smart parser is the main defense.
                throw new Error("Failed to parse posts. Raw response: " + text.substring(0, 100));
            }
        }

        if (posts) {
            // Validate structure
            if (Array.isArray(posts)) {
                // Legacy support or fallback if AI ignores schema
                posts = {
                    linkedin: posts.sort((a, b) => (b.score || 0) - (a.score || 0)),
                    reddit: [],
                    twitter: []
                };
            } else {
                // Sort all arrays if present
                if (posts.linkedin && Array.isArray(posts.linkedin)) {
                    posts.linkedin.sort((a, b) => (b.score || 0) - (a.score || 0));
                }
                if (posts.reddit && Array.isArray(posts.reddit)) {
                    posts.reddit.sort((a, b) => (b.score || 0) - (a.score || 0));
                }
                if (posts.twitter && Array.isArray(posts.twitter)) {
                    posts.twitter.sort((a, b) => (b.score || 0) - (a.score || 0));
                }
            }

            // Add images to LinkedIn posts using LLM-generated custom queries
            if (posts.linkedin && Array.isArray(posts.linkedin) && posts.linkedin.length > 0) {
                console.log("Generating custom image queries with LLM...");

                const usedUrls = new Set();
                const usedThemes = new Set();

                // Generate unique queries for each post using LLM
                for (let i = 0; i < posts.linkedin.length; i++) {
                    const post = posts.linkedin[i];
                    
                    // Generate custom query for this specific post
                    const llmQueries = await generateImageQueriesLLM([post], genAI);
                    
                    let image = null;

                    if (llmQueries && llmQueries.length > 0) {
                        console.log(`Post ${i + 1} LLM queries:`, llmQueries);
                        image = await getImageFromLLMQueries(llmQueries, usedUrls);
                    }
                    // Fallback to theme-based if LLM failed
                    if (!image) {
                        const theme = pickImageTheme(post.content, usedThemes);
                        usedThemes.add(theme);
                        image = await getThemedPexelsImage(theme);
                        if (image) {
                            console.log(`Post ${i + 1} fallback image (${theme})`);
                        }
                    }

                    // Assign image if we got one and it's unique
                    if (image && !usedUrls.has(image.url)) {
                        posts.linkedin[i].image = image;
                        usedUrls.add(image.url);
                        console.log(`Image found for post ${i + 1}: ${image.query_used || 'theme-based'}`);
                    } else {
                        console.log(`No unique image for post ${i + 1}`);
                    }
                }
            }
        }

        console.log("Parsed posts successfully");
        return NextResponse.json({ posts });
    } catch (error) {
        console.error("Generate error:", error);
        return NextResponse.json(
            {
                error: error.message || "Failed to generate posts.",
                details: error.toString()
            },
            { status: 500 }
        );
    }
}
