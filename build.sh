#!/bin/bash
set -e

cd server && npm install && npm run build && cd ..
cd client && npm install && npm run build && cd ..
