FROM python:3.11-slim

WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir --progress-bar off -r requirements.txt

# Copy application files
COPY . .

# Create database directory
RUN mkdir -p /app/data

# Expose port
EXPOSE 8000

# Run the application (no reload to avoid watchfiles issues)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
