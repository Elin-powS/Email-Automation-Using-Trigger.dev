/**
 * Trigger.dev Email Automation Tasks
 * ─────────────────────────────────────────────────────────────────────────────
 * Routes events → OpenAI copy generation → HTML template injection → Resend
 *
 * TEMPLATES (separate files, loaded at runtime):
 *   email-templates/product-view.html
 *   email-templates/abandoned-cart.html
 *
 * TASKS:
 *   dispatchEmailTask      — single entry-point; routes by event_type
 *   sendProductViewEmail   — PRODUCT_VIEW event
 *   sendAbandonedCartEmail — abandoned_cart_item event
 *
 * ENV VARS REQUIRED:
 *   RESEND_API_KEY       — resend.com
 *   OPENAI_API_KEY       — openai.com
 *   GROQ_API_KEY         — console.groq.com (fallback models)
 *   TRIGGER_SECRET_KEY   — trigger.dev dashboard
 *   FROM_EMAIL           — verified sender (e.g. hello@yourstore.com)
 *   STORE_NAME           — display name in emails (e.g. "MyStore")
 *   STORE_URL            — your store homepage
 *   UNSUBSCRIBE_URL      — unsubscribe link
 *   EMAIL_BG_IMAGE_URL   — publicly hosted background_img.png URL
 */

import { logger, task, wait } from "@trigger.dev/sdk/v3";
import fs from "fs/promises";
import path from "path";

// ─── TYPES ────────────────────────────────────────────────────────────────────

/** Shared event fields from IntentTracker */
interface BaseEventContext {
  event_type: "PRODUCT_VIEW" | "abandoned_cart_item";
  email: string;
  name?: string;
  session_id: string;
  device_type?: "mobile" | "desktop";
  search_query?: string;
}

export interface ProductViewPayload extends BaseEventContext {
  event_type: "PRODUCT_VIEW";
  product: {
    name: string;
    price: string;
    category?: string;
    speciality?: string; // "Sale" | "New" | etc.
    discount?: string;   // e.g. "20% OFF"
    image_url?: string;
    product_url?: string;
    description?: string;
    quantity?: number;
    meta?: Record<string, string>;
  };
  page_url: string;
}

export interface AbandonedCartPayload extends BaseEventContext {
  event_type: "abandoned_cart_item";
  cart_items: Array<{
    product_name: string;
    product_price: string;
    product_category?: string;
    product_speciality?: string;
    product_discount?: string;
    product_image?: string;
    product_url?: string;
    description?: string;
    quantity?: number;
    timestamp: string;
    abandoned_after_hours?: number;
  }>;
}

/** Dispatcher payload — accepts either event shape */
export type DispatchPayload = ProductViewPayload | AbandonedCartPayload;

// ─── HELPERS: Template loader ─────────────────────────────────────────────────

const TEMPLATE_DIR = path.resolve(process.cwd(), "email-templates");

async function loadTemplate(name: "product-view" | "abandoned-cart"): Promise<string> {
  const filePath = path.join(TEMPLATE_DIR, `${name}.html`);
  return fs.readFile(filePath, "utf-8");
}

/** Simple {{KEY}} placeholder replacement */
function inject(template: string, tokens: Record<string, string>): string {
  return Object.entries(tokens).reduce(
    (html, [key, value]) => html.replaceAll(`{{${key}}}`, value ?? ""),
    template
  );
}

/**
 * Resolves {{#if KEY}}...{{else}}...{{/if}} and {{#if KEY}}...{{/if}} blocks.
 * Must be called AFTER inject() so token values are already in place.
 */
function resolveConditionals(html: string, flags: Record<string, boolean>): string {
  // With else branch
  html = html.replace(
    /\{\{#if (\w+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match: string, key: string, ifContent: string, elseContent: string): string =>
      flags[key] ? ifContent : elseContent
  );
  // Without else branch
  html = html.replace(
    /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match: string, key: string, content: string): string =>
      flags[key] ? content : ""
  );
  return html;
}

// ─── HELPERS: OpenAI copy generator ──────────────────────────────────────────

interface OpenAICopyResult {
  subject: string;
  headline: string;
  subline: string;
  body: string; // 2-3 sentences, HTML allowed (<strong>, <em>)
}

// ─── HELPERS: LLM provider abstraction ───────────────────────────────────────

interface LLMProvider {
  label: string;
  call: (systemPrompt: string, userPrompt: string) => Promise<string>;
}

/**
 * Builds the ordered list of LLM providers to try:
 *   1. OpenAI gpt-4o-mini
 *   2. Groq  llama-3.3-70b
 *   3. Groq  llama-3.1-8b
 */
function buildProviderChain(): LLMProvider[] {
  // ── Shared Groq caller ──
  const groqCall = (model: string) =>
    async (systemPrompt: string, userPrompt: string): Promise<string> => {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.8,
          max_tokens: 400,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Groq API error ${response.status} (${model}): ${err}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error(`Groq (${model}) returned empty content`);
      return content;
    };

  return [
    // ── 1. Primary: OpenAI ──
    {
      label: "OpenAI gpt-4o-mini",
      call: async (systemPrompt, userPrompt) => {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            temperature: 0.8,
            max_tokens: 400,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          }),
        });

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`OpenAI API error ${response.status}: ${err}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error("OpenAI returned empty content");
        return content;
      },
    },

    // ── 2. Fallback: Groq llama-3.3-70b ──
    {
      label: "Groq llama-3.3-70b",
      call: groqCall("llama-3.3-70b-versatile"),
    },

    // ── 3. Last resort: Groq llama-3.1-8b ──
    {
      label: "Groq llama-3.1-8b",
      call: groqCall("llama-3.1-8b-instant"),
    },
  ];
}

async function generateEmailCopy(
  eventType: "PRODUCT_VIEW" | "abandoned_cart_item",
  context: {
    name?: string;
    product_name?: string;
    category?: string;
    speciality?: string;
    discount?: string;
    description?: string;
    quantity?: number;
    search_query?: string;
    device_type?: string;
    cart_items?: AbandonedCartPayload["cart_items"];
  },
): Promise<OpenAICopyResult> {
  // ── System prompt: role + output contract only, no rigid category rules ──
  const systemPrompt = `You are a world-class e-commerce email copywriter known for writing copy that feels personal, warm, and impossible to ignore.

Output contract:
- Return ONLY a JSON object matching this exact schema — no prose, no markdown:
  { "subject": string, "headline": string, "subline": string, "body": string }
- subject: max 60 chars, no emoji, punchy and specific to the product/situation
- headline: max 8 words, bold emotional hook
- subline: max 12 words, adds curiosity or urgency to the headline
- body: exactly 2-3 sentences. Use <strong> for 1-2 key phrases. Feel like a smart friend, not a brand.

Golden rules:
- Never be generic. Every word should feel like it was written for this exact person and product.
- If a discount exists, open with it — that's the hook.
- If stock is low, weave in natural scarcity (don't shout it).
- If a search query exists, mirror the customer's own language back to them.
- Match the emotional register of the product category — infer it from the category name and description.
- Never use the phrases: "just a reminder", "don't miss out", "act now", "limited time offer".`;

  // ── User prompts: split cleanly by event type ──
  let userPrompt: string;

  if (eventType === "PRODUCT_VIEW") {
    const name = context.name ?? "there";
    const hasDiscount = !!context.discount;
    const lowStock = context.quantity != null && context.quantity <= 5;
    const searchContext = context.search_query
      ? `They searched for "${context.search_query}" before landing on this product.`
      : "They browsed directly to this product.";

    userPrompt = `Write a PRODUCT VIEW reminder email for a customer who looked at a product but didn't buy.

CUSTOMER: ${name}
PRODUCT: ${context.product_name}
CATEGORY: ${context.category ?? "general"}
DESCRIPTION: ${context.description ?? "not provided"}
PRICE SIGNAL: ${hasDiscount ? `On sale — ${context.discount}` : "Regular price"}
STOCK: ${lowStock ? `Only ${context.quantity} left` : "In stock"}
SEARCH CONTEXT: ${searchContext}
DEVICE: ${context.device_type ?? "unknown"}

Tone guidance:
- Remind them what they saw without being pushy.
- If there's a discount, lead with the value.
- If stock is low, mention it naturally once.
- Reference their search query if it reveals intent (e.g. they searched "running shoes" → speak to that need).
- Keep it warm and specific — they should feel like you noticed them, not tracked them.`;
  } else {
    // Abandoned cart — build rich context from cart items
    const items = context.cart_items ?? [];
    const itemSummary = items
      .map((i) => {
        const parts = [`"${i.product_name}" (${i.product_price})`];
        if (i.product_category) parts.push(`category: ${i.product_category}`);
        if (i.product_discount) parts.push(`discount: ${i.product_discount}`);
        if (i.description) parts.push(`desc: ${i.description}`);
        return parts.join(", ");
      })
      .join("\n  - ");

    const categories = [
      ...new Set(items.map((i) => i.product_category).filter(Boolean)),
    ].join(", ");
    const hasAnyDiscount = items.some((i) => i.product_discount);
    const totalValue = items.length;

    userPrompt = `Write an ABANDONED CART recovery email for a customer who added items to their cart but left without buying.

CUSTOMER: ${context.name ?? "there"}
CART ITEMS (${totalValue} total):
  - ${itemSummary}
CATEGORIES: ${categories || "mixed"}
ANY DISCOUNTS: ${hasAnyDiscount ? "yes — at least one item has a discount" : "no"}
DEVICE: ${context.device_type ?? "unknown"}

Tone guidance:
- Feel like a friend texting "hey, you left something good behind."
- Reference the actual product names — make it feel personal, not automated.
- If there are multiple items, acknowledge the cart as a whole, not just one item.
- If any item has a discount, surface that as the reason to come back now.
- Create FOMO through specificity (these exact items), not hype words.
- Never guilt-trip. Make them excited to return, not obligated.`;
  }

  // ── Try each provider in order, falling back on any error ──
  const providers = buildProviderChain();
  let lastError: unknown;

  for (const provider of providers) {
    try {
      logger.log(`🤖 Trying LLM provider: ${provider.label}`);
      const content = await provider.call(systemPrompt, userPrompt);
      const parsed = JSON.parse(content) as OpenAICopyResult;
      logger.log(`✅ Copy generated via ${provider.label}`);
      return parsed;
    } catch (err) {
      logger.warn(`⚠️ Provider failed: ${provider.label}`, { error: String(err) });
      lastError = err;
      // continue to next provider
    }
  }

  // ── All providers exhausted — use hardcoded fallback ──
  logger.error("❌ All LLM providers failed — using hardcoded fallback", {
    lastError: String(lastError),
  });

  if (eventType === "PRODUCT_VIEW") {
    const product = context.product_name ?? "that product";
    return {
      subject: `You were looking at ${product}`,
      headline: "Still thinking it over?",
      subline: "It's still here — and so is the price.",
      body: `Hey <strong>${context.name ?? "there"}</strong>, you checked out <strong>${product}</strong> earlier. It's still available — pop back and take another look before it sells out.`,
    };
  } else {
    const firstItem = context.cart_items?.[0]?.product_name ?? "your items";
    return {
      subject: `Your cart is waiting — ${firstItem}`,
      headline: "You left something behind.",
      subline: "Your cart hasn't forgotten you.",
      body: `Hey <strong>${context.name ?? "there"}</strong>, you left <strong>${firstItem}</strong>${context.cart_items && context.cart_items.length > 1 ? ` and ${context.cart_items.length - 1} other item${context.cart_items.length > 2 ? "s" : ""}` : ""} in your cart. They're still in stock — finish what you started.`,
    };
  }
}

// ─── HELPERS: Resend sender ───────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.FROM_EMAIL ?? "noreply@yourstore.com",
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Resend API error ${res.status}: ${error}`);
  }

  return res.json();
}

// ─── HELPERS: Badge builder ───────────────────────────────────────────────────

// Email-safe badge builder — inline styles only, no CSS classes
function buildBadges(speciality?: string, discount?: string): {
  badgeSale: string;
  badgeNew: string;
  badgeDiscount: string;
} {
  const base = `display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:14px;
    font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:8px 18px;border-radius:5px;line-height: 1.4;`;
  const lc = speciality?.toLowerCase() ?? "";
  return {
    badgeSale: lc === "sale"
      ? `<span style="${base}background-color:#dc2626;color:#ffffff;">SALE</span>`
      : "",
    badgeNew: lc === "new"
      ? `<span style="${base}background-color:#07422c;color:#6ee7b7;border:1px solid #1a7a4a;">NEW</span>`
      : "",
    badgeDiscount: discount
      ? `<span style="${base}background-color:#1a1400;color:#fcd34d;border:1px solid #4a3a00;">${discount}</span>`
      : "",
  };
}

// Email-safe cart items — table-based, no flex/div layout
function buildCartItemsHTML(items: AbandonedCartPayload["cart_items"]): string {
  return items.map((item) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="margin-bottom:4px;border-bottom:1px solid #0f5233;padding-bottom:4px;">
      <tr>
        <!-- Thumbnail -->
        <td width="72" valign="middle" style="padding:12px 16px 12px 0;">
          ${item.product_image
            ? `<img src="${item.product_image}" alt="${item.product_name}"
                width="72" height="72"
                style="width:72px;height:72px;border-radius:10px;object-fit:cover;display:block;
                       border:1px solid #0f5233;" />`
            : `<table role="presentation" width="72" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" width="72" height="72"
                    style="width:72px;height:72px;background-color:#07422c;border-radius:10px;
                           font-size:28px;text-align:center;border:1px solid #0f5233;">
                    🛒
                  </td>
                </tr>
              </table>`
          }
        </td>
        <!-- Info -->
        <td valign="middle" style="padding:12px 0;">
          ${item.product_category
            ? `<p style="margin:0 0 3px;font-family:Arial,Helvetica,sans-serif;font-size:9px;
                font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#34d399;">${item.product_category}</p>`
            : ""}
          <p style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:16px;
                     font-weight:700;color:#d1fae5;line-height:1.2;">
            ${item.product_name}${item.product_discount
              ? ` <span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;
                    font-weight:700;color:#fcd34d;">(${item.product_discount})</span>`
              : ""}
          </p>
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;
                     font-weight:700;color:#6ee7b7;">${item.product_price}</p>
        </td>
        <!-- View button -->
        <td width="80" valign="middle" align="right" style="padding:12px 0 12px 12px;">
          ${item.product_url
            ? `<a href="${item.product_url}"
                style="display:inline-block;background-color:#07422c;color:#6ee7b7;
                       font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;
                       text-decoration:none;padding:8px 14px;border-radius:8px;
                       border:1px solid #1a7a4a;letter-spacing:0.5px;text-transform:uppercase;
                       white-space:nowrap;">
                View &rarr;
              </a>`
            : ""}
        </td>
      </tr>
    </table>`
  ).join("");
}

// ─── TASK: DISPATCHER (single entry-point) ────────────────────────────────────

/**
 * Single dispatcher task — call this from your backend with any tracker event.
 * It routes to the correct task based on event_type.
 *
 * Usage:
 *   await tasks.trigger("dispatch-email-task", trackerEventPayload);
 */
export const dispatchEmailTask = task({
  id: "dispatch-email-task",

  run: async (payload: DispatchPayload) => {
    logger.log("📨 Dispatching email task", {
      event_type: payload.event_type,
      session: payload.session_id,
    });

    if (payload.event_type === "PRODUCT_VIEW") {
      return sendProductViewEmail.triggerAndWait(payload as ProductViewPayload);
    }

    if (payload.event_type === "abandoned_cart_item") {
      return sendAbandonedCartEmail.triggerAndWait(payload as AbandonedCartPayload);
    }

    logger.warn("⚠️ Unknown event_type — skipping", { event_type: (payload as any).event_type });
    return { skipped: true, reason: "unknown_event_type" };
  },
});

// ─── TASK 1: PRODUCT VIEW EMAIL ───────────────────────────────────────────────

export const sendProductViewEmail = task({
  id: "product-view-email",
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1000 },

  run: async (payload: ProductViewPayload) => {
    logger.log("📬 Product view email triggered", {
      to: payload.email,
      product: payload.product.name,
      session: payload.session_id,
    });

    // Guard: valid email
    if (!payload.email?.includes("@")) {
      logger.warn("⚠️ Skipped — no valid email", { session_id: payload.session_id });
      return { skipped: true, reason: "no_email" };
    }

    // Small delay to avoid spamming on rapid navigations
    await wait.for({ seconds: 3 });

    // ── 1. Generate AI copy via provider chain ──
    logger.log("🤖 Generating email copy...");
    const copy = await generateEmailCopy("PRODUCT_VIEW", {
      name: payload.name,
      product_name: payload.product.name,
      category: payload.product.category,
      speciality: payload.product.speciality,
      discount: payload.product.discount,
      description: payload.product.description,
      quantity: payload.product.quantity,
      search_query: payload.search_query,
      device_type: payload.device_type,
    });

    // ── 2. Load HTML template ──
    const template = await loadTemplate("product-view");

    // ── 3. Build badge + specs HTML ──
    const { badgeSale, badgeNew, badgeDiscount } = buildBadges(
      payload.product.speciality,
      payload.product.discount
    );

    // Optional old-price / discount pill (if discount provided)
    const discountPillHTML = payload.product.discount
      ? `<span style="display:inline-block;background-color:#1f0505;color:#fca5a5;font-family:Arial,Helvetica,sans-serif;
                       font-size:16px;font-weight:700;padding:8px 17px;border-radius:20px;
                       border:1px solid #5c1010;letter-spacing:0.5px;">${payload.product.discount}</span>`
      : "";

    // ── 4. Inject tokens into template ──
    const injected = inject(template, {
      EMAIL_SUBJECT: copy.subject,
      EMAIL_HEADLINE: copy.headline,
      EMAIL_SUBLINE: copy.subline,
      AI_COPY_BODY: copy.body,

      STORE_NAME: process.env.STORE_NAME!,
      STORE_URL: process.env.STORE_URL!,
      UNSUBSCRIBE_URL: process.env.UNSUBSCRIBE_URL!,
      EMAIL_BG_IMAGE_URL: process.env.EMAIL_BG_IMAGE_URL ?? "",

      PRODUCT_NAME: payload.product.name,
      PRODUCT_PRICE: payload.product.price,
      PRODUCT_CATEGORY: payload.product.category ?? "Product",
      PRODUCT_IMAGE: payload.product.image_url ?? "",
      PRODUCT_URL: payload.product.product_url ?? "#",

      BADGE_SALE: badgeSale,
      BADGE_NEW: badgeNew,
      BADGE_DISCOUNT: badgeDiscount,

      ORIGINAL_PRICE_HTML: "",
      DISCOUNT_PILL_HTML: discountPillHTML,
    });

    // Resolve {{#if VAR}}...{{else}}...{{/if}} blocks
    const html = resolveConditionals(injected, {
      PRODUCT_IMAGE: !!payload.product.image_url,
      PRODUCT_URL: !!payload.product.product_url,
    });

    // ── 5. Send via Resend ──
    const result = await sendEmail(payload.email, copy.subject, html);

    logger.log("✅ Product view email sent", {
      to: payload.email,
      product: payload.product.name,
      resend_id: result.id,
    });

    return { success: true, email_id: result.id, subject: copy.subject };
  },
});

// ─── TASK 2: ABANDONED CART EMAIL ─────────────────────────────────────────────

export const sendAbandonedCartEmail = task({
  id: "abandoned-cart-email",
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 2000 },

  run: async (payload: AbandonedCartPayload) => {
    logger.log("🛒 Abandoned cart email triggered", {
      to: payload.email,
      items: payload.cart_items.length,
      session: payload.session_id,
    });

    // Guards
    if (!payload.email?.includes("@")) {
      logger.warn("⚠️ Skipped — no valid email", { session_id: payload.session_id });
      return { skipped: true, reason: "no_email" };
    }

    if (!payload.cart_items?.length) {
      logger.warn("⚠️ Skipped — empty cart", { session_id: payload.session_id });
      return { skipped: true, reason: "empty_cart" };
    }

    // ── 1. Generate AI copy via provider chain ──
    logger.log("🤖 Generating email copy...");
    const copy = await generateEmailCopy("abandoned_cart_item", {
      name: payload.name,
      cart_items: payload.cart_items,
      device_type: payload.device_type,
    });

    // ── 2. Load template ──
    const template = await loadTemplate("abandoned-cart");

    // ── 3. Build cart items HTML ──
    const cartItemsHTML = buildCartItemsHTML(payload.cart_items);

    const itemCount = payload.cart_items.length;
    const checkoutUrl = payload.cart_items[0]?.product_url ?? process.env.STORE_URL!;

    // ── 4. Inject tokens ──
    const html = inject(template, {
      EMAIL_SUBJECT: copy.subject,
      EMAIL_HEADLINE: copy.headline,
      EMAIL_SUBLINE: copy.subline,
      AI_COPY_BODY: copy.body,
      CART_ITEMS_HTML: cartItemsHTML,

      STORE_NAME: process.env.STORE_NAME!,
      STORE_URL: process.env.STORE_URL!,
      UNSUBSCRIBE_URL: process.env.UNSUBSCRIBE_URL!,
      EMAIL_BG_IMAGE_URL: process.env.EMAIL_BG_IMAGE_URL ?? "",
      CHECKOUT_URL: checkoutUrl,

      ITEM_COUNT: String(itemCount),
      ITEM_COUNT_PLURAL: itemCount > 1 ? "s" : "",
    });

    // ── 5. Send ──
    const result = await sendEmail(payload.email, copy.subject, html);

    logger.log("✅ Abandoned cart email sent", {
      to: payload.email,
      items: itemCount,
      resend_id: result.id,
    });

    return { success: true, email_id: result.id, items_count: itemCount, subject: copy.subject };
  },
});