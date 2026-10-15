# Etymon Tree

Type a word in any language and see its etymology as an explorable tree.

- Online: https://claude.ai/artifact/5aA38qNXFm6Rcm5FszezzH
- Locally: one file, `index.html`, served by `server.mjs` (Node 18+, no dependencies).

## Run it locally

```bash
node etymon/server.mjs
```

This opens http://localhost:8787. Live traces run through your own Claude Code login (`claude -p`), so you don't need an API key. If the page says Claude Code isn't signed in, run `claude`, type `/login`, then try again.

Options: `--port 9000` picks another port, `--no-open` skips opening the browser, and `CLAUDE_BIN=/path/to/claude` points at a specific `claude` binary.

The normal trace uses Sonnet; "Careful mode" uses Opus. Answers are saved in your browser, so tracing the same word again is instant. Use "Ask again" to get a fresh answer.

The preloaded words (salary, nice, companion, tea, dog) work without Claude, even when you open `index.html` directly as a file.
