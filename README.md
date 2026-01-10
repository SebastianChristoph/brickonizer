# 🧱 LEGO Part Recognizer

A Python-based web application for recognizing LEGO parts from building instruction images using AI and the Brickognize API.

## 🎯 Features

- **Multi-Image Upload**: Upload and process multiple images simultaneously
- **Image Selection**: Switch between images for individual annotation
- **Interactive Annotation**: Draw bounding boxes around individual parts
- **OCR Integration**: Automatic quantity detection (e.g., "11x", "2x")
- **Batch Processing**: Analyze multiple parts across all images
- **Part Recognition**: AI-powered recognition via Brickognize API (5 requests/second)
- **Color Detection**: Automatic color prediction for each part
- **Combined Results**: View and filter results from all images
- **Results Export**: Export all results as CSV with part numbers, colors, and quantities
- **Progress Tracking**: Real-time progress display during analysis

## 🏗️ Tech Stack

- **Frontend**: Flask + HTML5 Canvas (interactive UI)
- **Image Processing**: OpenCV, Pillow
- **OCR**: Tesseract OCR (pytesseract)
- **API Integration**: httpx (async HTTP client)
- **Deployment**: Docker & Docker Compose

## 📁 Project Structure

```
brickonizer/
├── flask_app.py                # Main Flask application
├── models/
│   ├── __init__.py
│   └── data_models.py         # Data classes for parts and results
├── services/
│   ├── __init__.py
│   ├── brickognize_api.py     # Brickognize API client
│   ├── image_processor.py     # Image processing utilities
│   └── ocr_service.py         # OCR service for quantity detection
├── utils/
│   ├── __init__.py
│   └── helpers.py             # Helper functions
├── requirements.txt           # Python dependencies
├── Dockerfile                 # Docker configuration
├── docker-compose.yml         # Docker Compose setup
├── .dockerignore             # Docker ignore file
├── .gitignore                # Git ignore file

└── README.md                 # This file
```

## 🚀 Quick Start

### Local Development

#### Prerequisites

- Python 3.11+
- Tesseract OCR installed on your system

**Windows:**
```powershell
# Install via Chocolatey
choco install tesseract

# Or download from: https://github.com/UB-Mannheim/tesseract/wiki
```

**Linux:**
```bash
sudo apt-get install tesseract-ocr tesseract-ocr-eng
```

**macOS:**
```bash
brew install tesseract
```

#### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd brickonizer
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Run the application:
```bash
python flask_app.py
```

5. Open your browser at `http://localhost:8501`

### Docker Deployment

#### Using Docker Compose (Recommended)

1. Build and start the container:
```bash
docker-compose up -d
```

2. Access the application at `http://localhost:8501`

3. Stop the container:
```bash
docker-compose down
```

#### Using Docker directly

1. Build the image:
```bash
docker build -t lego-recognizer .
```

2. Run the container:
```bash
docker run -p 8501:8501 lego-recognizer
```

## 📖 How to Use

### Step 1: Upload Images
- Click "Browse files" or drag & drop one or more images of LEGO parts
- Supported formats: PNG, JPG, JPEG
- Multiple images can be uploaded at once

### Step 2: Select Image (if multiple)
- Use the image selector to switch between uploaded images
- Each image can be annotated individually

### Step 3: Mark Parts
- Use the drawing tool to draw rectangles around each LEGO part
- Each rectangle should contain exactly one part

### Step 4: Set Quantities
- For each marked part, set the quantity manually
- Or use the "Auto-detect" button to use OCR (if available)

### Step 5: Analyze
- Click "🚀 Analyze All Parts" to start recognition
- The API processes at 5 requests per second
- Wait for all parts to be processed (with progress indicator)

### Step 6: Review Results
- Switch to "Results" tab to see recognized parts
- Filter by image if multiple images were processed
- View part numbers, names, colors, and confidence scores

### Step 7: Export
- Click "📥 Export as CSV" to download all results
- CSV includes all parts from all images in a structured format

## 🔌 Brickognize API

This application uses the [Brickognize API](https://brickognize.com) for LEGO part recognition.

### API Rate Limit
- **Maximum**: 5 requests per second
- **Implementation**: 0.2 second delay between requests
- No daily/monthly limits

### API Endpoint
```
POST https://api.brickognize.com/predict
```

### Request Format
- `query_image`: Binary image data (multipart/form-data)
- `external_catalogs`: "bricklink" (for Bricklink IDs)
- `predict_color`: "true" (to enable color prediction)

### Response Format
```json
{
  "items": [
    {
      "id": "12345",
      "name": "Brick 2 x 4",
      "score": 0.95,
      "external_ids": {
        "bricklink": {
          "ext_ids": ["3001"]
        }
      },
      "candidate_colors": [
        {
          "name": "Red",
          "score": 0.92
        }
      ]
    }
  ]
}
```

### Rate Limiting
The application includes built-in rate limiting (default: 1 second between requests) to respect API usage limits.

## ⚙️ Configuration

### Flask Settings
Edit configuration in `flask_app.py` to customize:
- Theme colors
- Upload size limit
- Server settings

### API Settings
Adjust in the sidebar:
- **Rate Limit**: Delay between API calls (0.5-3.0 seconds)
- **Predict Color**: Enable/disable color prediction
- **OCR**: Enable/disable automatic quantity detection

## 🧪 Development

### Running Tests
```bash
# Install dev dependencies
pip install pytest pytest-asyncio

# Run tests
pytest
```

### Code Style
```bash
# Install formatters
pip install black isort

# Format code
black .
isort .
```

## 🐛 Troubleshooting

### OCR Not Working
- **Error**: "Tesseract OCR not available"
- **Solution**: Install Tesseract OCR on your system (see Prerequisites)

### API Errors
- **Error**: "API Error: 429"
- **Solution**: Increase rate limit delay in settings
- **Error**: "Request timeout"
- **Solution**: Check internet connection, try again

### Image Upload Issues
- **Error**: "File too large"
- **Solution**: Reduce image size or increase `maxUploadSize` in config.toml

### Docker Build Issues
- **Error**: "Can't find Tesseract"
- **Solution**: Rebuild image: `docker-compose build --no-cache`

## 📝 Export Format

CSV exports include the following columns:
- `part_number`: Bricklink part number
- `part_name`: Full part name
- `color`: Detected color
- `quantity`: Number of pieces
- `confidence`: Recognition confidence (0-100%)
- `x, y, width, height`: Bounding box coordinates

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- [Brickognize](https://brickognize.com) for the LEGO part recognition API
- [Flask](https://flask.palletsprojects.com/) for the web framework
- [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) for text recognition

## 📧 Support

For issues and questions:
- Open an issue on GitHub
- Check existing issues for solutions

## 🎉 Future Enhancements

- [ ] Multi-image batch processing
- [ ] Part database caching
- [ ] Advanced filtering and sorting
- [ ] Mobile-responsive design
- [ ] Multiple language support
- [ ] Part inventory management
- [ ] Integration with BrickLink/Rebrickable

---

**Made with ❤️ for LEGO enthusiasts**
