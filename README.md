# ⏱️ TimeTrack

Moderní, lehký a lokální nástroj pro sledování odpracovaného času, evidenci projektů a přímé generování faktur do PDF s českým QR kódem.

Aplikace funguje na principu **Local-First / Zero-Dependencies** – data ukládá přímo do lokálního souboru `data.json` a k běhu serveru nepotřebuje žádné externí npm balíčky.

---

## ✨ Klíčové funkce

- 📅 **Interaktivní týdenní kalendář**:
  - Intuitivní vytváření, posouvání a změna velikosti časových úseků tažením myši (drag & drop).
  - Rozlišení typů událostí: **Práce**, **Schůzka**, **Volno** a **Nemoc**.
  - Zobrazení detailů události, poznámek a rychlá duplikace.

- 🗂️ **Více projektů / záložek**:
  - Samostatné záložky pro různé klienty nebo projekty.
  - Nastavitelný úvazek v procentech (např. 80 % pro jeden projekt, 20 % pro druhý).

- 📊 **Přehledné statistiky a fond pracovní doby**:
  - Automatický výpočet měsíčního i týdenního pracovního fondu s odečtem **českých státních svátků** (integrovaný kalendář včetně pohyblivých Velikonoc).
  - Vizuální **progress bary** a procentuální plnění fondu pro aktuální měsíc i aktuální týden.
  - Automatický přepočet na **MD** (Man-Days).

- 🧾 **Fakturace do PDF s QR platbou**:
  - Generování profesionálních faktur do PDF jedním kliknutím přímo z prohlížeče.
  - Nastavení dodavatele a odběratele zvlášť pro každou záložku/projekt.
  - Automatický výpočet celkové částky podle sazby za MD.
  - Generování standardního českého QR kódu pro okamžitou platbu (SPAYD).

- 🛡️ **Spolehlivost a ochrana dat**:
  - Žádná vzdálená databáze – data zůstávají pouze u vás v počítači.
  - Automatické periodické zálohování (každých 10 minut do složky `backup/`).
  - Možnost ručního exportu i importu dat ve formátu JSON.
  - Lokální fallback (localStorage) v případě výpadku backendu.

- ⚡ **Zero Dependencies**:
  - Backend postavený na čistém Node.js (používá pouze nativní moduly `http`, `fs`, `path`).
  - Není potřeba spouštět žádný `npm install`.

---

## 🚀 Rychlý start

### Požadavky
- Nainstalovaný [Node.js](https://nodejs.org/) (libovolná moderní verze).

### Spuštění na Windows
Jednoduše poklepejte na soubor:
```cmd
start.bat
```
Nebo přes příkazovou řádku / PowerShell:
```cmd
node server.js
```
Aplikace se spustí na adrese [http://localhost:3000](http://localhost:3000).

### Běh na pozadí v systémové liště (Windows Tray)
Pro tichý běh na pozadí s ikonou v oznamovací oblasti (vedle hodin) spusťte skript:
```powershell
powershell -ExecutionPolicy Bypass -File runTray.ps1
```
Kliknutím na ikonu můžete aplikaci otevřít v prohlížeči nebo ji ukončit.

### Spuštění na Linuxu / macOS
```bash
chmod +x start.sh
./start.sh
```

---

## 📁 Struktura projektu

```text
timetrack/
├── index.html              # Hlavní uživatelské rozhraní
├── style.css               # Stylování (moderní tmavý motiv)
├── app.js                  # Frontendová logika, interakce a kalendář
├── server.js               # Lehký Node.js server pro čtení a zápis JSON dat
├── data.base.json          # Výchozí šablona datové struktury pro nové instalace
├── holidays_cz.json        # Seznam českých státních svátků
├── html2pdf.bundle.min.js  # Knihovna pro export faktur do PDF
├── start.bat               # Windows spouštěcí skript
├── start.sh                # Linux/macOS spouštěcí skript
├── runTray.ps1             # Windows System Tray launcher
├── backup/                 # Složka pro automatické zálohy (ignorováno v gitu)
└── invoices/               # Složka pro generované faktury (ignorováno v gitu)
```

---

## 🔒 Práce s daty a šablona `data.base.json`

Projekt odděluje zdrojový kód od vašich osobních dat:
1. **`data.json`**: Obsahuje vaše živá data (odpracované časy, údaje dodavatele/odběratele). Tento soubor je v `.gitignore` a nikdy se nenahrává do repozitáře.
2. **`data.base.json`**: Slouží jako anonymizovaná výchozí kostra. Při prvním spuštění server zkontroluje přítomnost `data.json` a pokud neexistuje, automaticky jej zkopíruje z `data.base.json`.

---

## ⌨️ Ovládání kalendáře

- **Vytvoření úseku**: Klikněte a táhněte myší v libovolném sloupci dne.
- **Posun úseku**: Chytněte úsek za střed a přetáhněte na jiný čas nebo jiný den.
- **Změna trvání**: Chytněte úsek za horní nebo spodní hranu a táhněte.
- **Úprava detailů / smazání**: Klikněte na vytvořený úsek pro otevření modálního okna.
- **Pohyb mezi týdny**: Pomocí šipek v horní liště nebo klávesami `Šipka vlevo` / `Šipka vpravo`.
- **Rychlý návrat**: Tlačítko **Dnes**.
