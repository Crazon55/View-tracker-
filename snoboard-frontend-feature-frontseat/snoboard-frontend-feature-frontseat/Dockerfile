# Build stage
FROM node:20-alpine AS build

WORKDIR /app

ARG VITE_BASE_API_URL
ENV VITE_BASE_API_URL='https://snoboard-backend-32085867405.asia-south1.run.app'
ENV VITE_SUPABASE_URL='https://fxsfhooszmzpmwcaclsd.supabase.co'
ENV VITE_SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4c2Zob29zem16cG13Y2FjbHNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzNDU4NTEsImV4cCI6MjA4NTkyMTg1MX0.l_KXhMjIE7_GueM4SZQh5o_yTghDe1d8TCP7FxwIFDs'

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration for SPA routing
RUN echo 'server { \
    listen 8080; \
    server_name _; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    # Cache static assets \
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ { \
        expires 1y; \
        add_header Cache-Control "public, immutable"; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Expose port 8080 (Cloud Run requirement)
EXPOSE 8080

# Start nginx
CMD ["nginx", "-g", "daemon off;"]