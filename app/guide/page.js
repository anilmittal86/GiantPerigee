"use client";

import Link from "next/link";

export default function Guide() {
    return (
        <div className="container">
            <header className="header">
                <h1>User Guide</h1>
                <Link href="/" className="btn-secondary" style={{ textDecoration: "none", padding: "0.5rem 1rem", borderRadius: "8px" }}>
                    ← Back to App
                </Link>
            </header>

            <main style={{ maxWidth: "700px", margin: "0 auto" }}>

                <section style={{ marginBottom: "3rem" }}>
                    <h2 style={{ fontSize: "1.8rem", marginBottom: "1.5rem", color: "var(--primary)" }}>1. Setup API Keys</h2>
                    <p style={{ lineHeight: "1.6", color: "var(--text-dim)", marginBottom: "2rem" }}>
                        To use this agent effectively, you need a few keys. You can add them in the <strong>Advanced Settings</strong> on the home page or set them in your `.env` file for security.
                    </p>

                    <div className="card" style={{ marginBottom: "2rem" }}>
                        <h3 style={{ marginBottom: "1rem" }}>🔑 Gemini API Key (Free)</h3>
                        <p style={{ marginBottom: "1rem", lineHeight: "1.6" }}>
                            Required for the AI to write your posts.
                        </p>
                        <ol style={{ paddingLeft: "1.5rem", lineHeight: "1.8" }}>
                            <li>Go to <a href="https://aistudio.google.com/app/apikey" target="_blank" style={{ color: "var(--primary)" }}>Google AI Studio</a>.</li>
                            <li>Click <strong>Create API key</strong>.</li>
                            <li>Copy the key (starts with <code>AIza...</code>).</li>
                        </ol>
                    </div>

                    <div className="card" style={{ marginBottom: "2rem" }}>
                        <h3 style={{ marginBottom: "1rem" }}>💼 LinkedIn Credentials</h3>
                        <p style={{ marginBottom: "1rem", lineHeight: "1.6" }}>
                            Required to post directly to your Company Page.
                        </p>

                        <h4 style={{ marginTop: "1.5rem", marginBottom: "0.5rem" }}>A. Access Token</h4>
                        <ol style={{ paddingLeft: "1.5rem", lineHeight: "1.8" }}>
                            <li>Go to <a href="https://www.linkedin.com/developers/apps" target="_blank" style={{ color: "var(--primary)" }}>LinkedIn Developers</a>.</li>
                            <li>Create a new App (name it "Marketing Agent").</li>
                            <li>In <strong>Auth</strong>, verify your company page.</li>
                            <li>In <strong>Products</strong>, request access to "Share on LinkedIn" and "Sign In with LinkedIn".</li>
                            <li>Use the <strong>OAuth 2.0 Tools</strong> to generate an Access Token.</li>
                        </ol>

                        <h4 style={{ marginTop: "1.5rem", marginBottom: "0.5rem" }}>B. Company URN (ID)</h4>
                        <ol style={{ paddingLeft: "1.5rem", lineHeight: "1.8" }}>
                            <li>Go to your LinkedIn Company Page as an admin.</li>
                            <li>Look at the URL in your browser: <br /><code style={{ background: "var(--surface-highlight)", padding: "0.2rem 0.4rem", borderRadius: "4px" }}>linkedin.com/admin/organization/12345678</code></li>
                            <li>Your URN is that number: <code>urn:li:organization:12345678</code>.</li>
                        </ol>
                    </div>
                </section>

                <section>
                    <h2 style={{ fontSize: "1.8rem", marginBottom: "1.5rem", color: "var(--primary)" }}>2. How to Use</h2>

                    <div className="card">
                        <div style={{ display: "flex", gap: "1rem", flexDirection: "column" }}>
                            <div>
                                <strong className="badge badge-blue">Step 1: Configure</strong>
                                <p style={{ marginTop: "0.5rem", lineHeight: "1.6" }}>
                                    Enter your <strong>Marketing Guidelines</strong> (e.g., "Professional but witty") and your <strong>Product/Topic</strong> (e.g., "New AI feature launch").
                                </p>
                            </div>

                            <hr style={{ border: "0", borderTop: "1px solid var(--border)", width: "100%", margin: "1rem 0" }} />

                            <div>
                                <strong className="badge badge-purple">Step 2: Generate</strong>
                                <p style={{ marginTop: "0.5rem", lineHeight: "1.6" }}>
                                    Click <strong>Generate Posts</strong>. The AI will research (if grounding is on) and write 3 distinct options (Hook, Insight, CTA).
                                </p>
                            </div>

                            <hr style={{ border: "0", borderTop: "1px solid var(--border)", width: "100%", margin: "1rem 0" }} />

                            <div>
                                <strong className="badge badge-green">Step 3: Edit & Post</strong>
                                <p style={{ marginTop: "0.5rem", lineHeight: "1.6" }}>
                                    Click into any post to <strong>edit text</strong> (fix URLs, facts). Then click <strong>Post to LinkedIn</strong> to publish immediately.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                <div style={{ marginTop: "4rem", textAlign: "center", color: "var(--text-dim)" }}>
                    <p>Built with Next.js & Gemini 2.0</p>
                </div>
            </main>
        </div>
    );
}
