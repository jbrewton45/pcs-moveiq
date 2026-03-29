#!/bin/bash
set -e

cd server && npm install
cd ../client && npm install
cd ../server && npm run build
cd ../client && npm run build
