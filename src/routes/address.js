// routes/address.js
import express from "express";
import fetch from "node-fetch";

const router = express.Router();

/** ✅ A: Postcode + huisnummer → straat + woonplaats (OpenPostcode) */
router.get("/lookup-address", async (req, res) => {
  const { postcode, huisnummer } = req.query;
  if (!postcode) return res.status(400).json({ error: "postcode verplicht" });

  try {
    const url = `https://openpostcode.nl/api/address?postcode=${encodeURIComponent(postcode)}&huisnummer=${encodeURIComponent(huisnummer || "")}`;
    console.log(`📡 [OpenPostcode lookup] ${url}`);

    const r = await fetch(url);
    const data = await r.json();
    console.log("📦 OpenPostcode response:", JSON.stringify(data, null, 2));

    res.json({
      source: "openpostcode",
      ...data
    });
  } catch (err) {
    console.error("lookup-address error:", err.message);
    res.status(500).json({ error: "Fout bij ophalen adres" });
  }
});

/** ✅ B: Straat + huisnummer + plaats → postcode (PDOK) */
router.get("/lookup-postcode", async (req, res) => {
  const { straat, huisnummer, plaats } = req.query;
  if (!straat || !plaats)
    return res.status(400).json({ error: "straat en plaats verplicht" });

  try {
    const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest?q=${encodeURIComponent(`${straat} ${huisnummer || ""} ${plaats}`)}`;
    console.log(`📡 [PDOK lookup] ${url}`);

    const r = await fetch(url);
    const data = await r.json();

    // 🔍 PDOK kan twee structuren teruggeven: docs[] of direct object
    let first = data?.response?.docs?.[0] || data;

    // 📬 Probeer postcode uit verschillende bronnen te halen
    let postcode = first?.postcode;
    if (!postcode && typeof first?.weergavenaam === "string") {
      const match = first.weergavenaam.match(/\b\d{4}\s?[A-Z]{2}\b/);
      if (match) postcode = match[0].replace(/\s?/, "");
    }

    if (postcode) {
      return res.json({
        source: "pdok",
        postcode,
        straat: first.straatnaam || straat,
        woonplaats: first.woonplaatsnaam || plaats,
        huisnummer: huisnummer || first.huisnummer,
        provincie: first.provincie || null,
        weergavenaam: first.weergavenaam || null,
      });
    }

    console.warn("⚠️ Geen postcode gevonden in PDOK-response:", data);
    res.status(404).json({ error: "Geen postcode gevonden", source: "pdok" });
  } catch (err) {
    console.error("lookup-postcode error:", err.message);
    res.status(500).json({ error: "Fout bij ophalen postcode" });
  }
});


export default router;
