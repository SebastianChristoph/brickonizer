# Brickonizer - LEGO Part Recognition

## Änderungen vorgenommen ✅

### a) Mehrfach-Bild-Upload
**Implementiert:** Die App unterstützt jetzt das gleichzeitige Hochladen mehrerer Bilder.

**Änderungen:**
- `st.file_uploader` mit `accept_multiple_files=True`
- Session State für mehrere `ImageSession`-Objekte
- Bild-Selektor zum Wechseln zwischen hochgeladenen Bildern
- Jedes Bild kann individuell annotiert werden
- Ergebnisse können nach Bild gefiltert werden
- Export kombiniert alle Ergebnisse aus allen Bildern

**UI-Features:**
- Bild-Dropdown zum Auswählen des zu bearbeitenden Bildes
- Pro-Bild-Statistiken in der Summary-Ansicht
- Filter in der Results-Ansicht ("All Images" oder spezifisches Bild)

### b) API Rate Limit angepasst
**Implementiert:** Rate-Limit auf 5 Requests/Sekunde optimiert.

**Änderungen:**
- `BrickognizeAPI` Rate-Limit: `1.0s` → `0.2s` (5 req/sec)
- Singleton-Instanz mit korrektem Delay
- UI zeigt Info: "API Limit: 5 requests/second"
- Rate-Limit-Slider entfernt (fest auf 0.2s)

**Performance:**
- 5x schnellere Verarbeitung von Teilen
- Effizientere Nutzung der API-Kapazität
- Keine unnötigen Wartezeiten

## Workflow mit mehreren Bildern

1. **Upload**: Mehrere Bilder gleichzeitig hochladen
2. **Select**: Bild aus Dropdown auswählen
3. **Annotate**: Bounding Boxes für aktuelles Bild zeichnen
4. **Repeat**: Zu anderem Bild wechseln und annotieren
5. **Analyze**: Alle Teile aus allen Bildern analysieren (5 req/sec)
6. **Filter**: Ergebnisse nach Bild filtern oder alle anzeigen
7. **Export**: Alle Ergebnisse als eine CSV-Datei exportieren

## Technische Details

### Session State Struktur
```python
st.session_state.image_sessions = [
    ImageSession(image_name="page1.jpg", parts=[...]),
    ImageSession(image_name="page2.jpg", parts=[...]),
    # ...
]
st.session_state.current_image_idx = 0  # Aktuell ausgewähltes Bild
st.session_state.all_processed_parts = [...]  # Kombinierte Ergebnisse
```

### API Performance
- **Vorher**: 1 Request/Sekunde = 60 Teile/Minute
- **Jetzt**: 5 Requests/Sekunde = 300 Teile/Minute
- **Verbesserung**: 5x schneller 🚀

## Dateien geändert

1. **app.py**
   - Multi-file upload
   - Session management für mehrere Bilder
   - Bild-Selektor
   - Filter in Results-Tab
   - Kombinierter Export

2. **services/brickognize_api.py**
   - Rate-Limit auf 0.2s geändert
   - Kommentare aktualisiert

3. **README.md**
   - Features aktualisiert
   - Anleitung erweitert
   - API-Rate-Limit dokumentiert

## Testen

```powershell
# App starten
streamlit run app.py

# Mit Docker
docker-compose up -d
```

Dann:
1. Mehrere Bilder hochladen (z.B. verschiedene Seiten einer Bauanleitung)
2. Zwischen Bildern wechseln und jeweils Teile markieren
3. Analyse starten - beobachte die schnellere Verarbeitung!
4. Ergebnisse filtern und als CSV exportieren
