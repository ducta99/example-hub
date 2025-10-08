import readline from "readline/promises";
import OpenAI from "openai";
import {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import "dotenv/config";

// Import services and utilities
import {
  performAnalysis,
  getAnalysisToolDefinition,
  getCurrentPrice,
  getCurrentPriceToolDefinition,
  executeTrade,
  getTradingToolDefinition,
} from "./services";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set");
}
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
// const model = "gpt-4o-mini";
const MODEL = "hf.co/Mungert/Fin-R1-GGUF:latest";

export class MCPClient {
  private mcp: Client;
  private openai: OpenAI;
  private transport: StdioClientTransport | null = null;
  private tools: ChatCompletionTool[] = [];
  private conversationHistory: ChatCompletionMessageParam[] = [];

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });

    // Initialize conversation with system message
    this.conversationHistory = [
      {
        role: "system",
        content:
          "You are a helpful AI assistant specialized in trading analysis and blockchain operations. You have access to tools for performing technical analysis on cryptocurrencies and blockchain operations. You can also execute trades with USDT balance checks. When users want to trade, use the executeTrade tool which will automatically check their USDT balance first.",
      },
    ];
  }

  private fixJsonSchema(schema: any): any {
    if (typeof schema !== "object" || schema === null) {
      return schema;
    }

    // Handle arrays - ensure they have 'items' field
    if (schema.type === "array" && !schema.items) {
      schema.items = { type: "string" }; // Default to string array
    }

    // Recursively fix nested objects and arrays
    if (schema.properties) {
      for (const key in schema.properties) {
        schema.properties[key] = this.fixJsonSchema(schema.properties[key]);
      }
    }

    if (schema.items) {
      schema.items = this.fixJsonSchema(schema.items);
    }

    // Ensure required fields for object types
    if (schema.type === "object" && !schema.properties) {
      schema.properties = {};
    }

    return schema;
  }

  async connectToServer() {
    try {
      this.transport = new StdioClientTransport({
        command: process.execPath,
        args: ["node_modules/@bnb-chain/mcp/dist/index.js"],
        env: {
          PRIVATE_KEY,
        },
      });
      this.mcp.connect(this.transport);

      const toolsResult = await this.mcp.listTools();
      const serverTools = toolsResult.tools.map((tool) => {
        let parameters = tool.inputSchema;
        if (typeof parameters === "string") {
          try {
            parameters = JSON.parse(parameters);
          } catch (e) {
            parameters = { type: "object", properties: {} };
          }
        }

        parameters = this.fixJsonSchema(parameters);

        if (!parameters.type) {
          parameters.type = "object";
        }
        if (!parameters.properties) {
          parameters.properties = {};
        }

        return {
          type: "function" as const,
          function: {
            name: tool.name,
            description: tool.description || `Tool: ${tool.name}`,
            parameters,
          },
        };
      });

      // Add local tools
      const localTools: ChatCompletionTool[] = [
        getAnalysisToolDefinition(),
        getCurrentPriceToolDefinition(),
        getTradingToolDefinition(),
      ];

      // Combine server and local tools
      this.tools = [...serverTools, ...localTools];

      // console.log(
      //   "Connected to server with tools:",
      //   this.tools.map((tool) => tool.function.name)
      // );
    } catch (e) {
      console.log("Failed to connect to MCP server: ", e);
      throw e;
    }
  }

  private extractTokenFromQuery(query: string): string {
    const match = query.match(/\b[A-Z]{2,5}\b/);
    if (!match) throw new Error("Token not found in query.");
    return match[0];
  }

  private extractDecision(text: string): "BUY" | "SELL" | "HOLD" {
    const match = text.match(/Decision:\s*(BUY|SELL|HOLD)/i);
    return match ? match[1].toUpperCase() as "BUY" | "SELL" | "HOLD" : "HOLD";
  }

  // Dummy sentiment aggregator (replace with real data source)
  private async getSentimentSummary(token: string): Promise<string> {
    // Later you could connect to Twitter API, CryptoPanic, or LunarCrush API
    return `Sentiment data for ${token}: neutral (no major news impact).`;
  }

  // Decide how much to trade based on volatility or signal strength
  private determineTradeAmount(analysis: any): number {
    if (analysis.rsi < 30) return 100; // oversold → larger BUY
    if (analysis.rsi > 70) return 50;  // overbought → smaller SELL
    return 25; // default small trade
  }

  async processQuery(query: string): Promise<string> {
    const chalk = (await import("chalk")).default;
    const finalText: string[] = [];

    try {
      // 1️⃣ Extract token
      const token = this.extractTokenFromQuery(query);
      finalText.push(`Detected token: ${token}`);

      // 2️⃣ Get current price
      console.log(chalk.yellow("📡 Fetching current price..."));
      const price = await getCurrentPrice(token);
      finalText.push(`Current price of ${token}: ${price}`);

      // 3️⃣ Perform technical analysis
      console.log(chalk.yellow("📊 Performing technical analysis..."));
      const techAnalysis = await performAnalysis(token);
      finalText.push(`Technical indicators:\n${JSON.stringify(techAnalysis, null, 2)}`);

      // 4️⃣ Get sentiment summary
      console.log(chalk.blue("🧠 Evaluating technical + sentiment data via Ollama model..."));
      const sentiment = await this.getSentimentSummary(token);

      // Prompts
      const systemPrompt = `You are a professional crypto trading assistant.
You will combine technical indicators and market sentiment to decide whether to BUY, SELL, or HOLD.
Explain your reasoning briefly and output the final decision in the format:
Decision: [BUY/SELL/HOLD].`;

      const userPrompt = `
Token: ${token}
Current Price: ${price}
Technical Signals: ${JSON.stringify(techAnalysis, null, 2)}
Market Sentiment (from news/social): ${sentiment}

Decide what action to take.
      `;

      // 5️⃣ Use Ollama API
      const response = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          stream: false,
          options: {
            num_predict: 800, // same as OpenAI's max_tokens
            temperature: 0.5,
          },
        }),
      });

      if (!response.ok) throw new Error(`Ollama request failed (${response.status})`);
      const data = await response.json();

      const llmContent =
        data.message?.content ||
        data.messages?.map((m: { content: string }) => m.content).join("\n") ||
        "";

      finalText.push(`LLM Evaluation:\n${llmContent}`);

      // 6️⃣ Extract decision
      const decision = this.extractDecision(llmContent);
      finalText.push(`Final Decision: ${decision}`);

      // 7️⃣ Execute trade
      console.log(chalk.green(`🚀 Executing ${decision} trade for ${token}...`));
      const amount = this.determineTradeAmount(techAnalysis);
      const result = await executeTrade(this.mcp, token, decision);
      finalText.push(`Trade executed successfully: ${result}`);
    } catch (error: any) {
      console.error(chalk.red("❌ Error during processQuery:"), error);
      finalText.push(`Error: ${error.message}`);
    }

    return finalText.join("\n");
  }


  async chatLoop() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      const chalk = (await import("chalk")).default;
      console.log(chalk.cyan("\nMCP Client Started!"));
      console.log(
        chalk.cyan(
          "Type your queries and I'll help you with trading analysis and blockchain operations!"
        )
      );

      while (true) {
        // Create a 1-hour timer (you can reduce this to eg. 10 seconds for testing)
        const oneHour = new Promise<string>(resolve =>
          setTimeout(() => resolve("AUTO_TRIGGER"), 3600_000)
        );

        // Wait for user input
        const userInput = rl.question(chalk.green("\nUser: "));

        // Whichever happens first (input or timer)
        const result = await Promise.race([userInput, oneHour]);
        const lower = result.toLowerCase?.() ?? "";

        // Handle quit command
        if (lower === "quit" || lower === "exit") {
          console.log(chalk.red("Exiting..."));
          break;
        }

        // Determine trigger source
        const triggerType = result === "AUTO_TRIGGER" ? "auto" : "manual";
        console.log(chalk.blue(`\nAssistant (${triggerType}):`));

        // Run trade logic
        const response = await this.processQuery(triggerType === "auto" ? "BNB" : result);
        console.log(chalk.yellow(response));
      }
    } finally {
      rl.close();
    }
  }

  async cleanup() {
    await this.mcp.close();
  }
}
