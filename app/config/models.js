// Centralized LLM model configuration
// Change models here instead of hunting through individual API routes

export const MODELS = {
  // Used for post generation (LinkedIn, Reddit, Twitter) with fallback chain.
  // If the first model is rate-limited (429), it falls back to the next one.
  generate: [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
  ],

  // Used for SQL generation and Reddit post analysis (akupara route)
  akupara: "gemini-2.0-flash",
};
