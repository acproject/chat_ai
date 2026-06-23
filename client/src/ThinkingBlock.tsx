import { useState } from 'react';
import './ThinkingBlock.css';

interface ThinkingBlockProps {
  content: string;
  isStreaming?: boolean;
}

function ThinkingBlock({ content, isStreaming }: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!content) return null;

  return (
    <div className="thinking-block">
      <div 
        className="thinking-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="thinking-icon">💭</span>
        <span className="thinking-title">Thinking</span>
        {isStreaming && <span className="thinking-indicator">...</span>}
        <span className={`thinking-toggle ${isExpanded ? 'expanded' : ''}`}>
          ▼
        </span>
      </div>
      {isExpanded && (
        <div className="thinking-content">
          {content}
        </div>
      )}
    </div>
  );
}

export default ThinkingBlock;
