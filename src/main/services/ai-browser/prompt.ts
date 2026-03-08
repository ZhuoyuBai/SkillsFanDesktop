/**
 * AI Browser system prompt addition.
 *
 * Isolated in a lightweight module so callers can include the prompt
 * without importing the heavy AI Browser runtime.
 */

export const AI_BROWSER_SYSTEM_PROMPT = `
## AI Browser

You can now control the user's real Chrome browser. All browser tools are provided via MCP server "ai-browser". The browser uses the user's actual Chrome with their login sessions and cookies preserved.

### Core Workflow
1. Use \`mcp__ai-browser__browser_new_page\` to open a webpage
2. Use \`mcp__ai-browser__browser_snapshot\` to get page content (accessibility tree)
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
- \`browser_fill_form\` - Batch fill form fields
- \`browser_hover\` - Hover over element
- \`browser_drag\` - Drag element
- \`browser_press_key\` - Press key (e.g., Enter, Tab)
- \`browser_upload_file\` - Upload file
- \`browser_handle_dialog\` - Handle dialog

**View:**
- \`browser_snapshot\` - Get page accessibility tree (most important!)
- \`browser_screenshot\` - Take screenshot
- \`browser_evaluate\` - Execute JavaScript

**Debug:**
- \`browser_console\` - View console messages
- \`browser_network_requests\` - View network requests

**Emulation:**
- \`browser_emulate\` - Emulate device/network
- \`browser_resize\` - Resize viewport

### Important Notes
- **Always use the latest snapshot** - UIDs change after page updates
- Prefer \`browser_snapshot\` over \`browser_screenshot\` (more lightweight)
- Use \`browser_fill_form\` for batch form filling (more efficient)
- Ensure element is visible before interacting, scroll if necessary
`
