import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import 'highlight.js/styles/github.css';
import 'katex/dist/katex.min.css';
import { useEffect, useRef } from 'react';
import mermaid from 'mermaid';
import './MarkdownRenderer.css';

interface MarkdownRendererProps {
  content: string;
}

// 初始化 mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
});

// 自定义代码块组件，支持 mermaid 图表
function CodeBlock({ className, children, ...props }: any) {
  const match = /language-mermaid/.exec(className || '');
  const mermaidRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (match && mermaidRef.current) {
      const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
      mermaid.render(id, String(children).replace(/\n$/, '')).then(({ svg }) => {
        if (mermaidRef.current) {
          mermaidRef.current.innerHTML = svg;
        }
      });
    }
  }, [children, match]);

  if (match) {
    return <div ref={mermaidRef} className="mermaid-diagram" />;
  }

  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
}

function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeHighlight, rehypeKatex]}
        components={{
          code: CodeBlock,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default MarkdownRenderer;
