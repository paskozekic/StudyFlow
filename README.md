# StudyFlow

Pametni planer učenja za studente. Student unese kolegije, ispite i rokove te koliko sati
učenja procjenjuje. StudyFlow od toga i od raspoloživog vremena složi dnevni raspored. Kad
student propusti termin, plan se sam preraspodijeli.

Namijenjeno studentima FER-a (Fakultet elektrotehnike i računarstva, Sveučilište u Zagrebu).

## Funkcionalnosti

- **Uvoz FER rasporeda (.ics)**: .ics datoteka kalendara s FER weba uvozi se jednim klikom. Predavanja, laboratoriji i ostali termini postaju zauzeto vrijeme, a međuispiti i ispiti se nude kao obveze s predloženim brojem sati učenja; kolegiji se stvaraju sami. Ponovni uvoz zamjenjuje buduće termine i ažurira datume ispita bez duplikata.
- **Unos obveza**: kolegiji, ispiti, kolokviji, zadaće i projekti s rokom, procjenom sati, prioritetom i opisom gradiva.
- **Dostupnost u terminima**: tjedni prozori kad možeš učiti (npr. pon 9–12 i 15–21), te zauzeto vrijeme (predavanje, posao, put…) koje se može ponavljati po danima u tjednu i oduzima se od dostupnosti.
- **Pametno planiranje**: sati se raspoređuju ravnomjerno do dana prije roka i slažu u konkretne slobodne termine, u blokovima do 2 h uz izmjenu predmeta. Kad vremena nema dovoljno, prednost imaju hitnije obveze i one višeg prioriteta.
- **Dinamička prilagodba**: „Nisam stigao” na terminu odmah preslaže plan od trenutnog vremena nadalje (može i isti dan navečer) i javlja kamo je učenje premješteno. Termini neodrađeni do kraja dana sami postaju propušteni.
- **Praćenje napretka**: odrađeni sati, pripremljenost po obvezi i upozorenje kad do roka nema dovoljno vremena.

## Tehnologije

| Sloj     | Tehnologija                         |
| -------- | ----------------------------------- |
| Frontend | React + Vite (`client/`)            |
| Backend  | Node.js + Express (`server/`)       |
| Baza     | PostgreSQL (`server/src/schema.sql`) |

## Pokretanje

Potrebni su Node.js 22 ili noviji i Docker Desktop (za PostgreSQL).

```bash
npm install
npm run db:up                            # PostgreSQL u Dockeru, na portu 5433
cp server/.env.example server/.env       # postavlja DATABASE_URL
npm run dev
```

Frontend je dostupan na http://localhost:5174, a API na http://localhost:3001. Tablice se
stvaraju automatski pri pokretanju servera, a podaci ostaju u Docker volumenu
`studyflow-data` i nakon ponovnog pokretanja. Baza se nakon toga sama pokreće s Dockerom.

Bez `server/.env` server koristi **bazu u memoriji** (pg-mem) – zgodno za brzo isprobavanje,
ali se podaci gube pri svakom ponovnom pokretanju.

U Windows PowerShellu u kojem je izvršavanje skripti isključeno umjesto `npm` koristi `npm.cmd`.

## Ostale naredbe

```bash
npm test         # testovi planera i API-ja (baza u memoriji)
npm run build    # produkcijska verzija frontenda (client/dist)
npm start        # server koji poslužuje API i izgrađeni frontend
```

Isti testovi na pravom PostgreSQL-u (testna baza se prije svakog testa briše, zato zasebna baza):

```bash
docker compose exec db createdb -U studyflow studyflow_test
TEST_DATABASE_URL=postgres://studyflow:studyflow@localhost:5433/studyflow_test npm run test:pg -w server
```

## Struktura

```
client/src/
  App.jsx                 jedna stranica: kalendar + gumbi koji otvaraju pop-up prozore
  components/Calendar.jsx mjesečni kalendar (termini učenja i rokovi)
  components/*Modal.jsx   pop-up prozori: dan, nova obveza, obveze, kolegiji, vrijeme, napredak
server/src/
  ics.js                  čitanje .ics datoteke i razvrstavanje FER termina (predavanje, labos, ispit)
  importService.js        uvoz: pregled, zauzeto vrijeme, ispiti kao obveze, ponovni uvoz
  freeTime.js             slobodni intervali: prozori dostupnosti − zauzeto − prošlo vrijeme
  planner.js              koliko sati koji dan i u koje termine (čista funkcija)
  planService.js          povezuje planer s bazom, preslaže plan od "sada"
  app.js                  REST API
  db.js, schema.sql       spajanje na PostgreSQL / pg-mem i shema
server/test/              testovi (node:test)
```

## API

| Metoda | Putanja                 | Opis                                         |
| ------ | ----------------------- | -------------------------------------------- |
| GET/POST | `/api/courses`        | kolegiji                                     |
| PUT/DELETE | `/api/courses/:id`  |                                              |
| GET/POST | `/api/obligations`    | obveze (spremanje pokreće preraspodjelu)     |
| PUT/DELETE | `/api/obligations/:id` |                                          |
| GET/PUT | `/api/availability`    | tjedni prozori `{ weekday, start_time, end_time }` (0 = nedjelja) |
| GET    | `/api/unavailability?from=&to=` | zauzeti blokovi                     |
| POST   | `/api/unavailability`   | novi blok, opcionalno `repeat: { weekdays, until }` |
| PUT/DELETE | `/api/unavailability/:id` |                                         |
| GET    | `/api/sessions?from=&to=` | termini učenja u rasponu datuma           |
| PATCH  | `/api/sessions/:id`     | `{ status: planned \| done \| missed }`; `missed` preslaže plan i vraća sljedeće termine |
| POST   | `/api/import/ics/preview` | `{ ics }` → što će se uvesti (termini, kolegiji, ispiti) |
| POST   | `/api/import/ics`       | uvoz; `exams: [{ uid, effort_hours }]` su ispiti za koje se planira učenje |
| POST   | `/api/plan/replan`      | ručna preraspodjela                          |
| GET    | `/api/progress`         | napredak i pripremljenost                    |

Prototip je trenutačno za jednog korisnika (bez prijave).
