#!/bin/bash

# Create necessary directories
mkdir -p data/snapshots
mkdir -p ssl
mkdir -p logs

# Set permissions
chmod 755 data
chmod 755 ssl
chmod 755 logs

echo "✅ Directories created successfully"
