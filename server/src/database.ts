import initSqlJs, { Database } from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface Session {
  id: number;
  title: string;
  messages: string;
  createdAt: string;
  updatedAt: string;
}

class DatabaseManager {
  private db: Database | null = null;
  private dbPath: string;
  private SQL: any;

  constructor() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    this.dbPath = join(__dirname, '../data/chat.db');
    
    // Ensure data directory exists
    const dataDir = join(__dirname, '../data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
  }

  async init(): Promise<void> {
    this.SQL = await initSqlJs();
    
    // Load existing database or create new one
    if (existsSync(this.dbPath)) {
      const buffer = readFileSync(this.dbPath);
      this.db = new this.SQL.Database(buffer);
    } else {
      this.db = new this.SQL.Database();
    }
    
    this.initTables();
  }

  private initTables(): void {
    if (!this.db) return;
    
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL DEFAULT '新对话',
        messages TEXT NOT NULL DEFAULT '[]',
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    this.save();
  }

  private save(): void {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    writeFileSync(this.dbPath, buffer);
  }

  createSession(): number {
    if (!this.db) return -1;
    
    this.db.run(
      'INSERT INTO sessions (title, messages) VALUES (?, ?)',
      ['新对话', '[]']
    );
    
    // 获取最后插入的 ID
    const result = this.db.exec('SELECT last_insert_rowid()');
    if (result.length === 0 || result[0].values.length === 0) {
      return -1;
    }
    
    const id = result[0].values[0][0] as number;
    this.save();
    return id;
  }

  getSession(id: number): Session | undefined {
    if (!this.db) return undefined;
    
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    stmt.bind([id]);
    
    if (!stmt.step()) {
      stmt.free();
      return undefined;
    }
    
    const row = stmt.get();
    stmt.free();
    
    return {
      id: row[0] as number,
      title: row[1] as string,
      messages: row[2] as string,
      createdAt: row[3] as string,
      updatedAt: row[4] as string
    };
  }

  getAllSessions(): Session[] {
    if (!this.db) return [];
    
    const result = this.db.exec('SELECT * FROM sessions ORDER BY updatedAt DESC');
    if (result.length === 0) return [];
    
    return result[0].values.map((row: any[]) => ({
      id: row[0] as number,
      title: row[1] as string,
      messages: row[2] as string,
      createdAt: row[3] as string,
      updatedAt: row[4] as string
    }));
  }

  updateSession(id: number, messages: Message[], title?: string): void {
    if (!this.db) return;

    const session = this.getSession(id);
    if (!session) return;

    const newTitle = title || session.title;
    
    this.db.run(
      `UPDATE sessions SET messages = ?, title = ?, updatedAt = datetime('now') WHERE id = ?`,
      [JSON.stringify(messages), newTitle, id]
    );
    this.save();
  }

  deleteSession(id: number): void {
    if (!this.db) return;
    this.db.run('DELETE FROM sessions WHERE id = ?', [id]);
    this.save();
  }

  close(): void {
    if (this.db) {
      this.save();
      this.db.close();
    }
  }
}

export const db = new DatabaseManager();
export { Message, Session };