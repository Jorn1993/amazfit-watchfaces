FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
RUN useradd -r -u 10001 polestar
USER polestar
EXPOSE 8879
CMD ["uvicorn","main:app","--host","0.0.0.0","--port","8879","--proxy-headers","--forwarded-allow-ips","127.0.0.1"]
