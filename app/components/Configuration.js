"use client";

import { useState, useEffect } from "react";

export default function Configuration({ onGenerate }) {
    const [config, setConfig] = useState({
        geminiKey: "",
        linkedinToken: "",
        linkedinUrn: "",
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
        if (!config.productInfo) return alert("Please provide product info");

        const wordCount = config.productInfo.trim().split(/\s+/).length;
        if (wordCount < 10) {
            return alert(`Please provide more context (at least 10 words). Current: ${wordCount} words.\n\nBetter context = Better posts!`);
        }

        onGenerate({
            geminiKey: config.geminiKey,
            postType: config.postType,
            productInfo: config.productInfo,
            linkedinToken: config.linkedinToken,
            linkedinUrn: config.linkedinUrn,
            subreddit: config.subreddit
        });
        setIsOpen(false);
    };

    return (
        <div className="card fade-in" style={{ marginBottom: "1.5rem" }}>
            <div
                style={{ display: "flex", justifyContent: "space-between", cursor: "pointer", alignItems: "center" }}
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="section-header" style={{ marginBottom: 0 }}>
                    <div className="section-icon">⚙️</div>
                    <div>
                        <div className="section-title">Configuration & Context</div>
                        <div className="section-description">Set up your content parameters</div>
                    </div>
                </div>
                <span style={{
                    color: "var(--text-dim)",
                    fontSize: "0.75rem",
                    width: "28px",
                    height: "28px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--surface-elevated)",
                    border: "1px solid var(--border)",
                    transition: "all 0.2s ease"
                }}>{isOpen ? "▲" : "▼"}</span>
            </div>

            {isOpen && (
                <div style={{ marginTop: "1.5rem" }}>
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
                                    userSelect: "none",
                                    padding: "0.5rem 0.75rem",
                                    borderRadius: "var(--radius-sm)",
                                    transition: "all 0.2s ease"
                                }}
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-elevated)"}
                                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                            >
                                <span style={{ marginRight: "0.5rem", fontSize: "0.65rem", transition: "transform 0.2s ease", transform: showAdvanced ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                                <span>Advanced Settings (API Keys)</span>
                            </div>

                            {showAdvanced && (
                                <div className="fade-in" style={{
                                    marginTop: "0.75rem",
                                    padding: "1.25rem",
                                    background: "var(--background-secondary)",
                                    borderRadius: "var(--radius-md)",
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
                                    style={{ minHeight: "120px" }}
                                />
                            </div>
                        </div>
                    </div>

                    <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end" }}>
                        <button className="btn" onClick={handleGenerateClick} style={{ padding: "0.875rem 2.5rem", fontSize: "1rem" }}>
                            ✨ Generate Posts
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
