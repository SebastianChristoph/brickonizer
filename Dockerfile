FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements_flask.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements_flask.txt

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

# Run Flask
CMD ["python", "flask_app.py"]
