# TASK: Fix AI Analysis + Add Push Badge Notifications

## Context
This is a PWA (React + Vite + Tailwind) deployed on Netlify with Supabase backend.
Live: https://rememberyourself-app.netlify.app

## Issue 1: AI Analysis Not Working

### Flow
1. Client submits check-in → `src/utils/api.js` `createCheckin()` 
2. Fire-and-forget POST to `/api/process-checkin-background`
3. Netlify redirect: `/api/*` → `/.netlify/functions/:splat`
4. `netlify/functions/process-checkin-background.mjs` downloads media from Supabase Storage, transcribes via OpenAI Whisper, analyzes via Anthropic Claude, saves `ai_analysis` back to checkins table

### What's Broken
- The function returns 202 (background function accepted) but AI analysis never appears in the UI
- Env vars are all set (ANTHROPIC_API_KEY, OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY)
- Model used: `claude-sonnet-4-20250514` — verify this is correct
- Possible issues:
  - Background function may be silently failing (no error visibility)
  - The client never polls/refreshes to see the analysis after it's saved
  - The function may time out on Netlify free tier

### Fix Approach
1. Add error logging/visibility to the function
2. Consider making it a regular (non-background) function since `createCheckin` does fire-and-forget anyway
3. Add polling or real-time subscription in the client to detect when analysis is ready
4. Test with a simple text check-in first

### Important: Rename to non-background
Rename `process-checkin-background.mjs` to `process-checkin.mjs` (remove `-background` suffix) to make it a regular synchronous Netlify function. Update the redirect in api.js too.
The client already does fire-and-forget, so it won't block. But the function will have better logging/debugging.

Actually, regular functions have 10s timeout on free tier which is too short for Whisper + Claude. Keep as background function BUT add better error handling.

## Issue 2: Push Badge Notifications (PWA)

### Goal
When a coach sends a response to a client's check-in, the client should see a badge/notification on their home screen (PWA installed on iPhone).

### Approach: Simple Polling + Badge API
iOS PWA support for Web Push is limited. Better approach:
1. **App Badge API** (`navigator.setAppBadge()`) — supported on iOS 16.4+
2. **Polling mechanism** — check for unread coach responses periodically
3. **Service Worker** — update badge count via periodic sync or visibility change

### Implementation
1. Add a `last_seen_response` timestamp to client's localStorage
2. On app load and periodic interval, check for new coach responses since `last_seen_response`
3. Use `navigator.setAppBadge(count)` to show badge
4. Clear badge when user views the response

### Files to Modify
- `public/sw.js` — add badge update logic
- `src/pages/ClientDashboard.jsx` or `src/App.jsx` — add polling for new responses
- `src/utils/api.js` — add function to check unread response count
- `netlify/functions/process-reply.mjs` — already sends Telegram notification, could also update a notification field

## Deploy
After changes:
```bash
npm run build
NETLIFY_AUTH_TOKEN=nfp_jV7BpX9EfvJG7cJWhyE9vjV5mcVPPBDNca13 \
NETLIFY_SITE_ID=e37bf44a-0939-4a64-846f-a96aa3b41758 \
npx netlify deploy --prod --dir=dist --functions=netlify/functions
```

## DO NOT change:
- Supabase schema (we can't migrate easily)
- Login flow
- Existing UI design/styling (forest greens + gold theme)

When completely finished, run this command to notify:
openclaw system event --text "Done: Fixed AI analysis + added push badge notifications for Remember App" --mode now
