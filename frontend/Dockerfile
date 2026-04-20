FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

# Run in dev mode for now to keep HMR and easy updates
CMD ["npm", "run", "dev", "--", "--host"]
