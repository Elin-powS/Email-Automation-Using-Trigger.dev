/**
 * LOCAL TEST SCRIPT — No backend needed
 * ─────────────────────────────────────────────────────────────────────────────
 * Simulates what your tracker.js produces and triggers the Trigger.dev tasks
 * via the single dispatcher entry-point: "dispatch-email-task"
 *
 * HOW TO RUN:
 *   1. npm install @trigger.dev/sdk dotenv
 *   2. Fill in your .env:  TRIGGER_SECRET_KEY, and all other required vars
 *   3. Start the dev worker in another terminal:  npx trigger.dev@latest dev
 *   4. Run this script:  node test-trigger.mjs
 *
 * PICK WHICH TEST: set TEST_MODE below → "product_view" | "abandoned_cart" | "both"
 *
 * FILL IN BEFORE RUNNING:
 *   ① YOUR_EMAIL    — the address you want to receive the test emails
 *   ② YOUR_NAME     — personalisation name shown in the AI-generated copy
 *   ③ YOUR_STORE_URL — your store's base URL (used for checkout / product links)
 */

import { config } from "dotenv";
import { tasks } from "@trigger.dev/sdk/v3";

config(); // loads .env from the project root

// ─────────────────────────────────────────────────────────────────────────────
// ① CONFIGURE YOUR TEST DETAILS HERE
// ─────────────────────────────────────────────────────────────────────────────

const YOUR_EMAIL     = "you@example.com";          // ← replace with your real email
const YOUR_NAME      = "Alex";                      // ← replace with any first name
const YOUR_STORE_URL = "https://yourstore.com";     // ← replace with your store URL

// ─────────────────────────────────────────────────────────────────────────────
// MOCK PAYLOAD 1 — PRODUCT VIEW
// Simulates a user who viewed a product page but did not buy.
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_PRODUCT_VIEW = {
  event_type: "PRODUCT_VIEW",

  // ── User context ──
  email:        YOUR_EMAIL,
  name:         YOUR_NAME,
  device_type:  "mobile",                // "mobile" | "desktop"
  search_query: "wireless headphones noise cancelling",  // what they searched before viewing
  session_id:   "sess_test_pv_001",
  page_url:     `${YOUR_STORE_URL}/products/wireless-headphones`,

  // ── Product details ──
  product: {
    name:        "Premium Wireless Headphones",
    price:       "$89.99",
    category:    "Electronics",
    speciality:  "Sale",          // "Sale" | "New" | undefined  — shown as badge + used in AI copy
    discount:    "15% OFF",       // shown as badge + influences copy urgency
    image_url:   "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600",
    product_url: `${YOUR_STORE_URL}/products/wireless-headphones`,
    description: "Immersive sound with 30-hour battery life and active noise cancellation.",
    quantity:    7,               // low stock → AI copy adds subtle urgency
    meta: {
      "Stay Duration": "42s",
      "Scroll Depth":  "68%",
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// MOCK PAYLOAD 2 — ABANDONED CART
// Simulates a user who added items to their cart but left without buying.
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_ABANDONED_CART = {
  event_type: "abandoned_cart_item",

  // ── User context ──
  email:       YOUR_EMAIL,
  name:        YOUR_NAME,
  device_type: "desktop",
  session_id:  "sess_test_ac_001",

  // ── Cart items ──
  // Each object mirrors one abandoned_cart_item event from your tracker.
  // Add, remove, or edit items as needed for testing.
  cart_items: [
    {
      product_name:      "Premium Wireless Headphones",
      product_price:     "$89.99",
      product_category:  "Electronics",
      product_speciality: "Sale",
      product_discount:  "15% OFF",
      product_image:     "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600",
      product_url:       `${YOUR_STORE_URL}/products/wireless-headphones`,
      description:       "30-hour battery, active noise cancellation.",
      quantity:          7,
      timestamp:         new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 h ago
      abandoned_after_hours: 3,
    },
    {
      product_name:      "Mechanical Keyboard RGB",
      product_price:     "$64.99",
      product_category:  "Accessories",
      product_speciality: "New",
      product_discount:  null,
      product_image:     "https://images.unsplash.com/photo-1541140532154-b024d705b90a?w=600",
      product_url:       `${YOUR_STORE_URL}/products/mechanical-keyboard`,
      description:       "Tactile switches, per-key RGB, aluminium frame.",
      quantity:          12,
      timestamp:         new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 h ago
      abandoned_after_hours: 3,
    },
    {
      product_name:      "Ergonomic Mouse",
      product_price:     "$39.99",
      product_category:  "Accessories",
      product_speciality: undefined,
      product_discount:  "10% OFF",
      product_image:     "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=600",
      product_url:       `${YOUR_STORE_URL}/products/ergonomic-mouse`,
      description:       "Vertical ergonomic design, silent click, 6-button customisable.",
      quantity:          23,
      timestamp:         new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 h ago
      abandoned_after_hours: 3,
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// TRIGGER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

async function testProductViewEmail() {
  console.log("\n🚀  Triggering: PRODUCT_VIEW →  dispatch-email-task");
  console.log("    To     :", MOCK_PRODUCT_VIEW.email);
  console.log("    Product:", MOCK_PRODUCT_VIEW.product.name);
  console.log("    Price  :", MOCK_PRODUCT_VIEW.product.price);
  console.log("    Device :", MOCK_PRODUCT_VIEW.device_type);
  console.log("    Search :", MOCK_PRODUCT_VIEW.search_query);

  const handle = await tasks.trigger("dispatch-email-task", MOCK_PRODUCT_VIEW);

  console.log("\n✅  Task triggered!");
  console.log("    Run ID:", handle.id);
  console.log("    → Open Trigger.dev dashboard → Runs to watch live execution");
}

async function testAbandonedCartEmail() {
  console.log("\n🚀  Triggering: abandoned_cart_item →  dispatch-email-task");
  console.log("    To    :", MOCK_ABANDONED_CART.email);
  console.log("    Items :", MOCK_ABANDONED_CART.cart_items.length);
  MOCK_ABANDONED_CART.cart_items.forEach((item, i) => {
    console.log(`      [${i + 1}] ${item.product_name} — ${item.product_price}${item.product_discount ? " (" + item.product_discount + ")" : ""}`);
  });

  const handle = await tasks.trigger("dispatch-email-task", MOCK_ABANDONED_CART);

  console.log("\n✅  Task triggered!");
  console.log("    Run ID:", handle.id);
  console.log("    → Open Trigger.dev dashboard → Runs to watch live execution");
}

// ─────────────────────────────────────────────────────────────────────────────
// RUN
// Change TEST_MODE to control which test fires:
//   "product_view"   — sends one product-view email
//   "abandoned_cart" — sends one abandoned-cart email
//   "both"           — sends both (1.5 s apart)
// ─────────────────────────────────────────────────────────────────────────────

const TEST_MODE = "both"; // ← change this as needed

(async () => {
  console.log("─────────────────────────────────────────────────");
  console.log("  Trigger.dev Email Automation — Local Test");
  console.log("─────────────────────────────────────────────────");
  console.log("  Mode :", TEST_MODE);
  console.log("  To   :", YOUR_EMAIL);
  console.log("─────────────────────────────────────────────────");

  // Basic guard — warn if placeholder email not replaced
  if (YOUR_EMAIL === "you@example.com") {
    console.warn("\n⚠️  WARNING: YOUR_EMAIL is still the placeholder.");
    console.warn("   Edit test-trigger.mjs → set YOUR_EMAIL to your real address.\n");
  }

  try {
    if (TEST_MODE === "product_view") {
      await testProductViewEmail();
    } else if (TEST_MODE === "abandoned_cart") {
      await testAbandonedCartEmail();
    } else {
      // "both"
      await testProductViewEmail();
      await new Promise((r) => setTimeout(r, 1500)); // small gap between triggers
      await testAbandonedCartEmail();
    }

    console.log("\n─────────────────────────────────────────────────");
    console.log("  All done! Check your inbox in ~5-15 seconds.");
    console.log("─────────────────────────────────────────────────\n");

  } catch (err) {
    console.error("\n❌  Error triggering task:", err.message);
    console.error(`
Common causes:
  • YOUR_EMAIL is still the placeholder — edit test-trigger.mjs
  • TRIGGER_SECRET_KEY missing or wrong in .env
  • Dev worker not running — open a second terminal and run:
      npx trigger.dev@latest dev
  • Task IDs mismatch — the dispatcher must be registered as "dispatch-email-task"
  • TRIGGER_PROJECT_REF in trigger.config.ts doesn't match your dashboard project ref
  • Network issue — check your internet connection
    `);
    process.exit(1);
  }
})();
