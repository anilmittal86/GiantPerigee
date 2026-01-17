"use client";

import { useState } from "react";
import axios from "axios";

export default function PostGenerator({ generatedPosts, loading, configData }) {
    const [postingIndex, setPostingIndex] = useState(null);
    const [postResult, setPostResult] = useState(null);

    const handlePost = async (content, index) => {
        if (!configData.linkedinToken || !configData.linkedinUrn) {
            alert("Please configure LinkedIn credentials first.");
            return;
        }

        setPostingIndex(index);
        setPostResult(null);

        try {
            const res = await axios.post("/api/post", {
                post_content: content,
                access_token: configData.linkedinToken,
                urn: configData.linkedinUrn
            });

            if (res.data.success) {
                setPostResult({ type: "success", msg: "Posted successfully!", link: res.data.link });
            }
        } catch (err) {
            setPostResult({ type: "error", msg: err.response?.data?.error || "Failed to post." });
        } finally {
            setPostingIndex(null);
        }
    };

    if (loading) {
        return (
            <div style={{ textAlign: "center", padding: "4rem" }}>
                <h2 style={{ color: "var(--primary)" }}>Generating awesome content...</h2>
                <p style={{ color: "var(--text-dim)" }}>Consulting the creative spirits</p>
            </div>
        );
    }

    if (!generatedPosts || generatedPosts.length === 0) {
        return (
            <div style={{ textAlign: "center", padding: "4rem", color: "var(--text-dim)" }}>
                <p>No posts generated yet. Configure and click "Generate".</p>
            </div>
        );
    }

    return (
        <div>
            <h2 style={{ marginBottom: "1.5rem" }}>Select a Post</h2>

            {postResult && (
                <div style={{
                    padding: "1rem",
                    marginBottom: "1rem",
                    borderRadius: "8px",
                    background: postResult.type === "success" ? "rgba(3, 218, 198, 0.1)" : "rgba(255, 0, 0, 0.1)",
                    color: postResult.type === "success" ? "var(--success)" : "#ff6b6b",
                    border: `1px solid ${postResult.type === "success" ? "var(--success)" : "#ff6b6b"}`
                }}>
                    {postResult.msg}
                    {postResult.link && <a href={postResult.link} target="_blank" style={{ marginLeft: "1rem", color: "inherit" }}>View Post</a>}
                </div>
            )}

            <div className="grid">
                {generatedPosts.map((post, idx) => (
                    <div key={idx} className="card">
                        <div className="badge badge-blue">Option {idx + 1}</div>
                        <div style={{ whiteSpace: "pre-wrap", flex: 1, marginBottom: "1.5rem", lineHeight: "1.5" }}>
                            {post}
                        </div>
                        <button
                            className="btn btn-secondary"
                            onClick={() => handlePost(post, idx)}
                            disabled={postingIndex !== null}
                        >
                            {postingIndex === idx ? "Posting..." : "Post to LinkedIn"}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
