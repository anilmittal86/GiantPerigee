"use client";

import { useState, useEffect } from "react";

export default function Configuration({ onGenerate }) {
    const [config, setConfig] = useState({
        geminiKey: "",
        linkedinToken: "",
        linkedinUrn: "",
        guidelines: "",
        productInfo: "",
    });

    const [isOpen, setIsOpen] = useState(true);

    useEffect(() => {
        const saved = localStorage.getItem("linkedin-agent-config");
        if (saved) {
            setConfig(JSON.parse(saved));
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

        // Pass relevant data up
        onGenerate({
            geminiKey: config.geminiKey,
            guidelines: config.guidelines,
            productInfo: config.productInfo,
            linkedinToken: config.linkedinToken,
            linkedinUrn: config.linkedinUrn
        });
        setIsOpen(false); // Collapse after generating
    };

    return (
        <div className="card" style={{ marginBottom: "2rem" }}>
            <div
                style={{ display: "flex", justifyContent: "space-between", cursor: "pointer" }}
                onClick={() => setIsOpen(!isOpen)}
            >
                <h3>Configuration & Context</h3>
                <span>{isOpen ? "▲" : "▼"}</span>
            </div>

            {isOpen && (
                <div style={{ marginTop: "1.5rem" }}>
                    <div className="grid">
                        <div>
                            <div className="form-group">
                                <label className="label">Gemini API Key <small style={{ fontWeight: 'normal', color: 'gray' }}>(Optional)</small></label>
                                <input
                                    type="password"
                                    name="geminiKey"
                                    className="input"
                                    value={config.geminiKey}
                                    placeholder="AIzaSy..."
                                    onChange={handleChange}
                                />
                            </div>
                            <div className="form-group">
                                <label className="label">LinkedIn Access Token <small style={{ fontWeight: 'normal', color: 'gray' }}>(Optional)</small></label>
                                <input
                                    type="password"
                                    name="linkedinToken"
                                    className="input"
                                    value={config.linkedinToken}
                                    placeholder="AQWe..."
                                    onChange={handleChange}
                                />
                            </div>
                            <div className="form-group">
                                <label className="label">Company URN (ID) <small style={{ fontWeight: 'normal', color: 'gray' }}>(Optional)</small></label>
                                <input
                                    type="text"
                                    name="linkedinUrn"
                                    className="input"
                                    value={config.linkedinUrn}
                                    placeholder="urn:li:organization:123456"
                                    onChange={handleChange}
                                />
                            </div>
                        </div>

                        <div>
                            <div className="form-group">
                                <label className="label">Marketing Guidelines</label>
                                <textarea
                                    name="guidelines"
                                    className="textarea"
                                    value={config.guidelines}
                                    placeholder="Tone: Professional, witty, use emojis..."
                                    onChange={handleChange}
                                />
                            </div>
                            <div className="form-group">
                                <label className="label">Product / Topic Info</label>
                                <textarea
                                    name="productInfo"
                                    className="textarea"
                                    value={config.productInfo}
                                    placeholder="Today we are launching Feature X..."
                                    onChange={handleChange}
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
            )}
        </div>
    );
}
