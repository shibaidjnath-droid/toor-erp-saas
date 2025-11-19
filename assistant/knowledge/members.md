# Members (Medewerkers) Module – TOOR ERP

## Wat is een member?
Een member is een medewerker die rollen kan hebben en ingepland kan worden.

## Velden
- name
- email
- phone
- roles: ["Schoonmaker", "Teamleider", "Planner", ...]
- active: bepaalt inzetbaarheid
- end_date: optioneel einde dienstverband

## Business Logica
- Alleen active = true → komt in auto-assign
- Alleen members met rol “Schoonmaker” → auto-assign planning
- Rollen zijn zelf te beheren in Instellingen → Rollen
- Inactive members blijven zichtbaar in historie maar worden nooit toegewezen

## Veelgestelde vragen
### Hoe voeg ik een member toe?
Ga naar Members → Nieuw Member → Opslaan.

### Waarom wordt een member niet toegewezen bij planning?
- Member is niet actief
- Rol “Schoonmaker” ontbreekt
- Member heeft einddatum in het verleden
