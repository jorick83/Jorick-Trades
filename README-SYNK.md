# Jorick Trades – synkroniserad version

Den befintliga kompilerade appen i `assets/` är oförändrad. Nya `sync.js` sköter inloggning, läser journalen från Supabase innan appen startar och laddar upp ändringar i `vpj-trades-v3` efter Excel-import. Skärmbilder synkroniseras inte.

## Installation

1. Skapa ett gratis Supabase-projekt på https://supabase.com.
2. Öppna **SQL Editor**, klistra in `SUPABASE-SETUP.sql` och kör.
3. I Supabase under **Authentication > Users**, skapa din användare (e-post och lösenord). Använd en säker inloggning. Stäng gärna av öppen registrering om endast du ska använda journalen.
4. Hämta **Project URL** och **publishable key** (eller legacy `anon` key) under projektets API-inställningar. Klistra in dem i `sync-config.js`. **Lägg aldrig en secret/service_role key i filen.**
5. Ladda upp samtliga filer i ZIP-paketet till ditt GitHub Pages-repository, i samma mappstruktur. Vänta tills GitHub Pages publicerat ändringen.
6. Öppna sidan, logga in, ladda upp Excel-filen. Journalen sparas i molnet och hämtas vid nästa inloggning på annan enhet.

## Viktigt

- Din tidigare lokala journal kan erbjudas som första uppladdning om molnet ännu är tomt.
- Om molnet redan innehåller en journal används den före lokal data. Ta gärna en kopia av din Excel-fil först.
- Tomma journaler skickas inte till molnet om en tidigare icke-tom journal har laddats. Det skyddar mot oavsiktlig radering, men medveten tömning måste hanteras separat.
- Öppna inte sidan på två enheter och redigera samtidigt. Senaste sparade ändringen kan annars skriva över den andra.
- Låt sidan vara öppen tills den visar **Journalen synkroniserad** efter import. Om synkronisering misslyckas, välj **Försök igen**.
- Webbläsaren lagrar fortfarande en lokal kopia. Använd inte en delad dator utan att rensa webbplatsens lokala data.
- Inloggningen sparas inte mellan omladdningar: logga in igen när du öppnar sidan.
- Supabases gratisgränser och tillgänglighet kan ändras. Se leverantörens aktuella villkor.
- Paketet är en integration runt en minifierad produktionsbyggnad, inte en ombyggnad av appens källkod. Testa med en kopia av journalen innan du ersätter den publika sidan.
