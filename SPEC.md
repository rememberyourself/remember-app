# Remember — Men's Work Check-in App

## Overview
A mobile-first PWA for men's coaching check-ins. Built for Oliver Rust's coaching practice (Remember Yourself).

## V1 Features

### Client Side
- **Daily Check-in:** Video (primary), Audio, or Text
- **Daily Tracking (1-10 scale):**
  - ❤️ Heart Connection (Herzverbindung)
  - 🧠 Mind Activity (Gedankenkarussell)
  - 🧘 Presence (Präsenz im Moment)
  - 🔥 Energy Level
  - 🤝 Connection to Others
- **Daily Checkboxes:**
  - Meditation done
  - Breathwork done
  - Exercise/Sport
  - Time in Nature
- **Reminder:** Badge notification if not checked in by 12:00

### Coach Side (Dashboard)
- All clients at a glance (last check-in, streaks, status)
- View check-in history + watch videos
- Tracking data as timeline/graph visualization
- Client profiles

### Design
- **Theme:** Forest / Wald 🌲
- Dark greens, earth tones, natural feel
- Mobile-first, clean, masculine but warm
- Installable as PWA (homescreen icon)

### Tech Stack
- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** Node.js/Express or serverless
- **Storage:** Video uploads (local filesystem for MVP, S3 later)
- **Auth:** Simple invite-code system (coach invites clients)
- **PWA:** Service worker, manifest, offline-capable

### Brand
- **Name:** Remember
- **Connected to:** Remember Yourself (rememberyourself.ch)
- **Target:** Oliver's coaching clients (scalable later)

## Color Palette
- Primary: Deep forest green (#1a3a2a)
- Secondary: Warm earth (#8B7355)
- Accent: Soft amber/fire (#D4A574)
- Background: Dark (#0d1f17)
- Surface: (#152e21)
- Text: Warm white (#f0ebe3)
