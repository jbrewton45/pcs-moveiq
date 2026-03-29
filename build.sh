#!/bin/bash
set -e

echo "Installing server dependencies..."
cd server
npm ci

echo "Building server..."
npm run build

echo "Installing client dependencies..."
cd ../client
npm ci

echo "Building client..."
npm run build

echo "Build complete."
