// routes/kvk.js
import express from "express";
import fetch from "node-fetch";

const router = express.Router();

/** ✅ A: Zoek bedrijfsnaam op KVK-nummer (OpenKVK) */
router.get("/by-number/:kvk", async (req, res) => {
  try {
    const { kvk } = req.params;
    const url = `https://openkvk.nl/json/${encodeURIComponent(kvk)}`;
    console.log("📡 [OpenKVK by-number]", url);

    const r = await fetch(url);
    const data = await r.json();

    if (!data || !data.handelsnaam)
      return res.status(404).json({ error: "Geen bedrijf gevonden" });

    res.json({
      source: "openkvk",
      kvk: data.kvk_nummer,
      handelsnaam: data.handelsnaam,
      adres: data.adres,
      postcode: data.postcode,
      plaats: data.plaats,
      type: data.type,
    });
  } catch (err) {
    console.error("OpenKVK by-number error:", err.message);
    res.status(500).json({ error: "Fout bij ophalen bedrijfsinfo" });
  }
});

/** ✅ B: Zoek KVK op bedrijfsnaam of plaats (OpenKVK) */
router.get("/by-name", async (req, res) => {
  try {
    const { handelsnaam, plaats } = req.query;
    if (!handelsnaam)
      return res.status(400).json({ error: "handelsnaam verplicht" });

    const q = `${handelsnaam} ${plaats || ""}`;
    const url = `https://openkvk.nl/json?query=${encodeURIComponent(q)}`;
    console.log("📡 [OpenKVK by-name]", url);

    const r = await fetch(url);
    const data = await r.json();

    const bedrijf = Array.isArray(data) ? data[0] : data;

    if (!bedrijf || !bedrijf.kvk_nummer)
      return res.status(404).json({ error: "Geen bedrijf gevonden" });

    res.json({
      source: "openkvk",
      handelsnaam: bedrijf.handelsnaam,
      kvk: bedrijf.kvk_nummer,
      adres: bedrijf.adres,
      postcode: bedrijf.postcode,
      plaats: bedrijf.plaats,
      type: bedrijf.type,
    });
  } catch (err) {
    console.error("OpenKVK by-name error:", err.message);
    res.status(500).json({ error: "Fout bij ophalen bedrijfsinfo" });
  }
});

export default router;
