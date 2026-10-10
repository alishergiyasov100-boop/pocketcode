# PocketCode

Run a real coding agent from your phone. PocketCode wraps **Claude Code** in a small
daemon and serves a one-screen interface you open in the browser — no terminal, no logs,
plain language. A pixel pet lives on the screen while the agent works.

![three screens](docs/screens.png)

## Install

In Termux:

```sh
npm install -g github:alishergiyasov100-boop/pocketcode
pocketcode
```

The first run sets everything up: it checks node, installs Claude Code if it is missing,
installs `termux-api` so the agent survives the screen turning off, asks which folder to
work in and which engine to use, then starts.

Open **http://127.0.0.1:4848** and add it to your home screen — it runs standalone.

## Commands

| | |
|---|---|
| `pocketcode` | set up if needed, then run |
| `pocketcode setup` | change project, gateway or model |
| `pocketcode doctor` | show what is missing |
| `pocketcode widget` | home-screen shortcut via Termux:Widget |
| `pocketcode stop` | stop the daemon |

## Engines

By default it uses whatever your `claude` login uses. You can point it at any
Anthropic-compatible endpoint instead — your own gateway, a proxy, anything that answers
`POST /v1/messages`:

```json
{
  "baseUrl": "https://your-gateway.example",
  "token": "your-key",
  "model": "claude-sonnet-5"
}
```

Config lives in `~/.pocketcode/config.json`.

## How it works

```
browser  ──websocket──►  daemon  ──stream-json──►  claude -p
   ▲                        │                          │
   └── plain-language ──────┴──── normalised events ───┘
```

The daemon keeps **one long-lived** `claude` process per session using
`--input-format stream-json --output-format stream-json`, so a conversation is many turns
in one process rather than a cold start per message. Raw events are translated into
something a human reads: `Read src/store.py` becomes *Read store.py*, a `pytest` command
becomes *Ran the tests*.

No runtime dependencies. The WebSocket server is ~130 lines of plain Node.

## Status

Early prototype. The interface is real and the bridge drives a real agent on a real
repository. Rough edges are expected.
