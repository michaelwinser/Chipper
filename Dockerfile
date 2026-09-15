# The cold-machine path: everything pinned inside, no version manager needed.
# Mirrors mise.toml — keep the major version in step.
FROM node:24-slim

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends make \
  && rm -rf /var/lib/apt/lists/*

# Dependencies first, so source edits do not reinstall them.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
ENV PORT=2447
EXPOSE 2447
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
