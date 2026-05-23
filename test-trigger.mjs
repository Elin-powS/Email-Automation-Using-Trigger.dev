/**
 * LOCAL TEST SCRIPT — No backend needed
 * ─────────────────────────────────────────────────────────────────────────────
 * Simulates what your tracker.js produces and triggers the Trigger.dev tasks
 * via the single dispatcher entry-point: "dispatch-email-task"
 *
 * HOW TO RUN:
 *   1. npm install @trigger.dev/sdk dotenv
 *   2. Add to .env: TRIGGER_SECRET_KEY, TRIGGER_PROJECT_REF
 *   3. Run: node test-trigger.mjs
 *
 * PICK WHICH TEST: set TEST_MODE at the bottom → "product_view" | "abandoned_cart" | "both"
 */

import { config } from "dotenv";
import { tasks } from "@trigger.dev/sdk/v3";

config();

// ─── MOCK: PRODUCT VIEW ───────────────────────────────────────────────────────

const MOCK_PRODUCT_VIEW = {
  event_type: "PRODUCT_VIEW",

  // User info
  email: "Insert Your Email where want to get the Email",
  name: "Name of the Client",
  device_type: "mobile",
  search_query: "wireless headphones noise cancelling",
  session_id: "sess_test_pv_001",
  page_url: "https://yourstore.com/products/wireless-headphones",

  // Product info — all fields your tracker captures
  product: {
    name: "Premium Wireless Headphones",
    price: "৳4,500",
    category: "Electronics",
    speciality: "Sale",        // "Sale" | "New" | or leave out
    discount: "15% OFF",       // shown as badge + influences AI copy
    image_url: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600",
    product_url: "https://yourstore.com/products/wireless-headphones",
    description: "Immersive sound with 30-hour battery life and active noise cancellation.",
    quantity: 7,               // stock left — AI copy can mention urgency
    meta: {
      "Stay Duration": "42s",
      "Scroll Depth": "68%",
    },
  },
};

// ─── MOCK: ABANDONED CART ─────────────────────────────────────────────────────

const MOCK_ABANDONED_CART = {
  event_type: "abandoned_cart_item",

  // User info
  email: "Insert Your Email where want to get the Email",
  name: "Name of the Client",
  device_type: "desktop",
  session_id: "sess_test_ac_001",

  // Cart items — each mirrors one tracker abandoned_cart_item event
  cart_items: [
    {
      product_name: "Premium Wireless Headphones",
      product_price: "৳4,500",
      product_category: "Electronics",
      product_speciality: "Sale",
      product_discount: "15% OFF",
      product_image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600",
      product_url: "https://yourstore.com/products/wireless-headphones",
      description: "30-hour battery, active noise cancellation.",
      quantity: 7,
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4h ago
      abandoned_after_hours: 3,
    },
    {
      product_name: "Mechanical Keyboard RGB",
      product_price: "৳3,200",
      product_category: "Accessories",
      product_speciality: "New",
      product_discount: null,
      product_image: "https://images.unsplash.com/photo-1541140532154-b024d705b90a?w=600",
      product_url: "https://yourstore.com/products/mechanical-keyboard",
      description: "Tactile switches, per-key RGB, aluminium frame.",
      quantity: 12,
      timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5h ago
      abandoned_after_hours: 3,
    },
  ],
};

// ─── TRIGGER FUNCTIONS ────────────────────────────────────────────────────────

async function testProductViewEmail() {
  console.log("\n🚀  Triggering: PRODUCT_VIEW →  dispatch-email-task");
  console.log("    To     :", MOCK_PRODUCT_VIEW.email);
  console.log("    Product:", MOCK_PRODUCT_VIEW.product.name);
  console.log("    Device :", MOCK_PRODUCT_VIEW.device_type);
  console.log("    Search :", MOCK_PRODUCT_VIEW.search_query);

  const handle = await tasks.trigger("dispatch-email-task", MOCK_PRODUCT_VIEW);

  console.log("\n✅  Task triggered!");
  console.log("    Run ID:", handle.id);
  console.log("    → Check Trigger.dev dashboard → Runs");
}

async function testAbandonedCartEmail() {
  console.log("\n🚀  Triggering: abandoned_cart_item →  dispatch-email-task");
  console.log("    To   :", MOCK_ABANDONED_CART.email);
  console.log("    Items:", MOCK_ABANDONED_CART.cart_items.length);
  MOCK_ABANDONED_CART.cart_items.forEach((item, i) => {
    console.log(`      [${i + 1}] ${item.product_name} — ${item.product_price}`);
  });

  const handle = await tasks.trigger("dispatch-email-task", MOCK_ABANDONED_CART);

  console.log("\n✅  Task triggered!");
  console.log("    Run ID:", handle.id);
  console.log("    → Check Trigger.dev dashboard → Runs");
}

// ─── RUN ──────────────────────────────────────────────────────────────────────
// Change to: "product_view" | "abandoned_cart" | "both"

const TEST_MODE = "both";

(async () => {
  console.log("─────────────────────────────────────────────────");
  console.log("  Trigger.dev Email Automation — Local Test");
  console.log("─────────────────────────────────────────────────");
  console.log("  Mode:", TEST_MODE);
  console.log("─────────────────────────────────────────────────");

  try {
    if (TEST_MODE === "product_view")   await testProductViewEmail();
    else if (TEST_MODE === "abandoned_cart") await testAbandonedCartEmail();
    else {
      await testProductViewEmail();
      await new Promise((r) => setTimeout(r, 1500));
      await testAbandonedCartEmail();
    }
  } catch (err) {
    console.error("\n❌  Error:", err.message);
    console.error(`
Common causes:
  • TRIGGER_SECRET_KEY missing or wrong in .env
  • Task not deployed yet — run: npx trigger.dev@latest dev
  • Task ID mismatch — dispatcher must be registered as "dispatch-email-task"
  • TRIGGER_PROJECT_REF missing in trigger.config.ts
    `);
  }
})();
