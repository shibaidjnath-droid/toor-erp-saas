import express from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

export let contacts = [];

// helper
function toBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return ['true','1','on','yes','ja'].includes(v.toLowerCase());
  return false;
}

// GET all
router.get('/', (_req, res) => {
  res.json(contacts);
});

// GET by id
router.get('/:id', (req, res) => {
  const c = contacts.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Contact not found' });
  res.json(c);
});

// POST create
router.post('/', (req, res) => {
  const {
    name, address, email, phone,
    amount, status, facturatie, invoiceDay, tag, houseNumber,
  } = req.body;

  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });

  const newContact = {
    id: uuidv4(),
    name,
    address: address || '',
    email,
    phone: phone || '',
    amount: isNaN(parseFloat(amount)) ? 0 : parseFloat(amount),
    status: status || 'Active',
    // nieuwe velden
    facturatie: ['Auto','Bulk','Manueel'].includes(facturatie) ? facturatie : 'Manueel',
    invoiceDay: Number.isInteger(parseInt(invoiceDay,10)) ? parseInt(invoiceDay,10) : 1,
    tag: tag || '',
    houseNumber: houseNumber || '',
    createdAt: new Date(),
  };
  contacts.push(newContact);
  res.status(201).json(newContact);
});

// PUT update
router.put('/:id', (req, res) => {
  const idx = contacts.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Contact not found' });

  const payload = { ...req.body };
  if (payload.amount !== undefined) payload.amount = isNaN(parseFloat(payload.amount)) ? 0 : parseFloat(payload.amount);
  if (payload.invoiceDay !== undefined) payload.invoiceDay = Number.isInteger(parseInt(payload.invoiceDay,10)) ? parseInt(payload.invoiceDay,10) : 1;
  if (payload.facturatie && !['Auto','Bulk','Manueel'].includes(payload.facturatie)) delete payload.facturatie;

  contacts[idx] = { ...contacts[idx], ...payload };
  res.json(contacts[idx]);
});

// PATCH toggle status
router.patch('/:id/toggle', (req, res) => {
  const c = contacts.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Contact not found' });
  c.status = c.status === 'Active' ? 'Inactive' : 'Active';
  res.json({ message: `Status updated to ${c.status}`, contact: c });
});

// ✅ Contract ophalen op basis van planningId
router.get("/by-planning/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(`
      SELECT 
        c.id, c.contact_id AS client_id, c.type_service, c.description,
        ct.name AS client_name
      FROM contracts c
      JOIN planning p ON p.contract_id = c.id
      JOIN contacts ct ON c.contact_id = ct.id
      WHERE p.id = $1
      LIMIT 1
    `, [id]);
    if (!rows.length) return res.status(404).json({ error: "Contract niet gevonden" });
    res.json(rows[0]);
  } catch (err) {
    console.error("❌ contract by-planning error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
