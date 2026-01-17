"use client";

import { useState } from "react";
import Configuration from "./components/Configuration";
import PostGenerator from "./components/PostGenerator";
import axios from "axios";

export default function Home() {
    const [generatedPosts, setGeneratedPosts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [configData, setConfigData] = useState({});

    const handleGenerate = async (config) => {
        setConfigData(config); // Save for posting later
        setLoading(true);
        setGeneratedPosts([]);

        try {
            const res = await axios.post("/api/generate", {
                product_info: config.productInfo,
                guidelines: config.guidelines,
                gemini_api_key: config.geminiKey,
            }, {
                timeout: 30000 // 30 seconds timeout
            });

            if (res.data.posts) {
                setGeneratedPosts(res.data.posts);
            }
        } catch (err) {
            alert("Failed to generate posts: " + (err.response?.data?.error || err.message));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container">
            <header className="header">
                <h1>LinkedIn Marketing Agent</h1>
                <div style={{ fontSize: "0.875rem", color: "var(--text-dim)" }}>
                    Automated Social Media Manager
                </div>
            </header>

            <main>
                <Configuration onGenerate={handleGenerate} />

                <PostGenerator
                    generatedPosts={generatedPosts}
                    loading={loading}
                    configData={configData}
                />
            </main>
        </div>
    );
}
