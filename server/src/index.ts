import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { db, Message } from './database.js';
import { fetchWebPage } from './webFetcher.js';

interface LLMConfig {
  provider: string;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxInputTokens: number;
  maxOutputTokens: number;
}

interface ServerConfig {
  llm: LLMConfig;
  server: {
    port: number;
  };
  proxy?: {
    enabled: boolean;
    httpProxy: string;
    httpsProxy: string;
  };
  webFetch?: {
    maxRetries: number;
    timeout: number;
  };
}

function loadConfig(): ServerConfig {
  const configPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'config.json');
  const configData = readFileSync(configPath, 'utf-8');
  return JSON.parse(configData);
}

let config = loadConfig();
const app = express();
app.use(cors());
app.use(express.json());

const configPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'config.json');

interface ChatRequest {
  sessionId?: number;
  messages: Message[];
  title?: string;
}

// 系统提示词，包含工具说明
const SYSTEM_PROMPT = `You are a helpful AI assistant. You have access to a web fetching tool.

When you need to get real-time information from the web, you can request to fetch a webpage by outputting EXACTLY this format (on its own line):

\`\`\`tool:web_fetch
{"url": "https://example.com"}
\`\`\`

The system will execute the tool and provide the result. You can then answer based on the fetched content.

Guidelines:
- Only use the web fetch tool when you need real-time or current information
- Make sure URLs are complete and valid (include https://)
- You can fetch multiple pages if needed
- If you don't need web information, just answer directly
`;

// 从 LLM 输出中检测工具调用
function detectToolCall(content: string): { tool: string; args: any } | null {
  // 格式1: [TOOL_CALL] {tool => "web_fetch", args => { --url "https://..." }} [/TOOL_CALL]
  const toolCallMatch = content.match(/\[TOOL_CALL\]\s*\{tool\s*=>\s*"(\w+)",\s*args\s*=>\s*\{([^}]*)\}\s*\}\s*\[\/TOOL_CALL\]/);
  if (toolCallMatch) {
    const tool = toolCallMatch[1];
    const argsStr = toolCallMatch[2].trim();
    
    // 解析 args，支持 --url "..." 格式
    const args: any = {};
    const argMatches = argsStr.matchAll(/--(\w+)\s+"([^"]+)"/g);
    for (const m of argMatches) {
      args[m[1]] = m[2];
    }
    
    if (Object.keys(args).length > 0) {
      return { tool, args };
    }
  }
  
  // 格式2: ```tool:web_fetch\n{"url": "..."}\n```
  const match = content.match(/```tool:(\w+)\n([\s\S]*?)```/);
  if (match) {
    try {
      const args = JSON.parse(match[2].trim());
      return { tool: match[1], args };
    } catch {
      return null;
    }
  }
  
  return null;
}

// 执行工具调用
async function executeTool(tool: string, args: any): Promise<string> {
  if (tool === 'web_fetch') {
    const result = await fetchWebPage(args.url);
    if (result.success) {
      return `[Web Fetch Result]\nURL: ${result.url}\nTitle: ${result.title}\n\nContent:\n${result.content}`;
    } else {
      return `[Web Fetch Failed]\nURL: ${result.url}\nError: ${result.error}`;
    }
  }
  return `[Unknown tool: ${tool}]`;
}

app.post('/api/chat', async (req, res) => {
  try {
    const { sessionId, messages, title }: ChatRequest = req.body;

    let currentSessionId = sessionId;

    if (!currentSessionId) {
      currentSessionId = db.createSession();
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    res.write(`data: ${JSON.stringify({ type: 'session', sessionId: currentSessionId })}\n\n`);

    // Build conversation messages with system prompt
    let conversationMessages: any[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ];

    let fullContent = '';
    let fullReasoningContent = '';
    let allAssistantMessages: any[] = [];
    const MAX_TOOL_ROUNDS = 5; // 防止无限循环

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const llmResponse = await axios.post(
        `${config.llm.apiBaseUrl}/chat/completions`,
        {
          model: config.llm.model,
          messages: conversationMessages,
          temperature: config.llm.temperature,
          max_tokens: config.llm.maxOutputTokens,
          stream: true,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.llm.apiKey}`,
          },
          responseType: 'stream',
        }
      );

      let roundContent = '';
      let roundReasoning = '';

      // Process the stream
      await new Promise<void>((resolve, reject) => {
        let buffer = '';

        llmResponse.data.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;

            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;

              if (delta?.content) {
                roundContent += delta.content;
                res.write(`data: ${JSON.stringify({ type: 'content', content: delta.content })}\n\n`);
              }

              if (delta?.reasoning_content) {
                roundReasoning += delta.reasoning_content;
                res.write(`data: ${JSON.stringify({ type: 'thinking', content: delta.reasoning_content })}\n\n`);
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        });

        llmResponse.data.on('end', () => resolve());
        llmResponse.data.on('error', (err: Error) => reject(err));
      });

      fullContent += roundContent;
      fullReasoningContent += roundReasoning;
      allAssistantMessages.push({ role: 'assistant', content: roundContent });

      // Check for tool calls
      const toolCall = detectToolCall(roundContent);
      if (!toolCall) {
        break; // No tool call, we're done
      }

      // Execute tool
      res.write(`data: ${JSON.stringify({ type: 'tool_start', tool: toolCall.tool, args: toolCall.args })}\n\n`);
      
      const toolResult = await executeTool(toolCall.tool, toolCall.args);
      
      res.write(`data: ${JSON.stringify({ type: 'tool_end', tool: toolCall.tool, result: toolResult.slice(0, 200) + '...' })}\n\n`);

      // Add assistant message and tool result to conversation for next round
      conversationMessages.push({ role: 'assistant', content: roundContent });
      conversationMessages.push({ role: 'user', content: `[Tool Result for ${toolCall.tool}]:\n${toolResult}\n\nPlease continue answering based on the above information.` });
      
      // Reset content for next round (will be appended)
      res.write(`data: ${JSON.stringify({ type: 'tool_continue' })}\n\n`);
    }

    // Save complete conversation
    const assistantMessage = {
      role: 'assistant' as const,
      content: fullContent,
      reasoning_content: fullReasoningContent || undefined,
    };
    const allMessages = [...messages, assistantMessage];
    db.updateSession(currentSessionId, allMessages, title);

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (error: any) {
    console.error('LLM API Error:', error.response?.data || error.message);
    if (!res.headersSent) {
      res.status(error.response?.status || 500).json({
        error: error.response?.data || { message: error.message }
      });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      res.end();
    }
  }
});

app.get('/api/config', (req, res) => {
  res.json({
    model: config.llm.model,
    provider: config.llm.provider,
    apiBaseUrl: config.llm.apiBaseUrl,
    temperature: config.llm.temperature,
    maxInputTokens: config.llm.maxInputTokens,
    maxOutputTokens: config.llm.maxOutputTokens,
    proxy: config.proxy || { enabled: false, httpProxy: '', httpsProxy: '' },
    webFetch: config.webFetch || { maxRetries: 3, timeout: 15000 },
  });
});

app.put('/api/config', (req, res) => {
  try {
    const newConfig = req.body;
    
    // 更新内存中的配置
    if (newConfig.model !== undefined) config.llm.model = newConfig.model;
    if (newConfig.provider !== undefined) config.llm.provider = newConfig.provider;
    if (newConfig.apiBaseUrl !== undefined) config.llm.apiBaseUrl = newConfig.apiBaseUrl;
    if (newConfig.temperature !== undefined) config.llm.temperature = newConfig.temperature;
    if (newConfig.maxInputTokens !== undefined) config.llm.maxInputTokens = newConfig.maxInputTokens;
    if (newConfig.maxOutputTokens !== undefined) config.llm.maxOutputTokens = newConfig.maxOutputTokens;
    
    // 更新代理配置
    if (newConfig.proxy !== undefined) {
      config.proxy = newConfig.proxy;
    }
    
    // 更新网页抓取配置
    if (newConfig.webFetch !== undefined) {
      config.webFetch = newConfig.webFetch;
    }
    
    // 保存到文件
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    res.json({ success: true, message: '配置已更新' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Session management endpoints
app.post('/api/sessions', (req, res) => {
  try {
    const id = db.createSession();
    res.json({ id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sessions', (req, res) => {
  try {
    const sessions = db.getAllSessions();
    res.json(sessions.map(s => ({
      id: s.id,
      title: s.title,
      messageCount: JSON.parse(s.messages).length,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt
    })));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sessions/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const session = db.getSession(id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({
      id: session.id,
      title: session.title,
      messages: JSON.parse(session.messages),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/sessions/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    db.deleteSession(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Initialize database and start server
const PORT = config.server.port;

async function start() {
  try {
    await db.init();
    console.log('Database initialized');
    
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Using model: ${config.llm.model}`);
      console.log(`Provider: ${config.llm.provider}`);
      console.log(`Database: SQLite (sql.js)`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();