## Tickets system (v1) — deploy checklist (EC2)

### 1) Supabase DB migration
- Open Supabase → SQL editor.
- Run `migrations/tickets_v1.sql`.

### 2) Backend env vars (Cloudinary)
Set these on the **backend** (never in frontend):

```bash
export CLOUDINARY_CLOUD_NAME="..."
export CLOUDINARY_API_KEY="..."
export CLOUDINARY_API_SECRET="..."
```

Where to set them:
- If you run backend with `pm2`, add them to your `ecosystem.config.js` `env` block (recommended) and restart.
- Or set them in your shell/session where the backend starts.

### 3) Restart backend
If you use `pm2`:

```bash
pm2 restart all
pm2 logs --lines 200
```

### 4) Frontend build + restart nginx
From the frontend folder on EC2:

```bash
npm ci
npm run build
sudo systemctl restart nginx
```

### 5) Verification
- Open `/tickets`
- Create a ticket without attachments (should show in Not started)
- Create a ticket with attachments (uploads should succeed, ticket stores `secure_url` + `public_id`)
- Assign a ticket to your email (sidebar “Tickets” badge should increment)

