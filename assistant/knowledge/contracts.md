# Contracten Module – TOOR ERP

## Wat is een contract?
Een contract definieert welke dienst wordt geleverd, hoe vaak en voor welke prijs.

## Velden
- contact_id: gekoppelde klant
- type_service: lijst van diensten (multi-select)
- description: vrije tekst omschrijving
- frequency: 3 weken / 4 weken / Maand / 6 weken / 8 weken / 12 weken / 3x per jaar / 1x per jaar
- price_ex: Excl. BTW
- price_inc: Incl. BTW (automatisch berekend)
- vat_pct: 21 / 9 / 0
- last_visit: datum laatste bezoek
- next_visit: automatisch berekend veld
- maandelijkse_facturatie: boolean
- active: true/false

## Business Logica
- Bij Afgerond planning → last_visit wordt de datum → next_visit wordt automatisch herberekend.
- Bij aanmaken contract → indien last_visit gevuld → planning record wordt aangemaakt.
- Bij annuleren met bepaalde redenen:
  - “Contract stop gezet door klant”
  - “Contract stop gezet door ons”
  wordt de volledige toekomstige reeks geannuleerd.

## Veelgestelde vragen
### Hoe maak ik een contract?
1. Ga naar Contracten tab.
2. Klik Nieuw Contract.
3. Selecteer klant.
4. Kies type service + frequentie.
5. Vul prijs in.
6. Opslaan.

### Hoe werkt prijsberekening?
price_inc = price_ex * (1 + vat_pct / 100)
