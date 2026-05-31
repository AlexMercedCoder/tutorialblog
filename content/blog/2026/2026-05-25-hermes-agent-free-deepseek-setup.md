---
title: "Use Hermes Agent for Free With DeepSeek V4 and Slack"
date: "2026-05-25"
description: "Hermes Agent is a free, open-source AI agent from Nous Research. Connect it to DeepSeek V4 for zero-cost inference and Slack for anywhere access. Here is how to set it up in 10 minutes."
author: "Alex Merced"
category: "AI Tools & Software Development"
tags:
  - hermes agent
  - deepseek
  - ai agents
  - nous research
  - slack integration
  - free ai tools
---

# Use Hermes Agent for Free With DeepSeek V4 and Slack

<!-- Meta Description: Hermes Agent is a free, open-source AI agent from Nous Research. Connect it to DeepSeek V4 for zero-cost inference and Slack for anywhere access. Here is how to set it up in 10 minutes. -->
<!-- Primary Keyword: Hermes Agent free setup -->
<!-- Secondary Keywords: DeepSeek V4 free inference, AI agent Slack integration, Nous Portal guide -->

Most AI agent frameworks lock you into a paid model. Claude Code needs an Anthropic subscription. Codex needs an OpenAI plan. Cursor costs $20 a month. Hermes Agent from Nous Research works differently: it is a fully open-source agent framework that lets you plug in any inference provider you want.

That means you can run a capable AI coding agent for exactly zero dollars by pointing it at DeepSeek V4 through the Nous Portal. And if you add Slack integration, you can talk to that agent from your phone, your browser, or wherever your team already chats.

Here is how to do both.

## What Hermes Agent Is

Hermes Agent is an open-source framework in the same category as Claude Code and OpenAI Codex. It runs in your terminal, answers questions, executes shell commands, edits files, searches the web, and delegates subtasks to child agents. What makes it different from the paid alternatives:

**Skills.** When Hermes solves a complex problem or learns a workflow, it can save that knowledge as a reusable skill. The next time you ask it to do something similar, it loads the skill and picks up where it left off. Over time, it gets better at your specific work without you teaching it the same thing twice.

**Memory.** It remembers who you are, your preferences, and your environment across sessions. You do not have to reintroduce your project structure or tooling every time you start a new conversation.

**Multi-platform gateway.** The same agent that runs in your terminal can also run on Slack, Telegram, Discord, WhatsApp, and a dozen other platforms. You use the same tools and the same session history from every interface.

**Provider-agnostic.** Hermes works with 20+ inference providers. You can switch from DeepSeek to Claude to a local model mid-workflow. One config change, no architecture change.

Every one of these features is free because the agent software itself is open source. You only pay for the model tokens, and the setup below shows you how to get those for free too.

## Two Free Paths to DeepSeek V4

DeepSeek V4 Flash is a competitive reasoning and coding model. Through the right provider, you can access it without spending money.

### Path 1: Nous Portal (recommended)

Nous Research, the same team that builds Hermes, runs the Nous Portal. It is a unified inference gateway that proxies models from across the ecosystem. One OAuth login gives you access to DeepSeek, Claude, GPT, Gemini, Qwen, and 300 other models, all billed against a single subscription.

The free path uses DeepSeek V4 Flash through the Nous inference API. You do not need a paid subscription for this specific model. Set it up in two ways:

**One-command setup:**
```bash
hermes setup --portal
```

That runs the Portal OAuth flow, sets Nous as your inference provider in `config.yaml`, and configures the gateway. You are ready to chat immediately after.

**Manual config:** If you already have credentials, set these values in `~/.hermes/.env`:
```env
NOUS_API_KEY=your_key_here
```

And in `~/.hermes/config.yaml`:
```yaml
model:
  default: deepseek/deepseek-v4-flash:free
  provider: nous
  base_url: https://inference-api.nousresearch.com/v1
```

Run `hermes chat` and you are talking to DeepSeek V4 through a free inference endpoint.

### Path 2: OpenCode Zen

OpenCode Zen is a curated model marketplace that provides access to tested frontier models including GPT, Claude, Gemini, and others. It is pay-as-you-go priced but has free tier access for evaluation.

To use it with Hermes, add to `~/.hermes/.env`:
```env
OPENCODE_ZEN_API_KEY=your_key_here
```

And in config.yaml:
```yaml
model:
  default: gpt-4o
  provider: opencode-zen
```

OpenCode Zen is a solid alternative if you want access to OpenAI or Anthropic models without managing separate API keys. For purely free inference, the Nous Portal path is simpler and more direct.

## How to Configure the Slack Gateway

Once your Hermes agent is running in the terminal, adding Slack integration takes about 10 minutes. The agent uses Socket Mode, which means it connects through a WebSocket instead of a public HTTP endpoint. That is important because it works behind firewalls, on your laptop, or on a private server without opening ports.

### Step 1: Create a Slack App

Go to `api.slack.com/apps` and click **Create New App**. Choose **From Scratch**, give it a name, and select your workspace.

### Step 2: Enable Socket Mode

In the app settings, navigate to **Socket Mode** and toggle it on. You will be prompted to create an App-Level Token. Do that and copy the token that starts with `xapp-`.

### Step 3: Add Bot Token Scopes

Go to **OAuth & Permissions** and add these Bot Token Scopes:
- `channels:history` : read channel messages
- `channels:read` : see channel metadata
- `chat:write` : send messages
- `app_mentions:read` -- detect when the bot is @mentioned
- `users:read` -- look up user info

### Step 4: Subscribe to Events

Under **Event Subscriptions**, enable events. Then add these bot events:
- `message.channels` : required for the bot to see messages in public channels
- `app_mention` -- respond to direct @mentions

Without `message.channels`, the bot will only see messages in DMs.

### Step 5: Install the App

Click **Install to Workspace** under OAuth & Permissions. Copy the Bot Token that starts with `xoxb-`.

### Step 6: Set Env Vars

Add these to `~/.hermes/.env`:
```env
SLACK_BOT_TOKEN=xoxb-y...oken
SLACK_APP_TOKEN=xapp-your-app-token
SLACK_ALLOWED_USERS=U0XXXXXX
```

The `allowed_users` field is a comma-separated list of Slack user IDs. Only users in this list can interact with the bot.

### Step 7: Run the Gateway

The fast way to test:
```bash
hermes gateway run
```

For a permanent setup that survives reboots:
```bash
hermes gateway install
```

That installs it as a systemd service. The gateway starts automatically and reconnects if the WebSocket drops.

## What You Get With Slack Integration

Once the gateway is running, your Slack workspace has a permanent AI agent with full tool access. From Slack you can:

**Use Hermes from anywhere.** Your phone, your browser, your desktop -- any device with the Slack app. No terminal required.

**Collaborate in teams.** Share the bot with your team. Everyone in the allowed users list can assign it tasks, ask questions, or request code reviews from the same agent.

**Full tool access.** The Slack interface is not a pared-down chatbot. It has the same toolset as the terminal version: file editing, terminal commands, web research, cron job scheduling, and subagent delegation.

**Persistent sessions.** Walk away from a conversation, come back on another device, and pick up where you left off. The session state is preserved in the gateway.

**Zero infrastructure.** Because it uses Socket Mode, you do not need a public URL, a load balancer, or any cloud infrastructure. A laptop or a $5 VPS is sufficient.

## Tradeoffs and Limitations

The free DeepSeek V4 Flash endpoint is a single model with rate limits. If you hit the ceiling, the agent returns an error instead of a response. You can work around this by adding a fallback provider in config.yaml -- the agent will retry with a different model automatically.

The Slack bot only responds when the gateway process is running. If your laptop goes to sleep or your server goes down, the bot goes quiet until it comes back. For 24/7 availability, deploy the gateway on a cheap always-on machine (a Raspberry Pi, an old laptop, or a $5 DigitalOcean droplet).

Setting up the Slack App requires navigating Slack's API console, which has a reputation for confusing UX. The steps above cover the critical ones. If you miss `message.channels`, the bot will appear to be online but will never see messages in public channels.

## Recommended Approach

Start with the Nous Portal path. Run `hermes setup --portal`, pick DeepSeek V4 Flash, and verify it works with `hermes chat`. Use `hermes doctor` to check that everything is healthy.

Once the terminal workflow is solid, add the Slack gateway. Create the Slack App, set the env vars, and run `hermes gateway run` to confirm the WebSocket connects. Then install it as a service with `hermes gateway install`.

The total setup time is under 30 minutes, and the ongoing cost is zero. You get an AI agent with persistent memory, reusable skills, multi-platform access, and full system-level tooling, all running on free inference.