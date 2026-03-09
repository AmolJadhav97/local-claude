require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || '/data';
const DB_PATH = path.join(DATA_DIR, 'conversations.db');

// Ollama config — host.docker.internal reaches your Mac from inside Docker
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://host.docker.internal:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';

console.log(`🤖 Model: ${OLLAMA_MODEL} via ${OLLAMA_HOST}`);

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY, section_id TEXT NOT NULL, title TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL,
    role TEXT NOT NULL, content TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS sections (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT, color TEXT,
    system_prompt TEXT NOT NULL, description TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    is_default INTEGER DEFAULT 0, sort_order INTEGER DEFAULT 0
  );
`);

const sectionCount = db.prepare('SELECT COUNT(*) as count FROM sections').get();
if (sectionCount.count === 0) {
  const defaultSections = [
    { id: 'nutritionist', name: 'Nutritionist', icon: '🥗', color: '#22c55e', description: 'Diet plans, meal prep, macros & nutrition science', sort_order: 1, is_default: 1, system_prompt: `You are Dr. Nora, an expert registered dietitian and nutritionist with 15+ years of clinical experience. Provide specific, actionable meal plans and recipes. Use precise macros and calories. Remember everything the user shares throughout the conversation.` },
    { id: 'therapist', name: 'Life Advisor', icon: '🧠', color: '#8b5cf6', description: 'Emotional support, problem solving & personal growth', sort_order: 2, is_default: 0, system_prompt: `You are Alex, a compassionate life advisor with background in CBT, positive psychology, and mindfulness. Listen deeply, ask powerful questions, help users navigate challenges. Remember all personal context shared throughout this conversation.` },
    { id: 'medical', name: 'Medical Info', icon: '🏥', color: '#ef4444', description: 'Symptoms, conditions, medications & health guidance', sort_order: 3, is_default: 0, system_prompt: `You are Dr. Medi, a medical information specialist. Provide clear, accurate health information. Always clarify you provide information not diagnosis. For emergencies direct to emergency services immediately. Remember all health history shared in this conversation.` },
    { id: 'jobhunter', name: 'Job Hunter', icon: '💼', color: '#f59e0b', description: 'Resume, interviews, career strategy & job search', sort_order: 4, is_default: 0, system_prompt: `You are Jordan, a top-tier career strategist and recruiter. Specialise in resume optimisation, interview coaching, salary negotiation. Give specific feedback with actual rewritten examples. Remember all career context throughout this conversation.` },
    { id: 'finance', name: 'Finance Advisor', icon: '💰', color: '#06b6d4', description: 'Budgeting, investing, savings & financial planning', sort_order: 5, is_default: 0, system_prompt: `You are Morgan, a certified financial planner. Provide specific, actionable financial guidance. Explain concepts simply. Always note when a licensed advisor is needed. Remember all financial context shared throughout this conversation.` },
    { id: 'tech', name: 'Tech Expert', icon: '⚙️', color: '#0ea5e9', description: 'DevOps, cloud, Linux, networking, code & all things IT', sort_order: 6, is_default: 0, system_prompt: `You are Turing, a senior IT architect and DevOps engineer with 15+ years experience. Expert in Docker, Kubernetes, AWS/GCP/Azure, Linux, Terraform, Python, Bash, Nginx, Prometheus. Always give real commands and config snippets. Explain the WHY behind solutions. Remember all technical context — stack, OS, cloud provider — throughout this conversation.` }
  ];
  const ins = db.prepare(`INSERT INTO sections (id,name,icon,color,system_prompt,description,is_default,sort_order) VALUES (@id,@name,@icon,@color,@system_prompt,@description,@is_default,@sort_order)`);
  for (const s of defaultSections) ins.run(s);
  console.log('✅ Default sections seeded');
}

app.use(compression());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../frontend/public')));

// Health check — verifies Ollama is reachable
app.get('/api/health', async (req, res) => {
  let ollamaOk = false;
  try {
    const r = await fetch(`${OLLAMA_HOST}/api/tags`);
    ollamaOk = r.ok;
  } catch (e) { ollamaOk = false; }
  res.json({ status: 'ok', ollamaConnected: ollamaOk, model: OLLAMA_MODEL, version: '2.0.0' });
});

app.get('/api/sections', (req, res) => {
  res.json(db.prepare('SELECT * FROM sections ORDER BY sort_order').all());
});

app.post('/api/sections', (req, res) => {
  const { id, name, icon, color, system_prompt, description } = req.body;
  const sectionId = id || uuidv4();
  const existing = db.prepare('SELECT id FROM sections WHERE id = ?').get(sectionId);
  if (existing) {
    db.prepare(`UPDATE sections SET name=@name,icon=@icon,color=@color,system_prompt=@system_prompt,description=@description WHERE id=@id`).run({ id: sectionId, name, icon, color, system_prompt, description });
  } else {
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM sections').get();
    db.prepare(`INSERT INTO sections (id,name,icon,color,system_prompt,description,sort_order) VALUES (@id,@name,@icon,@color,@system_prompt,@description,@sort_order)`).run({ id: sectionId, name, icon, color, system_prompt, description, sort_order: (maxOrder.m || 0) + 1 });
  }
  res.json({ id: sectionId, success: true });
});

app.delete('/api/sections/:id', (req, res) => {
  const section = db.prepare('SELECT is_default FROM sections WHERE id = ?').get(req.params.id);
  if (!section) return res.status(404).json({ error: 'Not found' });
  if (section.is_default) return res.status(400).json({ error: 'Cannot delete default sections' });
  db.prepare('DELETE FROM sections WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/conversations/:sectionId', (req, res) => {
  res.json(db.prepare(`SELECT c.*, (SELECT content FROM messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) as last_message FROM conversations c WHERE c.section_id=? ORDER BY c.updated_at DESC`).all(req.params.sectionId));
});

app.post('/api/conversations', (req, res) => {
  const { section_id, title } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO conversations (id,section_id,title) VALUES (?,?,?)').run(id, section_id, title || 'New conversation');
  res.json({ id, section_id, title: title || 'New conversation' });
});

app.patch('/api/conversations/:id', (req, res) => {
  db.prepare("UPDATE conversations SET title=?,updated_at=strftime('%s','now') WHERE id=?").run(req.body.title, req.params.id);
  res.json({ success: true });
});

app.delete('/api/conversations/:id', (req, res) => {
  db.prepare('DELETE FROM conversations WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/messages/:conversationId', (req, res) => {
  res.json(db.prepare('SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at ASC').all(req.params.conversationId));
});

// Chat endpoint — Ollama streaming
app.post('/api/chat', async (req, res) => {
  const { conversation_id, section_id, message } = req.body;
  const section = db.prepare('SELECT * FROM sections WHERE id=?').get(section_id);
  if (!section) return res.status(404).json({ error: 'Section not found' });

  db.prepare('INSERT INTO messages (id,conversation_id,role,content) VALUES (?,?,?,?)').run(uuidv4(), conversation_id, 'user', message);

  const msgCount = db.prepare('SELECT COUNT(*) as c FROM messages WHERE conversation_id=?').get(conversation_id);
  if (msgCount.c === 1) {
    db.prepare('UPDATE conversations SET title=? WHERE id=?').run(message.length > 60 ? message.substring(0, 57) + '...' : message, conversation_id);
  }

  const history = db.prepare('SELECT role,content FROM messages WHERE conversation_id=? ORDER BY created_at ASC').all(conversation_id);
  const messages = [
    { role: 'system', content: section.system_prompt },
    ...history.map(m => ({ role: m.role, content: m.content }))
  ];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, messages, stream: true, options: { temperature: 0.7, num_ctx: 4096 } })
    });

    if (!response.ok) {
      const err = await response.text();
      res.write(`data: ${JSON.stringify({ error: `Ollama error: ${err}` })}\n\n`);
      return res.end();
    }

    let fullResponse = '';
    let buffer = '';

    response.body.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.message?.content) {
            fullResponse += parsed.message.content;
            res.write(`data: ${JSON.stringify({ text: parsed.message.content })}\n\n`);
          }
          if (parsed.done) {
            db.prepare('INSERT INTO messages (id,conversation_id,role,content) VALUES (?,?,?,?)').run(uuidv4(), conversation_id, 'assistant', fullResponse);
            db.prepare("UPDATE conversations SET updated_at=strftime('%s','now') WHERE id=?").run(conversation_id);
            res.write(`data: ${JSON.stringify({ done: true, conversation_id, title: db.prepare('SELECT title FROM conversations WHERE id=?').get(conversation_id)?.title })}\n\n`);
            res.end();
          }
        } catch (e) {}
      }
    });

    response.body.on('error', (err) => {
      res.write(`data: ${JSON.stringify({ error: 'Ollama stream error. Is Ollama running?' })}\n\n`);
      res.end();
    });

  } catch (err) {
    const msg = err.message.includes('ECONNREFUSED')
      ? 'Cannot connect to Ollama. Run: ollama serve'
      : err.message;
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    res.end();
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Local AI Hub (Ollama) running at http://localhost:${PORT}`);
  console.log(`🤖 Model: ${OLLAMA_MODEL} | 🔗 Ollama: ${OLLAMA_HOST}\n`);
});
