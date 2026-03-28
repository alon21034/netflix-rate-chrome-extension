Read the task assigned to this workspace from .context/.sprint.json (task id: 2).
Your sprint: Make extension testable on laptop
Your task: Write TESTING.md

Full task description:
Create TESTING.md at repo root with: Prerequisites (Node.js 18+, Chrome), Build steps (npm install && npm run build), Load in Chrome (chrome://extensions, Developer mode, Load unpacked, select dist/), Get OMDb API key (sign up at omdbapi.com/apikey.aspx, free tier 1000 req/day), Configure (click extension icon, paste key, Save), Test (go to netflix.com, hover title cards, verify badges), What to check (movies show IMDb + RT, TV shows IMDb only, cache deduplicates API calls), Run tests (npm run test:integration). Keep it short, no overdesign.

Instructions:
1. Read .context/.sprint.json to understand the full sprint context and what other agents are working on.
2. First, show the user a short task brief:
   - sprint topic
   - task id and title
   - full description
   - current branch
3. Ask for explicit approval before implementation:
   "Approve start implementation for task 2? (yes/no)"
4. Do NOT implement anything until the user clearly approves.
5. After approval, implement only this task's scope.
6. When implementation is complete, update the task status to "review" using a lockdir for safe concurrent access:
   while ! mkdir .context/.sprint.lockdir 2>/dev/null; do sleep 0.2; done; jq --argjson id 2 '(.tasks[] | select(.id == $id)).status = "review"' .context/.sprint.json > .context/.sprint.json.tmp && mv .context/.sprint.json.tmp .context/.sprint.json; rmdir .context/.sprint.lockdir; sprint-board .context/.sprint.json >/dev/null 2>&1 || ./bin/sprint-board .context/.sprint.json >/dev/null 2>&1
7. Summarize what you changed and why.
8. Do NOT merge or create a PR — the human reviewer will run sprint-finish when ready to close the sprint.
