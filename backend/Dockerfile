# The API (and, from Phase 5, the worker). Built by deploy/docker-compose.prod.yml.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

# Dependencies first, so code changes don't reinstall them.
COPY pyproject.toml ./
RUN mkdir app && touch app/__init__.py && pip install . && rm -rf app

# The local embedding model (~470 MB), fetched once into its own layer (FR-41). The script needs
# only fastembed, so code changes don't download it again.
ENV LOCAL_EMBEDDING_CACHE_DIR=/opt/models
COPY app/ai/local_models.py /tmp/local_models.py
RUN python /tmp/local_models.py intfloat/multilingual-e5-small /opt/models \
    && chmod -R a+rX /opt/models && rm /tmp/local_models.py

COPY . .
RUN pip install --no-deps . && useradd --create-home --uid 10001 voxlace
USER voxlace

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
