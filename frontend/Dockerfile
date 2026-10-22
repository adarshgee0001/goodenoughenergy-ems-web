FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Production: http://storedge.goodenough.energy
# Staging: http://10.10.10.245:5000
# Local: http://localhost:5000
ARG VITE_API_URL=http://storedge.goodenough.energy
ENV VITE_API_URL=${VITE_API_URL}


RUN npm run build

FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
