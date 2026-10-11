# Cooking Creator Studio

Private V1 foundation for the AI Cooking Creator App. This project is separate from the App Market/MV and GKworks projects.

## Included in V1
- Responsive creator dashboard
- Recipe intake for recipe name, optional YouTube/Instagram/recipe URL, and notes
- Six-scene editable tutorial planner
- Recipe-quality checklist for quantities, timings, food safety, and nutrition
- Drafts held in browser memory for the current session

## Run locally
Requires Node.js 20.9+ and npm.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Not connected yet
This is a UI foundation, not a finished AI video-production system. It does not yet inspect or transcribe linked videos, verify recipes, calculate nutrition, generate voice/video, save drafts to a database, connect social accounts, schedule/publish posts, or provide analytics. Source URLs are not fetched by the app. The checklist is not a completed safety or nutrition review.

Next: persistent project storage; recipe/video research with citations and uncertainty flags; nutrition and safety verification; integration of the user's existing chef and kitchen assets; media rendering; publishing approval queue; and official social-platform connections. Keep API keys server-side and never commit secrets.

## Cost and privacy
No API keys or paid services are required for this starter. Check hosting, AI, video, and platform integration terms before enabling them; free tiers can change. Keep the repository private and never commit credentials.
