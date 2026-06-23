import { useState, useEffect } from 'react';
import './Settings.css';

interface Config {
  model: string;
  provider: string;
  apiBaseUrl: string;
  temperature: number;
  maxInputTokens: number;
  maxOutputTokens: number;
}

interface SettingsProps {
  onClose: () => void;
  onConfigUpdate?: () => void;
}

function Settings({ onClose, onConfigUpdate }: SettingsProps) {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const res = await fetch('/api/config');
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const text = await res.text();
      if (!text) {
        throw new Error('Empty response');
      }
      const data = JSON.parse(text);
      setConfig(data);
    } catch (error) {
      console.error('Failed to load config:', error);
      setMessage({ type: 'error', text: '加载配置失败' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;
    
    setSaving(true);
    setMessage(null);
    
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      
      const text = await res.text();
      const data = text ? JSON.parse(text) : { success: true };
      
      if (data.success) {
        setMessage({ type: 'success', text: '配置已保存' });
        if (onConfigUpdate) {
          onConfigUpdate();
        }
      } else {
        setMessage({ type: 'error', text: data.error || '保存失败' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '保存失败' });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof Config, value: string | number) => {
    if (!config) return;
    setConfig({ ...config, [field]: value });
  };

  if (loading) {
    return (
      <div className="settings-overlay">
        <div className="settings-modal">
          <div className="settings-loading">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-overlay">
      <div className="settings-modal">
        <div className="settings-header">
          <h2>设置</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="settings-content">
          {message && (
            <div className={`message ${message.type}`}>
              {message.text}
            </div>
          )}

          <div className="form-group">
            <label>Provider</label>
            <input
              type="text"
              value={config?.provider || ''}
              onChange={(e) => handleChange('provider', e.target.value)}
              placeholder="例如: openai"
            />
          </div>

          <div className="form-group">
            <label>API Base URL</label>
            <input
              type="text"
              value={config?.apiBaseUrl || ''}
              onChange={(e) => handleChange('apiBaseUrl', e.target.value)}
              placeholder="例如: https://api.openai.com/v1"
            />
          </div>

          <div className="form-group">
            <label>Model</label>
            <input
              type="text"
              value={config?.model || ''}
              onChange={(e) => handleChange('model', e.target.value)}
              placeholder="例如: gpt-3.5-turbo"
            />
          </div>

          <div className="form-group">
            <label>Temperature</label>
            <input
              type="number"
              value={config?.temperature || 0}
              onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
              step="0.1"
              min="0"
              max="2"
            />
            <span className="hint">控制输出的随机性 (0-2)</span>
          </div>

          <div className="form-group">
            <label>Max Input Tokens</label>
            <input
              type="number"
              value={config?.maxInputTokens || 0}
              onChange={(e) => handleChange('maxInputTokens', parseInt(e.target.value))}
              min="1"
            />
            <span className="hint">模型可接收的最大输入 token 数</span>
          </div>

          <div className="form-group">
            <label>Max Output Tokens</label>
            <input
              type="number"
              value={config?.maxOutputTokens || 0}
              onChange={(e) => handleChange('maxOutputTokens', parseInt(e.target.value))}
              min="1"
            />
            <span className="hint">模型可生成的最大输出 token 数</span>
          </div>
        </div>

        <div className="settings-footer">
          <button className="btn-secondary" onClick={onClose}>
            取消
          </button>
          <button 
            className="btn-primary" 
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Settings;
