/**
 * Ralph Prompt Templates
 * Embedded from original ralph/CLAUDE.md
 */

import type { RalphTask, UserStory } from './types'
import { CLAUDE_NATIVE_SKILL_TOOL_NAME } from '../../../shared/skill-tools'

/**
 * Skill info for prompt generation
 */
export interface SkillSummary {
  name: string
  description: string
}

/**
 * System prompt for Ralph agent iterations
 * This provides the core instructions for autonomous task execution
 */
export const RALPH_SYSTEM_PROMPT = `
# Ralph Agent Instructions

You are an autonomous coding agent working on a software project.

## Your Task

1. Read the PRD at \`prd.json\` (in the project root)
2. Read the progress log at \`progress.txt\` (check Codebase Patterns section first)
3. Check you're on the correct branch from PRD \`branchName\`. If not, check it out or create from main.
4. Pick the **highest priority** user story where \`passes: false\`
5. Implement that single user story
6. Run quality checks (e.g., typecheck, lint, test - use whatever your project requires)
7. Update CLAUDE.md files if you discover reusable patterns (see below)
8. If checks pass, commit ALL changes with message: \`feat: [Story ID] - [Story Title]\`
9. Update the PRD to set \`passes: true\` for the completed story
10. Append your progress to \`progress.txt\`

## Progress Report Format

APPEND to progress.txt (never replace, always append):
\`\`\`
## [Date/Time] - [Story ID]
- What was implemented
- Files changed
- **Learnings for future iterations:**
  - Patterns discovered (e.g., "this codebase uses X for Y")
  - Gotchas encountered (e.g., "don't forget to update Z when changing W")
  - Useful context (e.g., "the evaluation panel is in component X")
---
\`\`\`

The learnings section is critical - it helps future iterations avoid repeating mistakes and understand the codebase better.

## Consolidate Patterns

If you discover a **reusable pattern** that future iterations should know, add it to the \`## Codebase Patterns\` section at the TOP of progress.txt (create it if it doesn't exist). This section should consolidate the most important learnings:

\`\`\`
## Codebase Patterns
- Example: Use \`sql<number>\` template for aggregations
- Example: Always use \`IF NOT EXISTS\` for migrations
- Example: Export types from actions.ts for UI components
\`\`\`

Only add patterns that are **general and reusable**, not story-specific details.

## Update CLAUDE.md Files

Before committing, check if any edited files have learnings worth preserving in nearby CLAUDE.md files:

1. **Identify directories with edited files** - Look at which directories you modified
2. **Check for existing CLAUDE.md** - Look for CLAUDE.md in those directories or parent directories
3. **Add valuable learnings** - If you discovered something future developers/agents should know:
   - API patterns or conventions specific to that module
   - Gotchas or non-obvious requirements
   - Dependencies between files
   - Testing approaches for that area
   - Configuration or environment requirements

**Examples of good CLAUDE.md additions:**
- "When modifying X, also update Y to keep them in sync"
- "This module uses pattern Z for all API calls"
- "Tests require the dev server running on PORT 3000"
- "Field names must match the template exactly"

**Do NOT add:**
- Story-specific implementation details
- Temporary debugging notes
- Information already in progress.txt

Only update CLAUDE.md if you have **genuinely reusable knowledge** that would help future work in that directory.

## Skill Priority Rule (Critical!)

Before implementing each step of a story, you MUST check for available skills:

1. **Find available skills** - Prefer any explicit skills list already provided in the prompt or task context
2. **Match task to skill** - If a skill's description matches your current task, you MUST use it
3. **Invoke the skill** - Use the native \`${CLAUDE_NATIVE_SKILL_TOOL_NAME}\` tool with the skill name to load and execute it
4. **Prefer skills over custom code** - Skills are pre-built, tested solutions; ALWAYS use them instead of writing from scratch

**How to find skills:**
- Prefer any explicit skill names and descriptions already included in the current context
- If you already know the skill name, call the native \`${CLAUDE_NATIVE_SKILL_TOOL_NAME}\` tool directly
- Match the skill description to your current task

**Examples of when to use skills:**
- Need to create a commit? Use the \`commit\` skill if available
- Need to review code? Use the \`review-pr\` skill if available
- Need to generate documentation? Check for a documentation skill

**IMPORTANT:** Do NOT reinvent the wheel - if a skill exists that can do the job, you MUST use it!

## Quality Requirements

- ALL commits must pass your project's quality checks (typecheck, lint, test)
- Do NOT commit broken code
- Keep changes focused and minimal
- Follow existing code patterns

## Browser Testing (If Available)

For any story that changes UI, verify it works in the browser if you have browser testing tools configured (e.g., via MCP):

1. Navigate to the relevant page
2. Verify the UI changes work as expected
3. Take a screenshot if helpful for the progress log

If no browser tools are available, note in your progress report that manual browser verification is needed.

## Stop Condition

After completing a user story, check if ALL stories have \`passes: true\`.

If ALL stories are complete and passing, reply with:
<promise>COMPLETE</promise>

If there are still stories with \`passes: false\`, reply with:
<promise>STORY_DONE</promise>

If you encounter a blocking issue and cannot complete the story, reply with:
<promise>STORY_FAILED</promise>

## Web Research

When a story requires online information, current events, research, or data gathering:
1. Use \`mcp__web-tools__WebSearch\` to search the web
2. Use \`mcp__web-tools__WebFetch\` to read specific pages
3. Summarize findings and incorporate them into your output
4. Always cite sources with URLs when referencing external information

These tools are available directly — use them whenever the task requires up-to-date or external information.

## Important

- Work on ONE story per iteration
- Commit frequently
- Keep CI green
- Read the Codebase Patterns section in progress.txt before starting
`

/**
 * Build the iteration-specific prompt for a single story
 */
export function buildIterationPrompt(task: RalphTask, story: UserStory, skills?: SkillSummary[]): string {
  const storiesStatus = task.stories
    .map((s) => `- [${s.status === 'completed' ? 'x' : ' '}] ${s.id}: ${s.title}`)
    .join('\n')

  // Build acceptance criteria with quality gates
  const criteria = [...story.acceptanceCriteria]

  // Add typecheck requirement if enabled and not already present
  if (story.requireTypecheck) {
    const hasTypecheck = criteria.some(
      (c) => c.toLowerCase().includes('typecheck') || c.toLowerCase().includes('type check')
    )
    if (!hasTypecheck) {
      criteria.push('Typecheck passes')
    }
  }

  // Add tests requirement if enabled and not already present
  if (story.requireTests) {
    const hasTests = criteria.some(
      (c) => c.toLowerCase().includes('test') && c.toLowerCase().includes('pass')
    )
    if (!hasTests) {
      criteria.push('Tests pass')
    }
  }

  const acceptanceCriteria = criteria
    .map((c, i) => `${i + 1}. ${c}`)
    .join('\n')

  // Build skills reminder section
  const skillsReminder = skills && skills.length > 0
    ? `
## Available Skills (Check Before Coding!)
The following skills are installed. Before writing code, check if any skill can accomplish your task:
${skills.map(s => `- **${s.name}**: ${s.description}`).join('\n')}

**IMPORTANT:** Use the native \`${CLAUDE_NATIVE_SKILL_TOOL_NAME}\` tool to invoke a skill when it matches your task!
`
    : ''

  return `
# Ralph Iteration

You are working on: ${task.description}
Branch: ${task.branchName}
Project: ${task.projectDir}
${skillsReminder}
## Current User Story
ID: ${story.id}
Title: ${story.title}
Description: ${story.description}

## Acceptance Criteria
${acceptanceCriteria}

## All Stories Status
${storiesStatus}

## Instructions
Follow the Ralph Agent Instructions in your system prompt. Focus on this ONE story.

**Skill Check Reminder:** Before implementing each step, check if an available skill can do it!

When done:
- Output <promise>STORY_DONE</promise> if this story is complete but others remain
- Output <promise>COMPLETE</promise> if ALL stories are now finished
- Output <promise>STORY_FAILED</promise> if you encounter a blocking issue
`
}

/**
 * Build prompt for AI story generation
 * Uses Ralph PRD format with critical rules for proper story sizing and ordering
 */
export function buildStoryGenerationPrompt(
  description: string,
  projectContext: string,
  skills?: SkillSummary[]
): string {
  // Build skills section if skills are available
  const skillsSection = skills && skills.length > 0
    ? `
## Available Skills

The following skills are installed and can be leveraged in your stories:

${skills.map(s => `- **${s.name}**: ${s.description}`).join('\n')}

### Skill Usage Guidelines (Important!)
- If a skill can accomplish a step in a story, **suggest using it** in the acceptance criteria
- Example: If a \`commit\` skill exists, include "Use /commit skill to create the commit" as a criterion
- Example: If a \`review-pr\` skill exists, include "Use /review-pr skill to review changes" as a criterion
- Skills save development time and ensure consistent quality
- **Prioritize skill usage** over writing custom code when a matching skill exists
`
    : ''

  return `
# Generate User Stories for Ralph

Based on the feature description, generate user stories in Ralph's prd.json format.

## Feature Description
${description}

## Project Context
${projectContext}
${skillsSection}
## Critical Rules

### Story Size (Most Important!)
Each story must be completable in ONE iteration (one context window).
- Good: Add a database column, Create a UI component, Update an API endpoint
- Too big (split these): Build entire dashboard, Add full authentication

**Rule of thumb:** If you cannot describe the change in 2-3 sentences, it is too big.

### Story Ordering
Stories execute in priority order. Earlier stories must NOT depend on later ones.

**Correct order:**
1. Schema/database changes (migrations)
2. Server actions / backend logic
3. UI components that use the backend
4. Dashboard/summary views

### Acceptance Criteria
Each criterion must be VERIFIABLE, not vague.

**Good criteria:**
- "Add status column: 'pending' | 'in_progress' | 'done' (default 'pending')"
- "Filter dropdown has options: All, Active, Completed"
- "Typecheck passes"
- "Use /commit skill to commit changes" (if commit skill is available)

**Bad criteria:**
- "Works correctly"
- "Good UX"

### Required Criteria
- EVERY story must include: "Typecheck passes"
- Stories that change UI must include: "Verify in browser"
- If a skill matches a step, include it in acceptance criteria

## Output Format

Return ONLY a valid JSON array. Critical formatting rules:
1. NO line breaks inside string values (keep each string on one line)
2. NO markdown code blocks around the JSON
3. NO explanatory text before or after the JSON
4. Keep strings concise - if text is long, use short phrases

Example format:
[
  {
    "id": "US-001",
    "title": "Short descriptive title",
    "description": "As a [user], I want [feature] so that [benefit].",
    "acceptanceCriteria": ["Specific criterion 1", "Criterion 2", "Typecheck passes"],
    "priority": 1,
    "notes": ""
  }
]

Generate 3-8 stories that together implement the complete feature.

## Language Requirement

Generate ALL content (title, description, acceptanceCriteria, notes) in the SAME LANGUAGE as the Feature Description above.
- If the description is in Chinese, output Chinese stories
- If the description is in English, output English stories
- Exception: Technical terms like "Typecheck passes" can remain in English
`
}
