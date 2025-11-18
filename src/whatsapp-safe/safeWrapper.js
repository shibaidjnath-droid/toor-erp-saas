// src/whatsapp-safe/safeWrapper.js
export function protectWhatsAppClient(client) {
  if (!client) return;

  // Voorkom crash bij ExecutionContextDestroyed
  client.on("error", (err) => {
    if (String(err).includes("Execution context was destroyed")) {
      console.warn("⚠️ WhatsApp puppeteer crash gedetecteerd — soft-recovery geactiveerd");
      // Probeer sessie opnieuw te focussen (WHATSAPP STOPT NIET)
      client.sendPresenceAvailable().catch(() => {});
    } else {
      console.error("❌ WhatsApp error:", err);
    }
  });

  // Puppeteer conflict fix
  client.on("change_state", (state) => {
    if (state === "CONFLICT" || state === "UNLAUNCHED") {
      console.warn("⚠️ WhatsApp conflict state — refocus");
      client.sendPresenceAvailable().catch(() => {});
    }
  });

  // Als puppeteer disconnected → GEEN crash, alleen waarschuwing
  client.on("disconnected", () => {
    console.warn("⚠️ WhatsApp disconnected — herstart handmatig via QR indien nodig");
  });

  console.log("🛡️ WhatsApp Safety Wrapper actief");
}
