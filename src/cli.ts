#!/usr/bin/env node

import dotenv from "dotenv";
import { WhooingClient, type WhooingConfig } from "./whooing-client.js";
import { createWhooingMcpServer } from "./server.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";

dotenv.config();

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Error: Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function parseArgs(): { http: boolean; port: number } {
  const args = process.argv.slice(2);
  let http = false;
  let port = 8182;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--http") {
      http = true;
    } else if (args[i] === "--port" && i + 1 < args.length) {
      port = parseInt(args[i + 1], 10);
      if (isNaN(port)) {
        console.error(`Error: Invalid port number: ${args[i + 1]}`);
        process.exit(1);
      }
      i++;
    }
  }

  return { http, port };
}

function getConfig(): WhooingConfig {
  return {
    appId: getRequiredEnv("WHOOING_APP_ID"),
    token: getRequiredEnv("WHOOING_TOKEN"),
    signature: getRequiredEnv("WHOOING_SIGNATURE"),
    defaultSectionId: process.env.WHOOING_SECTION_ID ?? "",
  };
}

async function main() {
  const config = getConfig();
  const { http, port } = parseArgs();

  if (http) {
    await startHttpServer(config, port);
  } else {
    const client = new WhooingClient(config);
    if (config.defaultSectionId) {
      try {
        await client.loadAccounts(config.defaultSectionId);
      } catch (e) {
        console.error("Warning: Failed to pre-load accounts:", e);
      }
    }
    const server = createWhooingMcpServer(client);
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: ReturnType<typeof createWhooingMcpServer>;
}

async function startHttpServer(config: WhooingConfig, port: number) {
  const sessions = new Map<string, SessionEntry>();

  function createSession(): { server: ReturnType<typeof createWhooingMcpServer>; client: WhooingClient } {
    const client = new WhooingClient(config);
    const server = createWhooingMcpServer(client);
    return { server, client };
  }

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);

    // Health check
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (url.pathname === "/mcp") {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      try {
        if (req.method === "POST") {
          const body = await collectBody(req);
          const parsed = JSON.parse(body);

          if (sessionId && sessions.has(sessionId)) {
            const entry = sessions.get(sessionId)!;
            await entry.transport.handleRequest(req, res, parsed);
          } else {
            // New session — create fresh server + transport
            const { server, client } = createSession();

            const transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => crypto.randomUUID(),
            });

            transport.onclose = () => {
              if (transport.sessionId) {
                sessions.delete(transport.sessionId);
              }
            };

            await server.connect(transport);

            // Pre-load accounts in background (don't block the response)
            if (config.defaultSectionId) {
              client.loadAccounts(config.defaultSectionId).catch((e) => {
                console.error("Warning: Failed to pre-load accounts:", e);
              });
            }

            await transport.handleRequest(req, res, parsed);
            if (transport.sessionId) {
              sessions.set(transport.sessionId, { transport, server });
            }
          }
          return;
        }

        if (req.method === "GET") {
          if (sessionId && sessions.has(sessionId)) {
            const entry = sessions.get(sessionId)!;
            await entry.transport.handleRequest(req, res);
          } else {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "No valid session" }));
          }
          return;
        }

        if (req.method === "DELETE") {
          if (sessionId && sessions.has(sessionId)) {
            const entry = sessions.get(sessionId)!;
            await entry.transport.handleRequest(req, res);
            sessions.delete(sessionId);
          } else {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "No valid session" }));
          }
          return;
        }
      } catch (err) {
        console.error("Request error:", err);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
        return;
      }
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  httpServer.listen(port, "0.0.0.0", () => {
    console.error(`whooing-mcp HTTP server listening on http://0.0.0.0:${port}/mcp`);
    console.error(`Health check: http://localhost:${port}/health`);
  });
}

function collectBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
