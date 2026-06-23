import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import './App.css';
import Settings from './Settings';
import MarkdownRenderer from './MarkdownRenderer';
import ThinkingBlock from './ThinkingBlock';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  toolStatus?: string;
}

interface Config {
  model: string;
  provider: string;
}

interface Session {
  id: number;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadSessions = async () => {
    try {
      const res = await fetch('/api/sessions');
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const text = await res.text();
      if (!text) {
        setSessions([]);
        return;
      }
      const data = JSON.parse(text);
      setSessions(data);
    } catch (err) {
      console.error('Failed to load sessions:', err);
      setSessions([]);
    }
  };

  useEffect(() => {
    fetch('/api/config')
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        const text = await res.text();
        if (!text) {
          throw new Error('Empty response');
        }
        return JSON.parse(text);
      })
      .then((data) => {
        setConfig(data);
        setError(null);
      })
      .catch((err) => {
        console.error('Failed to load config:', err);
        setError('Failed to load configuration');
      });
    
    loadSessions();
  }, []);

  useEffect(() => {
    // Only scroll when not streaming to avoid jumping
    if (!isLoading) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isLoading]);

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    const userMessage: Message = { role: 'user', content: trimmedInput };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setError(null);
    setIsLoading(true);

    // Add empty assistant message for streaming
    const assistantMessage: Message = { role: 'assistant', content: '', thinking: '' };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionId,
          messages: newMessages,
          title: trimmedInput.slice(0, 30)
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Request failed';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error?.message || errorMessage;
        } catch {
          // ignore parse error
        }
        throw new Error(errorMessage);
      }

      // Handle SSE stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            
            if (parsed.type === 'session') {
              setCurrentSessionId(parsed.sessionId);
            } else if (parsed.type === 'content') {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, content: last.content + parsed.content };
                }
                return updated;
              });
            } else if (parsed.type === 'thinking') {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, thinking: (last.thinking || '') + parsed.content };
                }
                return updated;
              });
            } else if (parsed.type === 'tool_start') {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === 'assistant') {
                  const url = parsed.args?.url || '';
                  updated[updated.length - 1] = { ...last, toolStatus: `Fetching ${url}...` };
                }
                return updated;
              });
            } else if (parsed.type === 'tool_end') {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, toolStatus: `Fetched ${parsed.tool} ✓` };
                }
                return updated;
              });
            } else if (parsed.type === 'tool_continue') {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, toolStatus: undefined };
                }
                return updated;
              });
            } else if (parsed.type === 'error') {
              setError(parsed.error);
            }
          } catch (e) {
            // ignore parse errors
          }
        }
      }

      loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setCurrentSessionId(null);
    setError(null);
  };

  const handleSelectSession = async (sessionId: number) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      const text = await res.text();
      if (!text) {
        throw new Error('Empty response');
      }
      const data = JSON.parse(text);
      setMessages(data.messages || []);
      setCurrentSessionId(sessionId);
    } catch (err) {
      setError('Failed to load session');
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: number) => {
    e.stopPropagation();
    try {
      await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      if (currentSessionId === sessionId) {
        handleNewChat();
      }
      loadSessions();
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <button 
            className="menu-btn"
            onClick={() => setShowSidebar(!showSidebar)}
          >
            ☰
          </button>
          <span>AI Chat</span>
        </div>
        <div className="header-right">
          {config && (
            <span className="model-info">
              {config.provider} · {config.model}
            </span>
          )}
          <button 
            className="settings-btn"
            onClick={() => setShowSettings(true)}
          >
            ⚙️
          </button>
        </div>
      </header>

      <div className="main-container">
        {showSidebar && (
          <aside className="sidebar">
            <button className="new-chat-btn" onClick={handleNewChat}>
              + New Chat
            </button>
            <div className="sessions-list">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`session-item ${currentSessionId === session.id ? 'active' : ''}`}
                  onClick={() => handleSelectSession(session.id)}
                >
                  <span className="session-title">{session.title}</span>
                  <button
                    className="delete-btn"
                    onClick={(e) => handleDeleteSession(e, session.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </aside>
        )}

        <div className="chat-area">
          <div className="chat-container">
            {messages.length === 0 && !isLoading && (
              <div className="empty-state">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
                </svg>
                <span>Start a conversation</span>
              </div>
            )}

            {messages.map((message, index) => (
              <div key={index} className={`message ${message.role}`}>
                <div className="avatar">
                  {message.role === 'assistant' ? '🤖' : '👤'}
                </div>
                <div className="message-content">
                  {message.role === 'assistant' ? (
                    <>
                      {message.thinking && (
                        <ThinkingBlock 
                          content={message.thinking} 
                          isStreaming={isLoading && index === messages.length - 1}
                        />
                      )}
                      {message.toolStatus && (
                        <div className="tool-status">
                          <span className="tool-icon">🌐</span>
                          <span>{message.toolStatus}</span>
                        </div>
                      )}
                      {message.content && (
                        <MarkdownRenderer content={message.content} />
                      )}
                      {!message.content && !message.thinking && !message.toolStatus && isLoading && (
                        <div className="loading-indicator">
                          <div className="spinner"></div>
                          <span>Thinking...</span>
                        </div>
                      )}
                    </>
                  ) : (
                    message.content
                  )}
                </div>
              </div>
            ))}

            {error && <div className="error-message">{error}</div>}

            <div ref={messagesEndRef} />
          </div>

          <div className="input-container">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              rows={1}
            />
            <button onClick={handleSend} disabled={isLoading || !input.trim()}>
              Send
            </button>
          </div>
        </div>
      </div>

      {showSettings && (
        <Settings 
          onClose={() => setShowSettings(false)}
          onConfigUpdate={() => {
            // 重新加载配置
            fetch('/api/config')
              .then(async (res) => {
                const text = await res.text();
                if (!text) {
                  throw new Error('Empty response');
                }
                return JSON.parse(text);
              })
              .then((data) => setConfig(data))
              .catch((err) => console.error('Failed to reload config:', err));
          }}
        />
      )}
    </div>
  );
}

export default App;