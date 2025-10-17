// routes/clients.js
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { contracts } from './contracts.js';

const router = express.Router();
export let clients = [];

/**
 * Client structuur:
 * {
 *   id, name, email, phone, address, houseNumber, city,
 *   typeKlant: 'Particulier' | 'Zakelijk',
 *   bedrijfsnaam?, kvk?, btw?,
 *   verzendMethode: 'Whatsapp' | 'Email',
 *   status, createdAt
 * }
 */

// ✅ GET alle klanten
router.get('/', (_req, res) => {
  res.json(clients);
});

// ✅ GET klant per ID
router.get('/:id', (req, res) => {
  const c = clients.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Client niet gevonden' });
  res.json(c);
});

// ✅ POST nieuwe klant (optioneel met contract)
router.post('/', (req, res) => {
  const {
    name, email, phone, address, houseNumber, city,
    typeKlant, bedrijfsnaam, kvk, btw, verzendMethode,
    status, // optioneel
    contract_typeService, contract_frequency, contract_description,
    contract_priceInc, contract_vat, contract_lastVisit
  } = req.body;

  if (!name || !email)
    return res.status(400).json({ error: 'Naam en e-mail zijn verplicht' });

  // --- Nieuw klantobject ---
  const client = {
    id: uuidv4(),
    name,
    email,
    phone: phone || '',
    address: address || '',
    houseNumber: houseNumber || '',
    city: city || '',
    typeKlant: ['Particulier', 'Zakelijk'].includes(typeKlant)
      ? typeKlant
      : 'Particulier',
    verzendMethode: ['Whatsapp', 'Email'].includes(verzendMethode)
      ? verzendMethode
      : 'Email',
    bedrijfsnaam: typeKlant === 'Zakelijk' ? (bedrijfsnaam || '') : '',
    kvk: typeKlant === 'Zakelijk' ? (kvk || '') : '',
    btw: typeKlant === 'Zakelijk' ? (btw || '') : '',
    status: status || 'Active',
    createdAt: new Date(),
  };

  clients.push(client);

  // ...
  // --- Indien contractvelden zijn ingevuld ---
  let newContract = null;
  if (contract_typeService || contract_description) {
    const validServices = Array.isArray(contract_typeService)
  ? contract_typeService
  : [contract_typeService];


    const freq = contract_frequency || 'Maand';
    const vat = isNaN(parseFloat(contract_vat)) ? 21 : parseFloat(contract_vat);
    const priceInc = isNaN(parseFloat(contract_priceInc))
      ? 0
      : parseFloat(contract_priceInc);
    const priceEx = +(priceInc / (1 + vat / 100)).toFixed(2);

    newContract = {
      id: uuidv4(),
      contactId: client.id, // koppeling
      typeService: validServices,
      frequency: freq,
      description: contract_description || '',
      priceEx,
      priceInc,
      vatPct: vat,
      lastVisit: contract_lastVisit || null,
      nextVisit: new Date().toISOString(),
      active: true,
      createdAt: new Date(),
    };

    contracts.push(newContract);
    console.log(`Nieuw contract aangemaakt voor klant ${client.name}`);
  }

  // ✅ Nu klant + eventueel contract teruggeven
  res.status(201).json({
    ...client,
    contractCreated: !!newContract,
  });
});


// ✅ PUT klant bijwerken
router.put('/:id', (req, res) => {
  const idx = clients.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Client niet gevonden' });

  const p = { ...req.body };

  if (p.typeKlant && !['Particulier', 'Zakelijk'].includes(p.typeKlant))
    delete p.typeKlant;
  if (p.verzendMethode && !['Whatsapp', 'Email'].includes(p.verzendMethode))
    delete p.verzendMethode;

  // Alleen zakelijke velden behouden bij type 'Zakelijk'
  if (p.typeKlant === 'Particulier') {
    p.bedrijfsnaam = '';
    p.kvk = '';
    p.btw = '';
  }

  clients[idx] = { ...clients[idx], ...p };
  res.json(clients[idx]);
});

// ✅ PATCH: status toggelen
router.patch('/:id/toggle', (req, res) => {
  const c = clients.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Client niet gevonden' });
  c.status = c.status === 'Active' ? 'Inactive' : 'Active';
  res.json({ message: `Status gewijzigd naar ${c.status}`, client: c });
});

export default router;
