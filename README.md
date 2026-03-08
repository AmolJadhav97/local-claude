# Claude Local — Personal AI Hub

A self-hosted, Docker-based frontend for Claude AI with multiple expert personas.  
All conversation history stored **locally on your machine** — no third-party data storage.

---

## What You Get

- **6 built-in AI experts** — Nutritionist, Life Advisor, Medical Info, Job Hunter, Finance Advisor, Legal Guide
- **Persistent conversations** per expert — each chat is remembered in full
- **Custom experts** — create your own with custom system prompts
- **Fully local data** — SQLite database stored in a Docker volume on your machine
- **Beautiful UI** — dark theme, streaming responses, markdown rendering
- **Streaming responses** — see Claude's reply as it types

---

## Security Notes

> **Important:** The Claude model itself runs on Anthropic's servers — your messages are sent to `api.anthropic.com` to generate responses. This is unavoidable; Claude cannot run fully offline.

**What IS local/private:**
- The frontend app runs entirely on your machine (Docker container)
- All conversation history is stored in a SQLite database on your machine
- Your API key never leaves your machine (used only for direct API calls)
- No analytics, no third-party services, no data brokers

**What goes to Anthropic:**
- Your messages and the conversation history (for context)
- This is the same as using claude.ai directly

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed
- An [Anthropic API key](https://console.anthropic.com)

---

## Setup (5 minutes)

### Step 1 — Copy the environment file
```bash
cp .env.example .env
```

### Step 2 — Add your API key
Open `.env` and replace `sk-ant-your-key-here` with your actual key:
```
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxx
```

### Step 3 — Build and start
```bash
docker compose up --build -d
```

### Step 4 — Open in browser
Visit: **http://localhost:3000**

---

## Daily Usage

```bash
# Start
docker compose up -d

# Stop
docker compose down

# View logs
docker compose logs -f

# Rebuild after code changes
docker compose up --build -d
```

---

## Changing the Port

If port 3000 is taken, edit both files:

**`.env`:**
```
PORT=8080
```

**`docker-compose.yml`:**
```yaml
ports:
  - "8080:8080"
```

Then restart: `docker compose up -d`

---

## Your Data

All conversations are stored in a Docker volume named `claude-data`.

**Backup your conversations:**
```bash
docker run --rm -v claude-data:/data -v $(pwd):/backup alpine \
  cp /data/conversations.db /backup/conversations-backup.db
```

**Restore from backup:**
```bash
docker run --rm -v claude-data:/data -v $(pwd):/backup alpine \
  cp /backup/conversations-backup.db /data/conversations.db
```

---

## Adding Custom Experts

Click **"+ Add Expert"** in the sidebar. You can define:
- **Icon** — any emoji
- **Name** — e.g. "Fitness Coach"
- **Color** — accent color for the expert
- **Description** — short subtitle
- **System Prompt** — full instructions for how Claude should behave

### Example System Prompt
```
You are Coach Sam, an expert personal trainer with 10 years of experience 
in strength training, HIIT, and rehabilitation. You create personalized 
workout plans based on the user's fitness level, goals, equipment, and 
schedule. Remember everything the user tells you about their body, 
injuries, and progress throughout our conversation.
```

---

## Troubleshooting

**"API key not configured" banner:**  
→ Make sure your `.env` file has `ANTHROPIC_API_KEY=sk-ant-...` and restart.

**Port already in use:**  
→ Change the port (see above) or run `lsof -i :3000` to find what's using it.

**Container won't start:**  
→ Check logs: `docker compose logs`

**Conversations not saving:**  
→ The Docker volume may have a permissions issue. Try `docker compose down -v` then `docker compose up --build -d` (warning: clears data).

---

## Project Structure

```
claude-local/
├── backend/
│   ├── server.js          ← Express API server
│   └── package.json
├── frontend/
│   └── public/
│       └── index.html     ← Single-page frontend
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Customizing the UI

The entire frontend is in `frontend/public/index.html` — a single self-contained file.  
After editing, rebuild: `docker compose up --build -d`

---

Made for personal use — keep your AI conversations private and organized.
