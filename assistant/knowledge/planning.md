# Planning Module – TOOR ERP

## Wat is planning?
Planning bevat alle ingeplande bezoeken gebaseerd op contracten.

## Velden
- date: datum van bezoek
- member_id: medewerker die wordt toegewezen
- status: Gepland / Afgerond / Geannuleerd
- invoiced: true/false
- cancel_reason: reden van annulering

## Slimme Logica
### Auto-assign
- Neemt alle actieve members met rol “Schoonmaker”.
- Verdeelt planning eerlijk (round-robin).
- Wordt async aangeroepen na elk nieuw planning record.

### Generate Planning
- Alle contracten waarvan next_visit <= vandaag
- Alleen klanten met status Active
- Geen dubbele planning op dezelfde dag

### Status veranderingen
- Afgerond → contract.last_visit en next_visit worden bijgewerkt
- Geannuleerd:
  - Als reden = stopzetting → hele reeks annuleren
  - Anders → herplan-opties beschikbaar

## Veelgestelde vragen
### Hoe plan ik handmatig iets in?
1. Ga naar Planning tab
2. Klik “Nieuwe Planning”
3. Zoek klant
4. Selecteer member
5. Opslaan
