# mcp-demo

A minimal Model Context Protocol (MCP) server in Python, plus three ways to test it.

## Setup

```bash
python3 -m venv .venv
.venv/bin/pip install "mcp[cli]"
```

## Files

- `server.py` — the server: two tools (`add`, `echo`), one resource (`config://version`), one prompt (`summarize`). Speaks stdio.
- `test_client.py` — a Python client that spawns the server and calls everything.

## Test it

**1. Programmatic client (fastest loop):**

```bash
.venv/bin/python test_client.py
```

**2. MCP Inspector (browser UI, needs Node):**

```bash
.venv/bin/mcp dev server.py
```

**3. Raw JSON-RPC over stdin (see the actual protocol):**

```bash
(printf '%s\n' \
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"raw","version":"0"}}}' \
'{"jsonrpc":"2.0","method":"notifications/initialized"}' \
'{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"add","arguments":{"a":40,"b":2}}}'; sleep 1) \
| .venv/bin/python server.py
```

**4. From Claude Code:** the server is registered in `../.mcp.json`. Start `claude` in the repo root, approve the project server when prompted, then ask it to "use the demo add tool to add 40 and 2".

## Notes

- This uses `mcp` 2.x. The old `FastMCP` class is now `MCPServer` (`from mcp.server.mcpserver import MCPServer`), and result fields are snake_case (`init.server_info`, not `init.serverInfo`).
- Never `print()` to stdout in a stdio server; stdout is the protocol channel. Log to stderr instead.
- To expose it over HTTP instead: `mcp.run(transport="streamable-http")`.
