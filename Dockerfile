# Use an official Node.js runtime as a parent image
FROM node:18-alpine AS base

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (or pnpm-lock.yaml)
COPY package*.json pnpm-lock.yaml* ./

# Install dependencies
RUN npm install -g pnpm && pnpm install

# Build the application
RUN pnpm build

# Create a new stage for production
FROM node:18-alpine AS production

# Set the working directory in the container
WORKDIR /usr/src/app

# Create a non-root user to run the application
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package.json and package-lock.json for production dependencies
COPY package*.json pnpm-lock.yaml* ./

# Install only production dependencies
RUN npm install -g pnpm && pnpm install --prod

# Copy the built application from the base stage
COPY --from=base /usr/src/app/dist ./dist

# Copy any other necessary files
COPY drizzle ./drizzle

# Change ownership of the app directory to the nodejs user
RUN chown -R nodejs:nodejs /usr/src/app
USER nodejs

# Expose the port the app runs on
EXPOSE 4000

# Define the command to run the application
CMD ["pnpm", "start"]
