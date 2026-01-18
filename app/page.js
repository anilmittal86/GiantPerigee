"use client";

import Link from "next/link";
import Image from "next/image";
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
                post_type: config.postType,
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
        <div className="app-wrapper">
            <nav className="navbar">
                <div className="navbar-inner">
                    <div className="navbar-left" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <Link href="/" style={{ textDecoration: "none", display: "inline-block" }}>
                            <Image
                                src="/logo.png"
                                alt="Perigee Logo"
                                width={180}
                                height={60}
                                style={{ objectFit: "contain", display: "block" }}
                                priority
                            />
                        </Link>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", fontWeight: 500, marginTop: "4px" }}>
                            Social Media Manager
                        </div>
                    </div>

                    <Link href="/guide" className="btn-secondary" style={{ marginTop: "0.5rem" }}>
                        📚 User Guide
                    </Link>
                </div>
            </nav>

            <main className="main-content">
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
