// routes/address.js
import express from "express";
import fetch from "node-fetch";

const router = express.Router();

/** 🔹 Proxy naar openpostcode.nl */
router.get("/address", async (req, res) => {
  const { postcode, huisnummer } = req.query;
  if (!postcode) return res.status(400).json({ error: "postcode verplicht" });

  try {
    const url = `https://openpostcode.nl/api/address?postcode=${encodeURIComponent(postcode)}&huisnummer=${encodeURIComponent(huisnummer || "")}`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error("OpenPostcode /address error:", err.message);
    res.status(500).json({ error: "Fout bij ophalen adres" });
  }
});

router.get("/postcode", async (req, res) => {
  const { straat, plaats } = req.query;
  if (!straat || !plaats) return res.status(400).json({ error: "straat en plaats verplicht" });

  try {
    const url = `https://openpostcode.nl/api/postcode?straat=${encodeURIComponent(straat)}&plaats=${encodeURIComponent(plaats)}`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error("OpenPostcode /postcode error:", err.message);
    res.status(500).json({ error: "Fout bij ophalen postcode" });
  }
});

export default router;
