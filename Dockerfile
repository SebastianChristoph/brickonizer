FROM python:3.11-slim

# Install system dependencies including Tesseract OCR
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    curl \
    tesseract-ocr \
    tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create directory for uploaded files
RUN mkdir -p /app/uploads

# Expose Flask port
EXPOSE 5000

# Health check
HEALTHCHECK CMD curl --fail http://localhost:5000/ || exit 1

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV FLASK_ENV=production

# Run Flask with 1 worker but 4 threads to allow parallel progress polling
# Threads share memory (including sessions dict), workers don't!
CMD ["gunicorn", "-w", "1", "--threads", "4", "-b", "0.0.0.0:5000", "--timeout", "300", "flask_app:app"]

