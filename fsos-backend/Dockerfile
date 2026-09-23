# The FSOS API. Listens on 8000 and is never exposed directly — nginx serves the app
# and proxies /api to it, so the browser only ever talks to one origin.
#
# No FSOS_DEV_LOGIN here. The app refuses to start if it's on with a non-localhost
# origin (app/config.py), which is deliberate: it accepts an email header in place of a
# token, so anyone who can reach it could be anyone.
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Run as nobody: the container holds the service key, which bypasses row-level
# security on every table.
RUN useradd --create-home --uid 10001 fsos
USER fsos

EXPOSE 8000

# One worker. Every route is I/O-bound against PostgREST and the team is ~26 people;
# add workers when there's a measurement saying to, not before.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
