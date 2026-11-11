# Protocol plugins

Protocol's public marketing tools for ChatGPT and Claude. The shared MCP server
reviews public service-business website content, checks crawl files, and
compares observable marketing signals across two or three websites. No account
linking is used by version 1.0.0.

- MCP: https://plugins.protocoltext.com/mcp
- Documentation: https://plugins.protocoltext.com
- Privacy: https://plugins.protocoltext.com/privacy
- Support: https://plugins.protocoltext.com/support

The `server/` folder contains the Cloudflare Worker. The `plugins/openai/` and
`plugins/claude/` folders contain the platform packages. Neither package embeds
credentials or starts local software.

The tools return bounded public observations, sources, timestamps and explicit
limitations. They do not measure actual search rankings, AI citations, traffic,
leads or revenue. They do not render JavaScript, test forms, access private
analytics, publish content, send messages, or change websites.

Run `npm ci`, `npm run typecheck` and `npm test` from `server/`. The production
configuration rejects private destinations, validates redirect targets, checks
crawl policies, limits request/response sizes and rate limits incoming calls.
Application logging is disabled.

Copyright 2026 Protocol. All rights reserved. Source is proprietary and
UNLICENSED; see each package's README and applicable Protocol/platform terms.
