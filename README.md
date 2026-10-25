# Huset mitt

En mobilvennlig app på norsk som samler husmodellen, oppussingsplaner, økonomi og vedlikehold. Den er laget som én HTML-fil uten server.

## Funksjoner
- **Bildetolking med AI:** Last opp plantegninger, skisser eller bilder av rom. Claude foreslår rom, vegger, dører og vinduer, og hver verdi er merket som lest, skalert, anslått eller bekreftet.
- **Plantegning:** Redigerbar plantegning med mål, veggtykkelser, åpninger, trapper, flere etasjer, arealberegning, angre og advarsler når mål ikke går opp.
- **3D:** Kan fjerne taket, vise én etasje om gangen og gå rundt i huset. Du kan også bruke møbelbibliotek, måleverktøy og før/etter-sammenligning av forslag.
- **Prosjekter:** Oppgaver med avhengigheter, budsjett mot faktisk forbruk, og tilbud.
- **Kvitteringer:** Skanning med AI, deling av én kvittering på flere prosjekter, returer og varsel om duplikater.
- **Mer:** Kalender, lister, dokumentasjonsarkiv, vedlikeholdsplan og historikk.
- **Lagring og sikkerhetskopi:** Data lagres privat i nettleseren (IndexedDB). Sikkerhetskopi med bilder kan lastes ned og gjenopprettes.

## Bruk
- Åpne `dist/huset-mitt-frittstaende.html` i en nettleser.
- Bildetolking krever en Anthropic API-nøkkel, som du legger inn under Innstillinger. Nøkkelen lagres kun lokalt. Hver analyse koster omtrent 0,5–1,5 kr.
- `dist/huset-mitt.html` er versjonen som publiseres som Claude-artefakt. Der går bildetolkingen via Claude-kontoen, uten API-nøkkel.

## Utvikling
```
npm install
npm i -D playwright   # for nettlesertestene
npm run build         # src/ → dist/
npm test
```
Kildekoden ligger i `src/js/` og lastes inn i nummerert rekkefølge. Alt ligger i det globale objektet `HM`.

Tegningene appen lager er ikke godkjente byggetegninger. Appen vurderer heller ikke bærende vegger eller søknadsplikt.
