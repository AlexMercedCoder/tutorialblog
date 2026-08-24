---
title: "Your Agent Should Answer the Phone: A Field Guide to AI Gateways on Slack, Discord, Telegram, Signal, and Teams"
date: "2026-08-24"
description: "A field guide to AI gateways on Slack, Discord, Telegram, Signal, and Teams: architecture, auth, cost, and the failure modes that matter."
author: "Alex Merced"
category: "AI & Agents"
canonical: https://iceberglakehouse.com/posts/ai-gateways-field-guide/
tags:
  - AI agents
  - gateways
  - Slack
  - developer tools
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/ai-gateways-field-guide/).

The most useful thing my terminal agent ever did happened while I was nowhere near a terminal. I was in line at an airport, a build had failed, and I sent a message from my phone: "check why the release job failed and tell me if it is the flaky test again." Four minutes later I had the answer and a proposed fix waiting for my approval. The agent had not changed. What changed was that it heard me from somewhere other than a shell prompt.

That capability has a name now. An AI gateway is a long-running process that connects one agent to the messaging platforms you already use, routes each incoming message to the right session, enforces who is allowed to talk to it, and delivers the reply back where the message came from. Hermes Agent calls it the gateway. OpenClaw calls it the Gateway with a capital G. My own Loro and MagAgent harnesses have one each. The architecture is the same in every case, and so are the failure modes.

This article is about that architecture and about the practical question everyone asks after they get it working once: which platform is easiest, which one is safest, and what does each one cost you in setup time, capability, and risk. I will cover Slack, Discord, Telegram, Signal, and Microsoft Teams in depth, WhatsApp and a few others in passing, and I will show real configuration from Hermes, OpenClaw, and my own tools.

Disclosure: I am Head of Developer Relations at Dremio, and I wrote Loro and MagAgent. Both have gateways, and I will be plain about what mine do and do not do compared to Hermes and OpenClaw.

## Why the Gateway Is a Separate Thing

An agent harness (the program that runs a model in a loop, manages tools, and enforces policy) is built around a single conversation at a time. You type, it works, it replies. That model breaks in three specific ways the moment you want to reach the agent from a chat app.

First, chat platforms are push systems. Telegram, Discord, and Slack hold a persistent connection open and push messages to you. Teams and some Slack configurations do the reverse and call a public HTTPS URL you host. Either way, something has to be listening 24 hours a day, and a terminal session that exits when you close the laptop is not that thing.

Second, chat platforms are multi-tenant. A Discord server has hundreds of members. A Slack workspace has every employee. A Telegram bot's username is public and anyone on earth can message it. The agent behind the gateway has shell access to a machine. If the gateway does not decide, before the agent ever sees a message, whether the sender is allowed to send it, you have handed a shell to strangers.

Third, chat platforms are stateful in ways a terminal is not. A Slack thread is a conversation. A Discord channel is a different conversation from a DM with the same person. A Telegram group is different from a private chat. The gateway has to map each of those to an agent session, persist the session across restarts, and decide when a session resets.

So the gateway does four jobs. It holds the platform connections. It authorizes senders. It maps platform conversations to agent sessions. It delivers replies, with whatever formatting, threading, streaming, and typing indicators the platform supports. Hermes adds a fifth: the same gateway process runs the cron scheduler, so a scheduled job can deliver its output to any connected platform.

That separation is why one gateway can serve many platforms at once. Hermes lists 28 platforms in its comparison table, from Telegram and Discord through Feishu, Matrix, iMessage bridges, and Buzz. OpenClaw supports a similar spread through a plugin model where Telegram ships in the core package and everything else installs separately. Loro covers Slack, Discord, Telegram, Teams, Signal bridges, and generic signed webhooks. MagAgent covers Slack, Discord, and Telegram. The counts differ. The shape does not.

## The Two Gateways Everyone Compares

Hermes Agent and OpenClaw are the two open-source gateways with the most users, and they are related. OpenClaw started as Clawdbot in November 2025, was renamed twice after a trademark notice, and is now developed by the OpenClaw Foundation, a non-profit. Its creator joined OpenAI in February 2026. Hermes Agent, from Nous Research, is widely described as OpenClaw's spiritual successor, ships a `hermes claw migrate` command that imports OpenClaw settings, memories, skills, and API keys, and passed 100,000 GitHub stars this year.

**Hermes** is Python. One install command, then `hermes gateway setup` walks you through each platform with arrow-key selection, and `hermes gateway install` registers it as a systemd user service on Linux or a launchd agent on macOS. Configuration lives in `~/.hermes/.env` for secrets and `~/.hermes/config.yaml` for behavior. Every platform gets the same session model, the same slash commands, and the same access-control pattern. The design goal is one process that does everything, and it shows: voice transcription, cron delivery, per-channel model overrides, background sessions, a delivery ledger that redelivers replies lost in a crash, and a circuit breaker per platform adapter all live in the gateway.

**OpenClaw** is TypeScript. `openclaw onboard` runs the guided setup, and a browser dashboard at `127.0.0.1:18789` handles chat, configuration, and sessions. Configuration is JSON under a `channels` key, where each platform has its own block with a `dmPolicy` and `groupPolicy`. The plugin model is the main architectural difference from Hermes: Telegram is bundled, and Discord, Slack, Signal, Teams, and the rest install with `openclaw plugins install`. OpenClaw also has a formal `accessGroups` mechanism that lets you define one set of trusted senders across platforms and reference it from every channel's allowlist.

Both default to denying unknown senders. Both support DM pairing, where an unknown user gets a one-time code and an operator approves it from the CLI. Both gate group messages behind a mention by default. Those three defaults are the difference between a gateway that is safe to run and one that is not, and it is worth confirming any gateway you use has all three before you connect a platform.

My own tools sit alongside these rather than competing on breadth. Loro's gateway is built for the governed case: platform users are mapped to tenant-scoped Loro identities, remote message text explicitly carries no approval authority, and a credential vault keeps gateway secrets in the operating-system keyring. MagAgent's gateway is the developer case: drive your terminal agent from Slack, Discord, or Telegram while you are away, with the same MagGraph memory it uses locally. I will show both later. For most readers starting today, Hermes or OpenClaw is the right first gateway, and the platform choice matters more than the gateway choice.

## Telegram: The One to Start With

Every guide to every gateway says the same thing about Telegram, and they are right. It is the easiest platform to connect by a wide margin, and it is the best platform to learn the gateway model on.

The setup is a conversation with a bot. Open Telegram, message `@BotFather`, send `/newbot`, pick a name and a username ending in `bot`, and BotFather hands you a token. That token is the whole credential. There is no developer portal, no OAuth flow, no app manifest, no intent checkboxes, and no public endpoint. The gateway connects outbound to Telegram's servers with long polling, so it works from behind any firewall, on a laptop, on a five-dollar VPS, or on a phone running Termux.

In Hermes:

```bash
hermes gateway setup        # pick Telegram, paste the token, set allowed users
hermes gateway install      # register as a service
hermes gateway start
```

Or by hand in `~/.hermes/.env`:

```bash
TELEGRAM_BOT_TOKEN=123456789:AAH...
TELEGRAM_ALLOWED_USERS=123456789
```

In OpenClaw, the equivalent is a block in the JSON config:

```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "123456789:AAH...",
      "dmPolicy": "pairing"
    }
  }
}
```

Two things trip people up. The first is finding your own numeric user ID for the allowlist, because Telegram shows usernames, not IDs. OpenClaw's setup resolves an `@username` to an ID for you and warns that `@username` entries in the allowlist do not match at runtime. In Hermes, the simplest path is to skip the allowlist, message the bot, and approve the pairing code it sends back. The second is groups. A Telegram bot in a group only sees messages that mention it unless you disable privacy mode in BotFather with `/setprivacy`, and both gateways gate group messages behind a mention anyway. Negative chat IDs identify groups, and OpenClaw wants those under `channels.telegram.groups`, not in the sender allowlist.

What you get is generous. Telegram supports voice messages both ways, images, files, threads, typing indicators, and streaming replies by editing the message in place. Hermes tunes its defaults for Telegram as a mobile inbox: tool-progress breadcrumbs off, busy acknowledgments terse, and a single edit-in-place "working, N minutes" bubble so a long task shows a heartbeat instead of a typing indicator for half an hour.

The tradeoffs are real but modest. Telegram is not end-to-end encrypted for bot conversations. The bot's username is public, which is why the allowlist matters. And Telegram is a consumer platform, so it is the wrong answer for a company that has standardized on Slack or Teams. For a personal agent, a small team, or your first gateway, start here.

## Discord: The Best Fit for a Team That Already Lives There

Discord is the second-easiest platform and the best one for a team or community that already has a server. The setup is a portal instead of a chat, but it is a short one.

Go to the Discord Developer Portal, create an application, add a bot to it, and copy the bot token. Then, and this is the step everyone misses, enable the Message Content intent under the bot's Privileged Gateway Intents. Without it, the bot connects fine and receives events, but every message body is empty. Generate an OAuth2 invite URL with the `bot` scope and the permissions to read and send messages, open it, and pick the server.

```bash
DISCORD_BOT_TOKEN=MTIz...
DISCORD_ALLOWED_USERS=123456789012345678
```

Discord IDs are 18-digit snowflakes. Enable Developer Mode under User Settings, Advanced, and then right-click any user, channel, or server to copy its ID. OpenClaw has `openclaw channels discord list-channels` to enumerate them and a `channels.discord.allowed_channels` setting to restrict where the bot answers.

Discord's capability set is the richest of the five. Hermes marks it with every box checked: voice, images, files, threads, reactions, typing, and streaming. Voice is the standout. Hermes can join a Discord voice channel and hold a spoken conversation, which no other mainstream platform supports. Threads map naturally to sessions, and Hermes resolves per-channel overrides by exact thread ID first and then the parent channel, so a thread inherits its channel's model and system prompt automatically.

That per-channel override is the feature that makes Discord a good team surface. From one gateway, `#daily` can run a cheap fast model with a general prompt and `#dev` can run a frontier model with a code-review specialist prompt:

```yaml
platforms:
  discord:
    enabled: true
    channel_overrides:
      "123456789012345678":
        model: anthropic/claude-sonnet-4.6
        provider: anthropic
        system_prompt: "You are the #dev channel code-review specialist."
      "987654321098765432":
        model: openai/gpt-5-mini
```

A user running `/model` in a chat still wins over the channel default, and the override is injected per turn rather than stored in history.

The tradeoffs. Discord is a consumer platform with a gaming heritage, and some enterprises block it outright. The file limit is 8 MB without Nitro, the smallest of the five. Bot behavior in a busy server needs the admin and regular-user split that Hermes supports, where admins get every slash command and regular users get only the ones you enable, because otherwise anyone in the server can run `/model` and switch your bill to the most expensive option. And the Message Content intent requires verification once a bot is in more than 100 servers, which does not matter for a private bot but matters if you build a public one.

## Slack: The Work Surface, With Two Tokens and a Mode Decision

Slack is where most professional teams already are, so it is where an agent delivers the most value in a corporate setting. It is also the first platform where the setup stops being trivial, for one reason: Slack apps have two tokens and two connection modes, and you have to pick.

The two modes are Socket Mode and HTTP Request URLs. In Socket Mode, the gateway opens an outbound WebSocket to Slack and receives events over it, the same way Telegram and Discord work. No public endpoint, no reverse proxy, works from a laptop. In HTTP mode, Slack calls a public URL you host. Socket Mode is the right default for almost everyone, and both Hermes and OpenClaw support it. OpenClaw's docs also describe a relay mode where an external connector owns the credentials.

The two tokens come from the Slack app configuration. Create an app at api.slack.com, enable Socket Mode, and generate an app-level token with the `connections:write` scope. That is the `xapp-` token. Then, under OAuth and Permissions, add bot token scopes (at minimum `chat:write`, `app_mentions:read`, `im:history`, `im:read`, `im:write`, and `channels:history` if the bot should read channels) and install the app to the workspace. That produces the `xoxb-` bot token. Finally, under Event Subscriptions, subscribe to `message.im` and `app_mention` so the events actually arrive.

```bash
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_ALLOWED_USERS=U01ABC...
```

OpenClaw's block wants both keys too:

```json
{
  "channels": {
    "slack": {
      "enabled": true,
      "botToken": "xoxb-...",
      "appToken": "xapp-...",
      "dmPolicy": "pairing"
    }
  }
}
```

Slack user IDs start with `U` and are visible in a member's profile under the three-dot menu. Getting the scope list wrong is the most common Slack failure. The symptom is a bot that connects, shows online, and never replies, because the event it needs is not subscribed or the scope to read it is missing. Slack's error messages for this are poor. Check the scopes first.

What you get is a mature work surface. Hermes checks every capability box for Slack: voice, images, files, threads, reactions, typing, and streaming. Threads are first-class, and a gateway that maps a thread to a session gives you exactly the "one conversation per topic" behavior a team wants. Hermes uses Slack's Assistant API for its typing indicator, which shows "is thinking" in the compose box. Some users find that noisy because it briefly disables the compose box, and there is a `typing_indicator: false` flag per platform to turn it off.

The tradeoffs are about governance rather than capability. Installing a Slack app to a workspace requires admin approval in most companies, and the admin will ask what the bot can read. A bot with `channels:history` reads every message in every channel it is in, and it should be in as few channels as possible. Rate limits are per workspace and stricter than Telegram or Discord. And Slack's free tier hides messages older than 90 days, which affects any workflow that expects the agent to search history. For a work agent in a Slack-first company, none of that is a reason to avoid it. It is a reason to write the scope list down before you ask for approval.

## Signal: The Privacy Choice, and the Hardest Setup

Signal is the platform people pick when message content matters more than convenience, and the setup reflects that. There is no bot API. Signal does not want bots. What exists instead is signal-cli, a Java client that links to a Signal account as a secondary device, the same way Signal Desktop does, and exposes a local HTTP interface the gateway talks to.

The steps, from the Hermes Signal guide, are:

```bash
# macOS
brew install signal-cli

# Link to your phone: prints a QR code, scan it under
# Signal > Settings > Linked Devices > Link New Device
signal-cli link -n "HermesAgent"

# Run the daemon with your number in E.164 format
signal-cli --account +1234567890 daemon --http 127.0.0.1:8080

# Confirm it is up
curl http://127.0.0.1:8080/api/v1/check
```

Then point the gateway at the daemon:

```bash
SIGNAL_HTTP_URL=http://127.0.0.1:8080
SIGNAL_ACCOUNT=+1234567890
SIGNAL_ALLOWED_USERS=+1234567890,+0987654321
```

Four things make this harder than the others. You need Java 17 or newer. signal-cli is not in apt or snap, so on Linux you download a release tarball from GitHub. The daemon is a second long-running process that has to be kept alive alongside the gateway, so you end up with two systemd units instead of one. And the linked-device session data in `~/.local/share/signal-cli/` is an account credential, which the Hermes docs tell you to protect like a password, because it is one.

There is a design decision to make before any of that. You either link signal-cli to your own phone number or you register a separate number for the bot. Linking to your own number gives you a nice trick: Signal's "Note to Self" becomes the agent's inbox. You message yourself, signal-cli picks it up, and the reply appears in the same conversation, with echo-back protection so the bot does not answer its own replies. That is the lowest-friction personal setup. A separate number is the right choice if other people will message the bot, because otherwise every message to your personal Signal goes through an agent with shell access.

What you get is end-to-end encryption on the wire and a platform with minimal metadata collection. The adapter supports images, files, voice attachments, native formatting through Signal's body ranges, reply quotes, and reactions. What you do not get is streaming. Signal cannot edit a sent message, so Hermes suppresses tool-progress bubbles on Signal entirely, and a long task shows a typing indicator that refreshes every eight seconds and then a single final reply. Groups are off by default and enabled per group ID.

The tradeoffs are the setup cost, the extra daemon, and the fact that you are running an unofficial client against a service that does not officially support bots. Signal rate-limits attachment uploads, and Hermes batches images in groups of 32 to stay under it. For a security-sensitive personal agent, or a small group of people who already use Signal, it is worth the work. For a team, it is not the first platform to connect.

## Microsoft Teams: The Enterprise Path, With a Public Endpoint

Teams is where an agent has to live if your company is a Microsoft shop, and it is the only one of the five that requires a public HTTPS endpoint. Teams does not hold a socket open to you. The Bot Framework calls your URL.

That single fact shapes the whole setup. For local development you need a tunnel. For production you need a domain, a TLS certificate that is not self-signed, and a reverse proxy that terminates TLS and forwards plain HTTP to the gateway's listener on port 3978. Teams rejects self-signed certificates, and it rejects HTTPS forwarded to a plain-HTTP listener, which shows up in logs as a `400` on an `UNKNOWN / HTTP/1.0` request.

The registration used to require the Azure portal. Microsoft's Teams CLI now automates it:

```bash
npm install -g @microsoft/teams.cli@preview
teams login

# Expose the local port during development
devtunnel create hermes-bot --allow-anonymous
devtunnel port create hermes-bot -p 3978 --protocol http
devtunnel host hermes-bot

# Register the bot against the tunnel URL
teams app create --name "Hermes" --endpoint "https://<tunnel-url>/api/messages"
```

The CLI prints a client ID, client secret, and tenant ID, plus an install link. Save the secret. It is not shown again.

```bash
TEAMS_CLIENT_ID=<client-id>
TEAMS_CLIENT_SECRET=<client-secret>
TEAMS_TENANT_ID=<tenant-id>
TEAMS_ALLOWED_USERS=<aad-object-id>
```

`TEAMS_ALLOWED_USERS` takes Azure AD object IDs, which `teams status --verbose` prints for your own account. Then `hermes gateway restart`, confirm `curl http://localhost:3978/health` returns `ok`, and install the app from the link with `teams app get <appId> --install-link`. Hermes lazy-installs the Teams SDK into its own virtual environment on first start. Do not use the system `pip` on Ubuntu 24.04, because it refuses under PEP 668 and does not touch the service's environment anyway.

In OpenClaw, Teams is an installable plugin rather than core, and pairing is supported through the `msteams` channel.

What you get is the enterprise surface with the enterprise trust model. Every request to your endpoint is authenticated by the Bot Framework with a JWT, so unauthenticated traffic is rejected before the gateway sees it. Hermes renders dangerous-command approvals as Adaptive Cards with four buttons (allow once, allow session, always allow, deny) instead of asking the user to type `/approve`, which is the best approval experience of any platform. In DMs the bot answers every message. In group chats and channels it answers only when mentioned, and Teams delivers mentions as `<at>BotName</at>` tags that the gateway strips.

The tradeoffs are the public endpoint, the tenant admin approval to install the app, and the thinnest capability set of the five. Hermes lists Teams with images, threads, and typing, but no voice, no files, no reactions, and no streaming. The tunnel URL changes on every restart with ngrok and cloudflared unless you pay, so use a named devtunnel during development and update the endpoint with `teams app update` when it moves. For a company on Microsoft 365, Teams is not optional and the setup is worth an afternoon. For anyone else, it is the last platform to bother with.

## The Comparison, Side by Side

Here is the whole thing in one table, with my ranking of setup difficulty from one (easiest) to five.

| | Telegram | Discord | Slack | Signal | Teams |
|---|---|---|---|---|---|
| Setup difficulty | 1 | 2 | 3 | 5 | 4 |
| Credential | One bot token from BotFather | Bot token plus Message Content intent | Bot token and app token, plus scopes | Linked device via signal-cli | Client ID, secret, tenant ID via Teams CLI |
| Public endpoint needed | No | No | No (Socket Mode) | No | Yes, HTTPS with valid cert |
| Extra process | No | No | No | signal-cli daemon (Java) | Tunnel or reverse proxy |
| Encryption | Transport only | Transport only | Transport only | End-to-end | Transport only, JWT-authenticated |
| Voice | Yes | Yes, including voice channels | Yes | Attachments only | No |
| Streaming replies | Yes | Yes | Yes | No | No |
| Threads | Yes | Yes | Yes | No | Yes |
| File limit | 50 MB | 8 MB (25 with Nitro) | 1 GB on paid plans | 100 MB | Not supported by adapter |
| Admin approval to install | None | Server admin | Workspace admin, usually IT | None | Tenant admin |
| Best for | Personal agent, first gateway | Team or community already on Discord | Slack-first companies | Privacy-sensitive personal use | Microsoft 365 companies |

Two platforms did not make the table but come up constantly. **WhatsApp** is the most-used messenger on earth and both gateways support it, but through an unofficial library (Baileys) that pairs as a linked device and breaks when WhatsApp changes its protocol. Hermes also supports the official WhatsApp Business Cloud API, which is stable but requires a Meta business account and approval. **Email** is underrated: Hermes treats it as a platform, unknown senders are ignored unless pairing is explicitly enabled, and it is the one channel every enterprise already trusts. If your organization blocks all of the above, email is the fallback.

## Access Control Is the Whole Game

Every platform section above ended with an allowlist, and that was not repetition. It was the point. A gateway connects an agent with a terminal to a public messaging network. The only thing standing between a stranger and your shell is the sender check, and it has to happen in the gateway, before the model sees a word.

There are three layers, and a good gateway has all three.

**Sender allowlists.** A list of platform user IDs that are allowed to message the bot at all. Hermes reads them from per-platform environment variables (`TELEGRAM_ALLOWED_USERS`, `DISCORD_ALLOWED_USERS`, and so on) or a global `GATEWAY_ALLOWED_USERS`. OpenClaw reads them from `allowFrom` under each channel and lets you define a named `accessGroups` set once and reference it from every channel:

```json
{
  "accessGroups": {
    "operators": {
      "type": "message.senders",
      "members": {
        "discord": ["discord:123456789012345678"],
        "telegram": ["987654321"],
        "whatsapp": ["+15551234567"]
      }
    }
  },
  "channels": {
    "telegram": { "dmPolicy": "allowlist", "allowFrom": ["accessGroup:operators"] },
    "whatsapp": { "groupPolicy": "allowlist", "groupAllowFrom": ["accessGroup:operators"] }
  }
}
```

That pattern, one trusted set applied everywhere, is the right way to run a multi-platform gateway. Per-platform lists drift.

**Pairing.** The alternative to hand-maintaining IDs. An unknown user DMs the bot, gets a one-time code, and an operator approves it from the CLI: `hermes pairing approve telegram XKGH5N7P`. Codes expire in an hour, are rate-limited, and use cryptographic randomness. OpenClaw supports pairing on every channel plugin that declares it, which is most of them. Pairing is how I onboard a colleague without asking them to find their own snowflake ID.

**Group policy and mention gating.** Both gateways ignore group messages by default unless the bot is mentioned, and both fail closed: OpenClaw's `groupPolicy` defaults to `allowlist`, and an empty allowlist blocks all group traffic. Hermes goes further with an admin-versus-user tier per scope, where DM admin status does not imply group admin status, and regular users can chat but can only run the slash commands you enable. The always-allowed floor is `/help` and `/whoami`. Configure this before adding the bot to a busy channel, because `/model` in the hands of everyone in the server is a billing problem.

The one setting to never enable casually is the allow-all flag. Hermes calls it `GATEWAY_ALLOW_ALL_USERS=true` and its own docs mark it not recommended for bots with terminal access. There is a version of every gateway where that flag is on because someone was debugging and forgot. Audit for it.

Then there is the layer that neither Hermes nor OpenClaw has, and that I built Loro for. A message from a chat platform is text from a person who passed the allowlist. It is not an approval. In Loro's gateway, platform users are mapped to tenant-scoped Loro identities, and remote message text explicitly carries no approval authority. A dangerous command still needs an identity-bound approval through the approval prompt, with replay protection, and the audit log records who approved it under which identity. The allowlist says who can talk. It should not say who can authorize a write to production. Conflating the two is the most common design mistake in agent gateways, and it is worth checking whether your gateway makes it.

## Wiring a Portable Agent Behind the Gateway

Everything above assumes one agent behind the gateway. The more interesting configuration is many named agents behind it, each with its own role, model, and permissions, reachable from the same platforms.

Hermes Bot Mode does this. Each Bot is a Hermes profile at `~/.hermes/profiles/<name>/`, and Bots have their own gateway presence. OpenClaw's `openclaw agents create` and `openclaw channels <platform> set-agent` do it too: one agent per channel, each with its own system prompt and model. In both cases the agent definition is tool-specific.

MagAgent and Loro do the same thing with the Open Agent Profile (OAP), my draft specification for a named agent as a portable file. The profile carries role, model tier, tool allowlist, permissions, memory stores, and learned state. The gateway binds a profile to a platform. Here is the developer version, with MagAgent driving a reviewer profile from Slack:

```bash
python -m pip install mag-agent
magent configure                 # provider, model, and gateway tokens
magent ui                        # local workspace with profile-backed bots
```

MagAgent's gateway takes tasks from Slack, Discord, or Telegram and runs them against the same MagGraph memory the terminal uses, so a question asked from your phone gets the same project context as one asked at your desk.

The governed version is Loro. The gateway setup is its own wizard, and the credential vault keeps the platform tokens in the operating-system keyring, with multiple named accounts per provider:

```bash
python -m pip install "loro-agent[gateway]"
loro configure
loro setup identity              # who is allowed to be who
loro setup approvals             # once, session, and deny prompts
loro setup audit                 # hash-chained audit log
loro get-started                 # reads the folder and recommends the next step
```

The profile a gateway message hits is the same OAP file the terminal and the Web UI use, so when someone messages the release-notes bot from Teams, they get an agent that is structurally unable to publish, and the audit log records that the request came in over Teams under a mapped identity. That is the version of a gateway I run in a regulated environment, and it is why I built it. Hermes and OpenClaw are the version I run everywhere else.

## What Breaks: Gateway Failure Modes

Gateways fail differently from agents. An agent failure is a wrong answer. A gateway failure is a message that vanishes, a reply that arrives twice, or a stranger who gets in. Here is what I have seen, with the warning signs.

**The silent bot.** Connected, online, never replies. On Discord this is the Message Content intent. On Slack it is a missing scope or event subscription. On Telegram it is an allowlist that has your username instead of your numeric ID. On Teams it is a tunnel that died or an endpoint that still points at yesterday's URL. The warning sign is a gateway log that shows the message arriving and nothing after it. Check authorization before checking the model.

**Lost replies on restart.** The gateway produces a reply, crashes before the platform confirms delivery, and the reply is gone. Hermes fixed this with a delivery ledger in `state.db`: a reply whose send never started is redelivered as-is, and one that was mid-send is redelivered with a visible recovered-reply prefix that flags it as a possible duplicate. The semantics are honest at-least-once, with three attempts over 24 hours. If your gateway does not have this, a `hermes update` mid-task loses work. The warning sign is users reporting that long tasks sometimes produce nothing.

**The restart loop.** Adding a systemd drop-in with `ExecStopPost=/bin/kill -9 $MAINPID` to make sure the gateway dies cleanly. It fires on every stop, including clean restarts, and kills the freshly spawned instance, which `Restart=always` respawns, forever. On Telegram this produces a flood of restart notifications. The Hermes docs call this out by name. The warning sign is a home channel full of "the agent is back" messages.

**The tripped breaker that nobody resumed.** Hermes wraps each platform adapter in a circuit breaker. Repeated retryable failures (rate limits, 5xx responses, websocket drops) pause the adapter and notify the home channel of another platform. It does not auto-resume, by design, so a sustained outage does not turn into reconnect thrashing. The failure is forgetting that, and wondering why Discord has been silent for two days. `/platform list` shows `paused-by-breaker`. `/platform resume discord` clears it once the upstream is healthy.

**The duplicate listener.** Two signal-cli instances on the same phone number, or two gateway processes both polling one Telegram token. Every message is processed twice and every reply arrives twice. The warning sign is exactly that. The fix is one listener per credential, and Hermes warns if both a user and a system service unit are installed for the same install.

**Session bleed.** A Discord channel and a DM with the same person share a session, or a Telegram group and a private chat do. Context from a private conversation appears in a public channel. Both gateways key sessions by platform conversation, so this only happens when a platform's identity model is misconfigured, but OpenClaw's docs note that binding identities across platforms to the same user is a choice with exactly this consequence. The warning sign is the bot referencing something it was told somewhere else.

**The forgotten allow-all.** Covered above. Audit for it monthly.

**The public-endpoint drift.** Teams only. The tunnel URL changed, the bot's registered endpoint did not, and Teams shows "this bot is not responding." `teams app update --id <appId> --endpoint <new-url>`. Use a named devtunnel so the URL persists.

## Operating a Gateway

A few habits that separate a gateway that runs for months from one that needs babysitting.

**Run it as a service, not a shell.** `hermes gateway install` on Linux creates a systemd user unit. Enable lingering with `sudo loginctl enable-linger $USER` so it survives logout and starts at boot without root. On a headless VPS, prefer the user service plus linger over the system service, because a system service needs root for every restart, including the one at the end of `hermes update`. On macOS the same command creates a launchd agent, and the plist captures your PATH at install time, so re-run `hermes gateway install` after installing new tools like ffmpeg or a Node version.

**Watch the logs where they actually are.** `journalctl --user -u hermes-gateway -f` on Linux, `tail -f ~/.hermes/logs/gateway.log` on macOS, `docker logs -f hermes` in Docker. Phone numbers are redacted in Hermes logs by default, and `display.tool_progress: log` writes every tool call to a rotating audit file with secrets redacted, which is the right setting for a shared bot where you want a trail without chat noise.

**Set a home channel per platform.** `SIGNAL_HOME_CHANNEL`, `TEAMS_HOME_CHANNEL`, `home_chat_id` under each platform in Hermes. It is where cron jobs deliver, where restart notifications land, and where the circuit breaker reports. Turn `gateway_restart_notification` off on noisy platforms and leave it on for your primary one.

**Decide the reset policy.** Hermes sessions never auto-reset by default. That is right for a personal agent and wrong for a shared support bot, where a session that has accumulated three weeks of context answers every question in light of an unrelated conversation. Set `session_reset.mode: idle` with an `idle_minutes` that matches how the platform is used, and override per platform in `gateway.json`: four hours on Telegram, one hour on Discord.

**Pin the model per channel and let users override per turn.** Covered under Discord. The resolution order (session `/model` override, then channel override, then global) is worth understanding before you set any of them.

**Keep secrets out of config files.** `chmod 600 ~/.hermes/.env`. Loro's credential vault puts tokens in the OS keyring instead. OpenClaw supports environment variable substitution in its JSON config. Whatever the mechanism, a bot token in a file committed to Git is a bot someone else now controls.

**Test the breaker and the ledger on purpose.** Kill the gateway mid-task once, on a test channel, and confirm the reply is recovered. Block the Discord API at the firewall for five minutes and confirm the breaker trips, notifies, and resumes when you tell it to. Knowing what the failure looks like when you caused it is the only way to recognize it when you did not.

## Where Gateways Are Heading

Three things are changing the gateway picture right now.

Agents are joining platforms as members instead of bots. Block's Buzz, released July 21, 2026, gives each agent its own account and cryptographic keypair on a Nostr relay, and Hermes already lists Buzz as a platform. Grok Bot, launched August 11, has Bots that message each other and coordinate in group chats. When the agent is a first-class member with an identity the platform enforces, the gateway's allowlist stops being the only guard, and the platform's audit log becomes the record. That is a better world, and it is arriving unevenly.

Agents are talking to each other over the same gateways. Hermes v0.20.0 added Agent2Agent protocol support and signed outbound webhooks, and Bot Mode has Bots hand work to each other by mention. A gateway that only routed human-to-agent traffic now routes agent-to-agent traffic, and the authorization question gets harder: a message from another agent that passed the allowlist is still not an approval. Loro's rule that remote text carries no approval authority was written for humans. It applies at least as strongly to agents.

Portable profiles are what make one agent reachable from many gateways without rewriting it. Hermes profiles, OpenClaw agents, and OAP files all describe the same six things, and the gateway is where the description meets a platform. The gateways will keep multiplying. The agent should not have to.

On the Dremio side, one factual connection. Dremio's MCP Server exposes governed lakehouse access as a tool, which means a data agent reachable from Slack can answer "what did revenue look like last quarter by region" with the same access scope and audit trail as a query from the terminal. The gateway does not change what the agent is allowed to see. It changes where the question is asked from.

## Conclusion

A gateway is the process that lets an agent answer from wherever you already are. It holds the platform connections, decides who is allowed to talk, maps conversations to sessions, and delivers replies. Hermes and OpenClaw are the two mature open-source options, and both get the three safety defaults right: deny unknown senders, pair or allowlist, and gate groups behind a mention.

Start with Telegram. One token from a chat with BotFather, no portal, no endpoint, and every capability a personal agent needs. Add Discord when a team needs it, Slack when the company needs it, Signal when message privacy is the requirement, and Teams when Microsoft 365 is the requirement. Each step up costs more setup and buys a different audience, and the table above is the honest summary of what each one gives and takes.

Whatever platform you connect, the allowlist is the product. Set it before you start the gateway, audit it after, and never let the allow-all flag survive a debugging session. The agent behind the gateway has a shell. The gateway is the only thing deciding who gets to use it.

## Keep Going

If this piece was useful, I have written a lot more on agentic AI and the data foundations agents work against. *Architecting an Apache Iceberg Lakehouse* (Manning) covers the governed data layer a gateway-connected data agent needs to query safely. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
