# Email-Automation-Using-Trigger.dev
Email Automation Using Trigger.dev is an AI-powered automation system that generates personalized user-specific email content and sends automated alerts for abandoned carts and product views. It analyzes user activity to create dynamic, behavior-based campaigns that improve engagement, retention, and conversions.

**Stack:** Trigger.dev v3 · OpenAI gpt-4o-mini · Groq Llama · Resend · TypeScript

---

## Overview

When a user views a product or abandons their cart, an event is dispatched to a single Trigger.dev entry-point task (`dispatch-email-task`). It routes to the correct handler, calls an LLM to generate personalised subject, headline, and body copy, injects it into a responsive HTML email template, and sends it via Resend — all automatically.

Key features:

- Single dispatcher pattern — one entry-point, two specialised task handlers
- AI copy generation with multi-provider fallback (OpenAI → Groq 70B → Groq 8B → hardcoded)
- Two dark-green responsive email templates (product view & abandoned cart)
- Automatic retry with exponential back-off
- Local test script — no backend or deployed app needed

---

## Project Structure

```
email-automation/
├── src/
│   └── trigger/
│       └── example.ts          # All Trigger.dev tasks
├── email-templates/
│   ├── product-view.html       # Product view email template
│   └── abandoned-cart.html     # Abandoned cart email template
├── test-trigger.mjs            # Local test script
├── trigger.config.ts           # Trigger.dev project config
├── .env                        # Your environment variables (never commit)
├── package.json
└── tsconfig.json
```

---

## Prerequisites

Make sure you have accounts and API keys ready for:

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **Trigger.dev account** — [trigger.dev](https://trigger.dev) (free tier works)
- **Resend account** — [resend.com](https://resend.com) (free tier: 100 emails/day)
- **OpenAI API key** — [platform.openai.com](https://platform.openai.com)
- **Groq API key** — [console.groq.com](https://console.groq.com) (free, used as fallback)

---

## Installation

### Step 1 — Clone the repository

```bash
git clone https://github.com/your-username/email-automation-trigger.git
cd email-automation-trigger
```

### Step 2 — Install dependencies

```bash
npm install
```

This installs `@trigger.dev/sdk`, `dotenv`, `typescript`, and their peer dependencies.

### Step 3 — Set up the .env file

```bash
cp _env .env
```

Then open `.env` and fill in every value. See the [Environment Variables](#environment-variables) section below.

### Step 4 — Place the email templates

```bash
mkdir -p email-templates
mv abandoned-cart.html email-templates/
mv product-view.html   email-templates/
```

### Step 5 — Place the task file

```bash
mkdir -p src/trigger
mv example.ts src/trigger/example.ts
```

### Step 6 — Update trigger.config.ts

Open `trigger.config.ts` and replace `"Project Reference"` with your actual Trigger.dev project ref (found in the dashboard under **Project Settings → Project ref**):

```ts
import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "proj_your_actual_ref_here",  // ← replace this
  dirs: ["./src/trigger"],
  maxDuration: 300,
});
```

---

## Environment Variables

Create a `.env` file in the project root. **Never commit this file to Git** — add it to `.gitignore`.

```env
# ── Email Sending ──────────────────────────────────────────
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
FROM_EMAIL=hello@yourstore.com

# ── Trigger.dev ────────────────────────────────────────────
TRIGGER_SECRET_KEY=tr_dev_xxxxxxxxxxxxxxxxxxxx

# ── AI Providers (OpenAI primary, Groq fallback) ───────────
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx

# ── Store Info ─────────────────────────────────────────────
STORE_NAME=MyStore
STORE_URL=https://yourstore.com
UNSUBSCRIBE_URL=https://yourstore.com/unsubscribe

# ── Email Background Image ─────────────────────────────────
EMAIL_BG_IMAGE_URL=https://i.imgur.com/7wzKdu3.jpeg
```

### Where to find each key

| Variable | Where to get it |
|---|---|
| `RESEND_API_KEY` | Resend Dashboard → API Keys → Create API Key |
| `FROM_EMAIL` | A domain verified in Resend. For dev use `onboarding@resend.dev` |
| `TRIGGER_SECRET_KEY` | Trigger.dev Dashboard → Your Project → API Keys → Secret key |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) → API Keys |
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) → API Keys (free) |
| `STORE_NAME` | Any display name shown in the email header |
| `STORE_URL` | Your store homepage URL |
| `UNSUBSCRIBE_URL` | Your unsubscribe page URL |
| `EMAIL_BG_IMAGE_URL` | Any public image URL. The default works out of the box |

> **Note on FROM_EMAIL during development:** Resend requires domain verification for custom sender addresses. While testing, set `FROM_EMAIL=onboarding@resend.dev` — this bypasses verification and sends only to your Resend account's email address.

---

## Running the Project

### 1. Start the dev worker

In your terminal, start the Trigger.dev local development worker. This connects your machine to the Trigger.dev cloud so tasks execute locally:

```bash
npx trigger.dev@latest dev
```

You should see:

```
✔  Connected to Trigger.dev
✔  Watching src/trigger for changes
✔  Tasks registered: dispatch-email-task, product-view-email, abandoned-cart-email
```

Leave this terminal running.

### 2. Configure the test script

Open `test-trigger.mjs` and fill in your details at the top of the file:

```js
const YOUR_EMAIL     = "you@example.com";       // ← your real email address
const YOUR_NAME      = "Alex";                   // ← personalisation name for the copy
const YOUR_STORE_URL = "https://yourstore.com";  // ← your store URL
```

Then choose which test to run:

```js
const TEST_MODE = "both"; // "product_view" | "abandoned_cart" | "both"
```

### 3. Run the test script

Open a **second terminal** and run:

```bash
node test-trigger.mjs
```

Expected output:

```
─────────────────────────────────────────────────
  Trigger.dev Email Automation — Local Test
─────────────────────────────────────────────────
  Mode : both
  To   : you@example.com
─────────────────────────────────────────────────

🚀  Triggering: PRODUCT_VIEW → dispatch-email-task
    To     : you@example.com
    Product: Premium Wireless Headphones

✅  Task triggered!
    Run ID: run_xxxxxxxxxxxx
    → Open Trigger.dev dashboard → Runs to watch live execution
```

Check your inbox — the email should arrive within a few seconds. You can also watch each step execute live in the Trigger.dev dashboard under **Runs**.

### Deploy to production

When you're ready to go live:

```bash
npx trigger.dev@latest deploy
```

Use your live secret key (`tr_live_xxx`) in your production environment and a verified custom domain for `FROM_EMAIL`.

---

## How It Works

### Task architecture

The system registers three Trigger.dev tasks:

**`dispatch-email-task`** (entry-point)
Accepts any event payload and routes by `event_type` to the correct sub-task. This is the only task your backend needs to call.

**`product-view-email`**
Handles `PRODUCT_VIEW` events:
1. Validates the email address
2. Waits 3 seconds to debounce rapid page navigations
3. Calls the LLM provider chain to generate subject, headline, subline, and body copy
4. Loads `email-templates/product-view.html` from disk
5. Injects all tokens and resolves conditional blocks
6. Sends via Resend

**`abandoned-cart-email`**
Handles `abandoned_cart_item` events:
1. Validates email and cart contents
2. Calls LLM provider chain with full cart context
3. Loads `email-templates/abandoned-cart.html`
4. Builds cart items HTML (email-safe table layout)
5. Injects all tokens
6. Sends via Resend

### AI provider fallback chain

```
OpenAI gpt-4o-mini
        ↓ (on failure)
Groq llama-3.3-70b-versatile
        ↓ (on failure)
Groq llama-3.1-8b-instant
        ↓ (on failure)
Hardcoded fallback copy  ← email still sends
```

### Triggering from your backend

```ts
import { tasks } from "@trigger.dev/sdk/v3";

// Product view event
await tasks.trigger("dispatch-email-task", {
  event_type: "PRODUCT_VIEW",
  email: "customer@example.com",
  name: "Sarah",
  session_id: "sess_abc123",
  product: {
    name: "Wireless Headphones",
    price: "$89.99",
    category: "Electronics",
    product_url: "https://yourstore.com/products/headphones",
  },
  page_url: "https://yourstore.com/products/headphones",
});

// Abandoned cart event
await tasks.trigger("dispatch-email-task", {
  event_type: "abandoned_cart_item",
  email: "customer@example.com",
  name: "Sarah",
  session_id: "sess_abc123",
  cart_items: [
    {
      product_name: "Wireless Headphones",
      product_price: "$89.99",
      product_url: "https://yourstore.com/products/headphones",
      timestamp: new Date().toISOString(),
    },
  ],
});
```

---

## Troubleshooting

**Task not found / `dispatch-email-task` not registered**
Make sure the dev worker is running (`npx trigger.dev@latest dev`) and the task file is at `src/trigger/example.ts`.

**`TRIGGER_SECRET_KEY` error**
Check that `.env` is in the project root and contains the correct key. The dev key starts with `tr_dev_`.

**Resend returns 403 / domain not verified**
Set `FROM_EMAIL=onboarding@resend.dev` during development — it bypasses domain verification and sends only to your Resend account email.

**Email not arriving**
- Check your spam / junk folder
- Open the Trigger.dev dashboard → Runs → click your run → check the logs
- Verify `RESEND_API_KEY` is correct in `.env`

**All LLM providers failed**
The system falls back to hardcoded copy — the email still sends. Check that `OPENAI_API_KEY` and `GROQ_API_KEY` are valid and have remaining quota.

**`TRIGGER_PROJECT_REF` mismatch**
The project ref in `trigger.config.ts` must exactly match the one in your Trigger.dev dashboard under Project Settings.

---

## License

MIT — see [LICENSE](./LICENSE) for details.

**Author:** Aciful Islam Khan Swopnile

Built with [Trigger.dev](https://trigger.dev) · [Resend](https://resend.com) · [OpenAI](https://openai.com) · [Groq](https://groq.com)