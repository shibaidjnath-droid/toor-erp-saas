// routes/whatsapp.js
import { enableWhatsAppSafety } from "../whatsapp-safe/index.js";
import express from "express";
import pkg from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import fs from "fs";
import path from "path";

const { Client, LocalAuth, MessageMedia } = pkg;

const router = express.Router();

let client = null;

// ⭐ WhatsApp alleen initialiseren zodra jij hem handmatig start
export function initWhatsApp() {
  if (client) {
    console.log("♻️ WhatsApp client bestaat al");
    return client;
  }

  console.log("🚀 WhatsApp client initialiseren...");

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: "./sessions" }),
    puppeteer: { headless: true, args: ["--no-sandbox"] },
  });

  enableWhatsAppSafety(client);

  client.on("qr", (qr) => {
    console.log("📱 Scan deze QR om in te loggen op WhatsApp:");
    qrcode.generate(qr, { small: true });
  });

  client.on("ready", () => console.log("✅ WhatsApp client is klaar"));
  client.on("auth_failure", (msg) => console.error("❌ Auth fout:", msg));
  client.on("disconnected", () => console.warn("⚠️ WhatsApp sessie verbroken"));

  setTimeout(() => {
    client.initialize();
  }, 1000);

  return client;
}

// --- QR ophalen
router.get("/qr", (_req, res) => {
  res.send("Kijk in je console voor QR-code");
});

// --- Bericht versturen
router.post("/send", async (req, res) => {
  try {
    const { phone, message, filePath } = req.body;

    if (!phone) return res.status(400).json({ error: "phone is verplicht" });

    const waclient = client || initWhatsApp(); // ⭐ gegarandeerd altijd klaar
    const formatted = phone.replace(/\D/g, "") + "@c.us";

    if (filePath && fs.existsSync(filePath)) {
      const normalized = path.resolve(filePath).replace(/\\/g, "/");

      const buffer = fs.readFileSync(normalized);
      const base64 = buffer.toString("base64");
      const media = new MessageMedia("image/png", base64, path.basename(normalized));

      const numberId = await waclient.getNumberId(phone);

      if (!numberId) {
        return res.status(400).json({ error: "Nummer niet gevonden in WhatsApp" });
      }

      await waclient.sendMessage(numberId._serialized, media, { caption: message });

      return res.json({ ok: true, to: phone });
    }

    await waclient.sendMessage(formatted, message);
    res.json({ ok: true, to: phone });
  } catch (err) {
    console.error("❌ WhatsApp send error:", err);
    res.status(500).json({ error: "Fout bij verzenden bericht" });
  }
});

export default router;
