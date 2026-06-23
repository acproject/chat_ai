import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

interface WebFetchResult {
  success: boolean;
  url: string;
  title?: string;
  content?: string;
  error?: string;
}

interface FetchOptions {
  proxy?: {
    enabled: boolean;
    httpProxy?: string;
    httpsProxy?: string;
  };
  maxRetries?: number;
  timeout?: number;
}

/**
 * 抓取网页内容并提取主要文本
 */
export async function fetchWebPage(url: string, options: FetchOptions = {}): Promise<WebFetchResult> {
  const { proxy, maxRetries = 3, timeout = 15000 } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const useProxy = proxy?.enabled && attempt > 1;
      const proxyUrl = useProxy ? (proxy?.httpsProxy || proxy?.httpProxy) : undefined;
      
      const config: any = {
        timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        maxRedirects: 5,
      };

      if (useProxy && proxyUrl) {
        config.httpsAgent = new HttpsProxyAgent(proxyUrl);
      }

      const response = await axios.get(url, config);

      const html = response.data;
      
      // 提取标题
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : '';
      
      // 提取主要内容
      const content = extractMainContent(html);
      
      return {
        success: true,
        url,
        title,
        content: content.slice(0, 8000), // 限制内容长度
      };
    } catch (error: any) {
      if (attempt === maxRetries) {
        return {
          success: false,
          url,
          error: error.message || 'Failed to fetch webpage',
        };
      }
      // 继续重试
    }
  }

  return {
    success: false,
    url,
    error: 'Max retries exceeded',
  };
}

/**
 * 从 HTML 中提取主要内容
 */
function extractMainContent(html: string): string {
  // 移除 script, style, nav, header, footer 等标签
  let cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');
  
  // 尝试提取 article 或 main 标签内容
  const articleMatch = cleaned.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = cleaned.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  
  if (articleMatch) {
    cleaned = articleMatch[1];
  } else if (mainMatch) {
    cleaned = mainMatch[1];
  }
  
  // 提取段落和标题文本
  const textParts: string[] = [];
  const textRegex = /<(?:p|h[1-6]|li|blockquote|div)[^>]*>([\s\S]*?)<\/(?:p|h[1-6]|li|blockquote|div)>/gi;
  let match;
  
  while ((match = textRegex.exec(cleaned)) !== null) {
    let text = match[1]
      .replace(/<[^>]+>/g, '') // 移除内部标签
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    
    if (text.length > 10) {
      textParts.push(text);
    }
  }
  
  // 如果没提取到，尝试提取 body 内容
  if (textParts.length === 0) {
    const bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      const bodyText = bodyMatch[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (bodyText.length > 50) {
        return bodyText.slice(0, 5000);
      }
    }
  }
  
  return textParts.join('\n\n').slice(0, 5000);
}

/**
 * 工具定义，用于系统提示
 */
export const WEB_FETCH_TOOL_DESCRIPTION = `
You have access to a web fetching tool. When you need to get information from a webpage, you can use the following format to request a fetch:

\`\`\`tool:web_fetch
{"url": "https://example.com"}
\`\`\`

The system will fetch the webpage content and provide it to you. Then you can answer the user's question based on the fetched content.

Important:
- Only use this tool when you need real-time information from the web
- Make sure the URL is complete and valid
- You can fetch multiple pages if needed
`;
