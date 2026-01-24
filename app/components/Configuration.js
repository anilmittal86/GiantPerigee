"use client";

import { useState, useEffect } from "react";

export default function Configuration({ onGenerate }) {
    const [config, setConfig] = useState({
        geminiKey: "",
        linkedinToken: "",
        linkedinUrn: "",
        twitterApiKey: "",
        twitterApiSecret: "",
        twitterAccessToken: "",
        twitterAccessSecret: "",
        subreddit: "AEO_AkuparaAI",
        postType: "mixed",
        productInfo: "",
    });

    const [isOpen, setIsOpen] = useState(true);
    const [showAdvanced, setShowAdvanced] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem("linkedin-agent-config");
        if (saved) {
            const parsed = JSON.parse(saved);
            // Merge with default/current state to ensure new keys (like subreddit) exist
            setConfig(prev => ({ ...prev, ...parsed }));
        }
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        const newConfig = { ...config, [name]: value };
        setConfig(newConfig);
        localStorage.setItem("linkedin-agent-config", JSON.stringify(newConfig));
    };

    const handleGenerateClick = () => {
        // if (!config.geminiKey) return alert("Gemini API Key is required"); // Optional now
        if (!config.productInfo) return alert("Please provide product info");

        const wordCount = config.productInfo.trim().split(/\s+/).length;
        if (wordCount < 10) {
            return alert(`Please provide more context (at least 10 words). Current: ${wordCount} words.\n\nBetter context = Better posts!`);
        }

        // Pass relevant data up
        onGenerate({
            geminiKey: config.geminiKey,
            postType: config.postType,
            productInfo: config.productInfo,
            linkedinToken: config.linkedinToken,
            linkedinUrn: config.linkedinUrn,
            twitterApiKey: config.twitterApiKey,
            twitterApiSecret: config.twitterApiSecret,
            twitterAccessToken: config.twitterAccessToken,
            twitterAccessSecret: config.twitterAccessSecret,
            subreddit: config.subreddit
        });
        setIsOpen(false); // Collapse after generating
    };

    return (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
            <div
                style={{ display: "flex", justifyContent: "space-between", cursor: "pointer", alignItems: "center" }}
                onClick={() => setIsOpen(!isOpen)}
            >
                <h3 style={{ fontSize: "1.1rem" }}>Configuration & Context</h3>
                <span style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>{isOpen ? "▲" : "▼"}</span>
            </div>

            {isOpen && (
                <div style={{ marginTop: "1rem" }}>
                    <div className="grid" style={{ gap: "1.5rem" }}>
                        <div style={{ marginBottom: "0.5rem" }}>
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    cursor: "pointer",
                                    color: "var(--text-dim)",
                                    fontSize: "0.85rem",
                                    fontWeight: 500,
                                    userSelect: "none"
                                }}
                                onClick={() => setShowAdvanced(!showAdvanced)}
                            >
                                <span style={{ marginRight: "0.4rem", fontSize: "0.7rem" }}>{showAdvanced ? "▼" : "▶"}</span>
                                <span>Advanced Settings (API Keys)</span>
                            </div>

                            {showAdvanced && (
                                <div style={{
                                    marginTop: "0.75rem",
                                    padding: "1rem",
                                    background: "var(--surface-highlight)",
                                    borderRadius: "8px",
                                    border: "1px solid var(--border)"
                                }}>
                                    <div className="form-group" style={{ marginBottom: "1rem" }}>
                                        <label className="label">Gemini API Key</label>
                                        <input
                                            type="password"
                                            name="geminiKey"
                                            className="input"
                                            value={config.geminiKey}
                                            placeholder="Leave empty to use server env var"
                                            onChange={handleChange}
                                        />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: "1rem" }}>
                                        <label className="label">LinkedIn Access Token</label>
                                        <input
                                            type="password"
                                            name="linkedinToken"
                                            className="input"
                                            value={config.linkedinToken}
                                            placeholder="Leave empty to use server env var"
                                            onChange={handleChange}
                                        />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: "1rem" }}>
                                        <label className="label">Company URN (ID)</label>
                                        <input
                                            type="text"
                                            name="linkedinUrn"
                                            className="input"
                                            value={config.linkedinUrn}
                                            placeholder="urn:li:organization:..."
                                            onChange={handleChange}
                                        />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: "1rem" }}>
                                        <label className="label">Twitter API Key (Consumer Key)</label>
                                        <input
                                            type="password"
                                            name="twitterApiKey"
                                            className="input"
                                            value={config.twitterApiKey}
                                            placeholder="Leave empty to use server env var"
                                            onChange={handleChange}
                                        />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: "1rem" }}>
                                        <label className="label">Twitter API Secret (Consumer Secret)</label>
                                        <input
                                            type="password"
                                            name="twitterApiSecret"
                                            className="input"
                                            value={config.twitterApiSecret}
                                            placeholder="Leave empty to use server env var"
                                            onChange={handleChange}
                                        />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: "1rem" }}>
                                        <label className="label">Twitter Access Token</label>
                                        <input
                                            type="password"
                                            name="twitterAccessToken"
                                            className="input"
                                            value={config.twitterAccessToken}
                                            placeholder="Leave empty to use server env var"
                                            onChange={handleChange}
                                        />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: "1rem" }}>
                                        <label className="label">Twitter Access Token Secret</label>
                                        <input
                                            type="password"
                                            name="twitterAccessSecret"
                                            className="input"
                                            value={config.twitterAccessSecret}
                                            placeholder="Leave empty to use server env var"
                                            onChange={handleChange}
                                        />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: "0" }}>
                                        <label className="label">Target Subreddit</label>
                                        <input
                                            type="text"
                                            name="subreddit"
                                            className="input"
                                            value={config.subreddit}
                                            placeholder="AEO_AkuparaAI (without r/)"
                                            onChange={handleChange}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div>
                            <div className="form-group">
                                <label className="label">Post Type</label>
                                <div className="pill-container">
                                    {[
                                        { id: 'mixed', label: 'Mixed', icon: '🎯' },
                                        { id: 'research', label: 'Deep Dive', icon: '📊' },
                                        { id: 'feature', label: 'Feature', icon: '⚡' },
                                        { id: 'pun', label: 'Humor', icon: '😊' },
                                        { id: 'question', label: 'Question', icon: '❓' }
                                    ].map(type => (
                                        <button
                                            key={type.id}
                                            className={`pill-btn ${config.postType === type.id ? 'active' : ''}`}
                                            onClick={() => handleChange({ target: { name: 'postType', value: type.id } })}
                                        >
                                            <span className="emoji" style={{ fontSize: "1.1rem" }}>{type.icon}</span>
                                            {type.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="form-group" style={{ marginBottom: "0.5rem" }}>
                                <label className="label">Product / Topic Info</label>
                                <textarea
                                    name="productInfo"
                                    className="textarea"
                                    value={config.productInfo}
                                    placeholder="Today we are launching Feature X..."
                                    onChange={handleChange}
                                    style={{ minHeight: "100px" }}
                                />
                            </div>
                        </div>
                    </div>

                    <div style={{ marginTop: "1rem", textAlign: "right" }}>
                        <button className="btn" onClick={handleGenerateClick}>
                            Generate Posts
                        </button>
                    </div>
                </div>
            )
            }
        </div >
    );
}
