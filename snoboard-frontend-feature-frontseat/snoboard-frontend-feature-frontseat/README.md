# SnoBoard - Campaign Intelligence Platform

Professional influencer campaign management and analytics platform.

## Tech Stack

- Vite
- TypeScript
- React
- shadcn/ui
- Tailwind CSS
- Recharts
- Framer Motion
- Supabase

## Getting Started

```sh
# Install dependencies
npm install

# Start the development server
npm run dev
```

## Tickets system (v1)
- Route: `/tickets`
- Attachments: direct Cloudinary uploads using **backend-signed** params (no Cloudinary secrets in frontend).
- Backend env vars required: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- Deploy checklist: see `TICKETS_DEPLOY.md` at repo root.

## Build

```sh
npm run build
```
