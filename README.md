# Cooking Creator Studio

Private V1 foundation for the AI Cooking Creator App. This project is separate from the App Market/MV and GKworks projects.

## Included in the current V1 prototype
- Responsive creator dashboard
- Recipe intake for recipe name, optional HTTP(S) source URL, and notes
- Six-scene editable tutorial planner
- Recipe-quality checklist for quantities, timings, food safety, and nutrition
- Browser-local draft restore and autosave using localStorage
- Markdown and JSON draft export
- Delete action for a selected draft
- Source URLs are validated as HTTP or HTTPS before being saved

## Run locally
Requires Node.js 20.9+ and npm.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Important limitations
This is still a prototype, not the finished AI video-production system. Local drafts are stored in this browser on this device only. This is **not** owner authentication, encrypted storage, cloud backup, or multi-device sync. Clearing browser storage can delete drafts, so export important work.

The app does not yet inspect or transcribe linked videos, verify recipes against external sources, calculate nutrition, perform actual food-safety checks, generate the chef's voice/video, render a finished video, connect social accounts, schedule/publish posts, or provide analytics. Source URLs are not fetched or analyzed. The checklist and script/scene plan are not completed safety or nutrition reviews. Exports are drafts and must not be treated as published posts.

## Next
- Build a structured recipe editor for servings, ingredients, units, and ordered steps
- Generate a deterministic script/scene outline from saved recipe details
- Add tests for draft validation, persistence, and exports; run lint, type-check, and production build
- Review security and owner-only access before any shared deployment or real database
- Later, evaluate permitted source analysis, nutrition evidence, character/video production and official publishing connections

## Cost and privacy
No API keys or paid services are required for the current prototype. Check hosting, AI, video, and platform integration terms before enabling them; free tiers can change. Keep the repository private and never commit credentials or private character/background assets. Do not add a paid service or card requirement without explicit approval.
