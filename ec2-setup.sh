#!/bin/bash
# EC2 t3.small Setup & Deployment Script for SignalSnatch Trade Analysis Engine
set -e

echo "=== 1. Setting up 2GB Swap Memory (Prevents Linux OOM Killer on t3.small) ==="
if [ ! -f /swapfile ]; then
  sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab
  echo "2GB Swap File Enabled!"
else
  echo "Swap file already configured."
fi

echo "=== 2. System Resource Limits & Node Environment ==="
export NODE_OPTIONS="--max-old-space-size=1536"

echo "=== 3. Installing dependencies & building frontend ==="
npm install
npm run build

echo "=== 4. Starting Server via PM2 or Direct Node ==="
if command -v pm2 &> /dev/null; then
  pm2 start ecosystem.config.cjs || pm2 restart signalsnatch-app
  pm2 save
  echo "Application started with PM2! View logs with: pm2 logs signalsnatch-app"
else
  echo "Starting application with npm run start:ec2..."
  npm run start:ec2
fi
