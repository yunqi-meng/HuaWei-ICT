FROM python:3.12-slim

WORKDIR /srv/api
COPY apps/api/requirements.txt apps/api/requirements.lock.txt ./
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.lock.txt
COPY apps/api/app ./app
COPY apps/web/src/data/hardwareCatalog.json /srv/web/src/data/hardwareCatalog.json
COPY knowledge /knowledge

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
