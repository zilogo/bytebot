# Base image
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Copy app source
COPY ./shared ./shared
COPY ./bytebot-agent-cc/ ./bytebot-agent-cc/

WORKDIR /app/bytebot-agent-cc

# Install dependencies
RUN npm install


RUN npm run build

# Create a non-root user to run the application
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Run the application
CMD ["npm", "run", "start:prod"] 


