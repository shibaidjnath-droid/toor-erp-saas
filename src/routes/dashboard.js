// routes/dashboard.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Statische route naar je dashboard.html
router.get("/", async (_req, res) => {
  try {
    const dashboardPath = path.join(__dirname, "../../public/dashboard.html");
    res.sendFile(dashboardPath);
  } catch (err) {
    console.error("❌ Fout bij laden van dashboard:", err);
    res.status(500).send("Kon dashboard niet laden");
  }
});

// Optioneel — fallback voor onbekende routes (handig bij SPA-routing)
router.get("*", (_req, res) => {
  res.redirect("/dashboard");
});

export default router;
