import OpenAI from "openai";
import 'dotenv/config';

const client1 = new OpenAI({
    baseURL: "https://models.inference.ai.azure.com",
    apiKey: process.env.OPENAI_API_KEY
});

const client2 = new OpenAI({
    baseURL: "https://models.inference.ai.azure.com/v1",
    apiKey: process.env.OPENAI_API_KEY
});

async function run() {
    try {
        console.log("Testing client1 (no /v1)...");
        await client1.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{role: "user", content: "Hello"}]
        });
        console.log("client1 SUCCESS!");
    } catch (e) {
        console.error("client1 FAILED:", e.status, e.message);
    }

    try {
        console.log("Testing client2 (with /v1)...");
        await client2.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{role: "user", content: "Hello"}]
        });
        console.log("client2 SUCCESS!");
    } catch (e) {
        console.error("client2 FAILED:", e.status, e.message);
    }
}
run();
