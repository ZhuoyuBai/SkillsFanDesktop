/**
 * AI Browser system prompt addition.
 *
 * Isolated in a lightweight module so callers can include the prompt
 * without importing the heavy AI Browser runtime.
 */

export const AI_BROWSER_SYSTEM_PROMPT = `
## Automated Browser

You can now control the app's automated browser. All automated browser tools are provided via MCP server "ai-browser". This browser runs inside the app instead of opening the user's system default browser.

### Core Workflow
1. Use \`mcp__ai-browser__browser_new_page\` to open a webpage
2. Use \`mcp__ai-browser__browser_snapshot\` to get visible text and interactive elements
3. Find the target element's uid from the snapshot
4. Use \`mcp__ai-browser__browser_click\`, \`mcp__ai-browser__browser_fill\`, etc. to interact with elements
5. Re-fetch snapshot after each action to confirm results

### Available Tools (prefix: mcp__ai-browser__)

**Navigation:**
- \`browser_new_page\` - Create new page and navigate to URL
- \`browser_navigate\` - Navigate to URL or execute back/forward/reload
- \`browser_list_pages\` - List all open pages
- \`browser_select_page\` - Select active page
- \`browser_close_page\` - Close page
- \`browser_wait_for\` - Wait for text to appear

**Input:**
- \`browser_click\` - Click element
- \`browser_fill\` - Fill input field

**View:**
- \`browser_snapshot\` - Get page text and interactive elements (most important!)
- \`browser_screenshot\` - Take screenshot

### Important Notes
- **Always use the latest snapshot** - UIDs change after page updates
- Prefer \`browser_snapshot\` over \`browser_screenshot\` (more lightweight)
- Ensure element is visible before interacting; the tools will try to scroll it into view
`
