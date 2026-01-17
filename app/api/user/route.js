import axios from "axios";
import { NextResponse } from "next/server";

export async function POST(req) {
    try {
        const { access_token } = await req.json();

        if (!access_token) {
            return NextResponse.json({ error: "Token required" }, { status: 400 });
        }

        const response = await axios.get("https://api.linkedin.com/v2/me", {
            headers: {
                Authorization: `Bearer ${access_token}`,
            },
        });

        // The ID returned is just the ID part, e.g. "123456"
        // We need to construct the URN.
        const id = response.data.id;
        const urn = `urn:li:person:${id}`;

        return NextResponse.json({ urn, name: `${response.data.localizedFirstName} ${response.data.localizedLastName}` });
    } catch (error) {
        console.error("Fetch User Error:", error.response?.data || error.message);
        return NextResponse.json(
            { error: "Failed to fetch user. Ensure token is valid." },
            { status: 500 }
        );
    }
}
