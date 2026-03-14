FROM node:20-alpine

# Install Docker CLI to allow orchestrating containers via the host's socket
RUN apk add --no-cache docker-cli docker-cli-compose


WORKDIR /app/hub-backend

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

EXPOSE 3001

CMD ["npm", "run", "start:prod"]
