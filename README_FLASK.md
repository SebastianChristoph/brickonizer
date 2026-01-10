# Brickonizer Flask Version

Diese Version verwendet Flask statt Streamlit für eine bessere Canvas-Erfahrung ohne Flackern.

## Installation

```bash
pip install -r requirements_flask.txt
```

## Starten

```bash
python flask_app.py
```

Die App läuft dann auf: http://localhost:5000

## Verwendung

1. **Upload & Mark**: Bilder hochladen und Teile mit Canvas markieren
2. **Results**: Übersicht der erkannten Teile
3. **Review**: Teil-für-Teil durch alle Markierungen mit Farb- und Mengenauswahl
4. **Export**: JSON-Export der finalen Liste

## Vorteile gegenüber Streamlit

- ✅ Kein Canvas-Flackern beim Zeichnen
- ✅ Smooth HTML5 Canvas mit JavaScript
- ✅ Bessere Performance
- ✅ Persistente Boxen ohne Rerendering
- ✅ Professionellere UX

## Architektur

```
Flask Backend (Python)
├── API Endpoints (/upload, /analyze, /save_boxes, etc.)
├── Session Management (in-memory)
└── Brickognize API Integration

Frontend (HTML/CSS/JS)
├── HTML5 Canvas (canvas.js) - Interactive drawing
├── App Logic (app.js) - Workflow management
└── Responsive UI (style.css)
```

## API Endpoints

- `GET /` - Main page
- `POST /upload` - Upload images
- `GET /image/<filename>` - Get uploaded image
- `POST /save_boxes` - Save bounding boxes
- `GET /get_boxes/<filename>` - Get saved boxes
- `POST /analyze` - Analyze all marked parts
- `GET /get_results` - Get analysis results
- `POST /update_part` - Update part in review
- `GET /export` - Export JSON
- `GET /colors` - Get BrickLink colors
