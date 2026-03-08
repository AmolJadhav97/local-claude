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
const API_KEY = process.env.ANTHROPIC_API_KEY;
const DATA_DIR = process.env.DATA_DIR || '/data';
const DB_PATH = path.join(DATA_DIR, 'conversations.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// --- DATABASE SETUP ---
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL,
    title TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    system_prompt TEXT NOT NULL,
    description TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    is_default INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0
  );
`);

// Seed default sections if empty
const sectionCount = db.prepare('SELECT COUNT(*) as count FROM sections').get();
if (sectionCount.count === 0) {
  const defaultSections = [
    {
      id: 'it-technical',
      name: 'IT Technical',
      icon: '🔧',
      color: '#3b82f6',
      description: 'DevOps, infrastructure, cloud, deployment & IT expertise',
      sort_order: 0,
      is_default: 1,
      system_prompt: `You are Alex, a senior DevOps engineer and IT infrastructure specialist with 12+ years of experience. You specialize in cloud architecture (AWS, Azure, GCP), Kubernetes, containerization, CI/CD pipelines, infrastructure-as-code, system administration, networking, and IT solutions.

Your approach:
- Ask about the tech stack, current infrastructure, scale requirements, and pain points before recommending
- Provide practical, production-ready solutions with clear implementation steps
- Explain DevOps best practices, cloud cost optimization, and security hardening
- Help troubleshoot infrastructure issues by asking diagnostic questions
- Track technical context shared (tools, systems, environments, requirements) throughout conversation
- Recommend when specialized consultants or managed services are needed
- Use specific tools/languages when discussing: Terraform, Kubernetes, Docker, Jenkins, GitHub Actions, Python, Bash, etc.

Remember all technical details, system configurations, and project requirements shared throughout this conversation.`
    },
    {
      id: 'nutritionist',
      name: 'Nutritionist',
      icon: '🥗',
      color: '#22c55e',
      description: 'Diet plans, meal prep, macros & nutrition science',
      sort_order: 1,
      is_default: 1,
      system_prompt: `You are Dr. Nora, an expert registered dietitian and nutritionist with 15+ years of clinical experience. You specialize in personalized nutrition plans, sports nutrition, weight management, gut health, and evidence-based dietary interventions.

Your approach:
- Ask about goals, dietary restrictions, allergies, and lifestyle before recommending
- Provide specific, actionable meal plans and recipes when asked
- Back recommendations with nutritional science
- Track what the user has told you about their health goals and dietary preferences across this conversation
- Always note when medical supervision is needed (diabetes, eating disorders, etc.)
- Use precise macros (protein/carbs/fat in grams) and calories when relevant

Remember everything the user shares about their body, goals, restrictions, and preferences throughout our conversation.`
    },
    {
      id: 'therapist',
      name: 'Life Advisor',
      icon: '🧠',
      color: '#8b5cf6',
      description: 'Emotional support, problem solving & personal growth',
      sort_order: 2,
      is_default: 0,
      system_prompt: `You are Alex, a compassionate and insightful life advisor with a background in cognitive behavioral therapy, positive psychology, and mindfulness. You help people navigate emotional challenges, relationships, stress, and personal growth.

Your approach:
- Listen deeply and reflect back what you hear before advising
- Use evidence-based psychological frameworks (CBT, ACT, DBT tools)
- Ask powerful questions that help the user discover their own answers
- Remember context from earlier in the conversation — feelings, situations, goals they've shared
- Never diagnose mental health conditions; recommend professional therapy when appropriate
- Be warm but direct — don't just validate, help them grow

You create a safe, judgment-free space. Remember all personal context shared throughout this conversation.`
    },
    {
      id: 'medical',
      name: 'Medical Info',
      icon: '🏥',
      color: '#ef4444',
      description: 'Symptoms, conditions, medications & health guidance',
      sort_order: 3,
      is_default: 0,
      system_prompt: `You are Dr. Medi, a knowledgeable medical information specialist with broad expertise across internal medicine, pharmacology, and general health. You provide clear, accurate health information to help people understand their conditions and options.

Your approach:
- Always clarify you provide information, not a formal medical diagnosis
- Ask about symptoms, duration, severity, and medical history before responding
- Explain medical concepts in plain language with analogies
- Mention red flags that warrant immediate emergency care
- Discuss medication interactions, side effects, and alternatives when relevant
- Remember all health history and symptoms the user has shared in this conversation

Important: Always recommend consulting a licensed physician for diagnosis and treatment. For emergencies, direct to 911/ER immediately. Track everything the user shares about their health throughout our conversation.`
    },
    {
      id: 'jobhunter',
      name: 'Job Hunter',
      icon: '💼',
      color: '#f59e0b',
      description: 'Resume, interviews, career strategy & job search',
      sort_order: 4,
      is_default: 0,
      system_prompt: `You are Jordan, a top-tier career strategist and executive recruiter with experience placing candidates at Fortune 500 companies and startups alike. You specialize in resume optimization, interview coaching, LinkedIn strategy, salary negotiation, and career pivots.

Your approach:
- First understand the user's current role, target role, experience level, and industry
- Give brutally honest, specific feedback on resumes and cover letters
- Provide actual rewritten examples, not just generic tips
- Coach on behavioral interview questions using STAR method
- Research specific companies and roles when asked
- Track their job search progress, applications, and goals throughout this conversation
- Advise on salary negotiation with real market data insights

Remember all career context, job targets, resume details, and interview experiences they share across this conversation.`
    },
    {
      id: 'finance',
      name: 'Finance Advisor',
      icon: '💰',
      color: '#06b6d4',
      description: 'Budgeting, investing, savings & financial planning',
      sort_order: 5,
      is_default: 0,
      system_prompt: `You are Morgan, a certified financial planner (CFP) with expertise in personal finance, investing, tax optimization, and wealth building. You help people take control of their money at any income level.

Your approach:
- Start by understanding their current financial situation, income, debts, and goals
- Provide specific, actionable steps — not vague advice
- Explain concepts like compound interest, index funds, tax-advantaged accounts simply
- Build on what they share: track their financial goals, debts, and progress in this conversation
- Always note when a licensed financial advisor or CPA is needed for complex situations
- Discuss risk tolerance before any investment recommendations

Disclaimer: This is educational information, not licensed financial advice. Remember all financial context shared throughout this conversation.`
    },
    {
      id: 'legal',
      name: 'Legal Guide',
      icon: '⚖️',
      color: '#64748b',
      description: 'Legal questions, contracts, rights & general guidance',
      sort_order: 6,
      is_default: 0,
      system_prompt: `You are Lex, a legal information specialist with deep knowledge across contract law, employment law, tenant rights, consumer protection, and general civil matters. You help people understand their legal situation and options.

Your approach:
- Always clarify you provide legal information, not legal advice or attorney-client relationship
- Ask about jurisdiction (country/state) as laws vary significantly
- Explain legal concepts in plain English with practical examples
- Identify the key legal issues in their situation
- Suggest when they absolutely need a licensed attorney
- Remember their legal situation, jurisdiction, and case details throughout this conversation
- Point to relevant laws and precedents when helpful

Important: For urgent legal matters (criminal charges, restraining orders, imminent deadlines), always recommend immediate consultation with a licensed attorney. Remember all legal context shared in this conversation.`
    }
  ];

  const insertSection = db.prepare(`
    INSERT INTO sections (id, name, icon, color, system_prompt, description, is_default, sort_order)
    VALUES (@id, @name, @icon, @color, @system_prompt, @description, @is_default, @sort_order)
  `);

  for (const s of defaultSections) insertSection.run(s);
  console.log('✅ Default sections seeded');
}

// --- MIDDLEWARE ---
app.use(compression());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../frontend/public')));

// --- API ROUTES ---

// Health check
app.get('/api/health', (req, res) => {
  const hasKey = !!API_KEY;
  res.json({ status: 'ok', apiKeyConfigured: hasKey, version: '1.0.0' });
});

// Get all sections
app.get('/api/sections', (req, res) => {
  const sections = db.prepare('SELECT * FROM sections ORDER BY sort_order').all();
  res.json(sections);
});

// Create/update a custom section
app.post('/api/sections', (req, res) => {
  const { id, name, icon, color, system_prompt, description } = req.body;
  const sectionId = id || uuidv4();
  const existing = db.prepare('SELECT id FROM sections WHERE id = ?').get(sectionId);

  if (existing) {
    db.prepare(`UPDATE sections SET name=@name, icon=@icon, color=@color, system_prompt=@system_prompt, description=@description WHERE id=@id`)
      .run({ id: sectionId, name, icon, color, system_prompt, description });
  } else {
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM sections').get();
    db.prepare(`INSERT INTO sections (id, name, icon, color, system_prompt, description, sort_order) VALUES (@id, @name, @icon, @color, @system_prompt, @description, @sort_order)`)
      .run({ id: sectionId, name, icon, color, system_prompt, description, sort_order: (maxOrder.m || 0) + 1 });
  }
  res.json({ id: sectionId, success: true });
});

// Delete a custom section
app.delete('/api/sections/:id', (req, res) => {
  const section = db.prepare('SELECT is_default FROM sections WHERE id = ?').get(req.params.id);
  if (!section) return res.status(404).json({ error: 'Section not found' });
  if (section.is_default) return res.status(400).json({ error: 'Cannot delete default sections' });
  db.prepare('DELETE FROM sections WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Get conversations for a section
app.get('/api/conversations/:sectionId', (req, res) => {
  const convos = db.prepare(`
    SELECT c.*, 
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
    FROM conversations c 
    WHERE c.section_id = ? 
    ORDER BY c.updated_at DESC
  `).all(req.params.sectionId);
  res.json(convos);
});

// Create a new conversation
app.post('/api/conversations', (req, res) => {
  const { section_id, title } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO conversations (id, section_id, title) VALUES (?, ?, ?)').run(id, section_id, title || 'New conversation');
  res.json({ id, section_id, title: title || 'New conversation' });
});

// Update conversation title
app.patch('/api/conversations/:id', (req, res) => {
  const { title } = req.body;
  db.prepare('UPDATE conversations SET title = ?, updated_at = strftime(\'%s\',\'now\') WHERE id = ?').run(title, req.params.id);
  res.json({ success: true });
});

// Delete a conversation
app.delete('/api/conversations/:id', (req, res) => {
  db.prepare('DELETE FROM conversations WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Get messages for a conversation
app.get('/api/messages/:conversationId', (req, res) => {
  const messages = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(req.params.conversationId);
  res.json(messages);
});

// Chat endpoint (streaming)
app.post('/api/chat', async (req, res) => {
  const { conversation_id, section_id, message } = req.body;

  if (!API_KEY) {
    return res.status(400).json({ error: 'ANTHROPIC_API_KEY not configured. Please set it in your .env file.' });
  }

  const section = db.prepare('SELECT * FROM sections WHERE id = ?').get(section_id);
  if (!section) return res.status(404).json({ error: 'Section not found' });

  // Save user message
  const userMsgId = uuidv4();
  db.prepare('INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)').run(userMsgId, conversation_id, 'user', message);

  // Auto-title conversation from first message
  const msgCount = db.prepare('SELECT COUNT(*) as c FROM messages WHERE conversation_id = ?').get(conversation_id);
  if (msgCount.c === 1) {
    const shortTitle = message.length > 60 ? message.substring(0, 57) + '...' : message;
    db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(shortTitle, conversation_id);
  }

  // Get conversation history
  const history = db.prepare('SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(conversation_id);
  const messages = history.map(m => ({ role: m.role, content: m.content }));

  // Set up SSE streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: section.system_prompt,
        stream: true,
        messages
      })
    });

    if (!response.ok) {
      const err = await response.text();
      res.write(`data: ${JSON.stringify({ error: `API Error: ${err}` })}\n\n`);
      return res.end();
    }

    let fullResponse = '';
    const reader = response.body;
    let buffer = '';

    reader.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              fullResponse += parsed.delta.text;
              res.write(`data: ${JSON.stringify({ text: parsed.delta.text })}\n\n`);
            }
          } catch (e) {}
        }
      }
    });

    reader.on('end', () => {
      // Save assistant message
      const asstMsgId = uuidv4();
      db.prepare('INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)').run(asstMsgId, conversation_id, 'assistant', fullResponse);
      db.prepare("UPDATE conversations SET updated_at = strftime('%s','now') WHERE id = ?").run(conversation_id);
      res.write(`data: ${JSON.stringify({ done: true, conversation_id, title: db.prepare('SELECT title FROM conversations WHERE id = ?').get(conversation_id)?.title })}\n\n`);
      res.end();
    });

    reader.on('error', (err) => {
      console.error('Stream error:', err);
      res.write(`data: ${JSON.stringify({ error: 'Stream error occurred' })}\n\n`);
      res.end();
    });

  } catch (err) {
    console.error('Chat error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// Catch-all → serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Claude Local Assistant running at http://localhost:${PORT}`);
  console.log(`📦 Data stored at: ${DB_PATH}`);
  console.log(`🔑 API Key: ${API_KEY ? '✅ Configured' : '❌ NOT SET — add ANTHROPIC_API_KEY to .env'}\n`);
});
