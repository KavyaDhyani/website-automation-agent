import { Agent, OpenAIChatCompletionsModel, run } from '@openai/agents';
import { OpenAI } from 'openai';
import 'dotenv/config';

const client1 = new OpenAI({
    baseURL: process.env.OPENAI_BASE_URL || "https://models.inference.ai.azure.com",
    apiKey: process.env.OPENAI_API_KEY
});

const agent = new Agent({
    name: 'Test',
    instructions: 'Say hello.',
    model: new OpenAIChatCompletionsModel(client1, 'gpt-4o-mini'),
    tools: []
});

async function runTest() {
    try {
        console.log("Running agent with OpenAIChatCompletionsModel...");
        const result = await run(agent, "Hello");
        console.log("SUCCESS:", result.finalOutput);
    } catch (e) {
        console.error("FAILED:", e.status, e.message);
    }
}
runTest();
