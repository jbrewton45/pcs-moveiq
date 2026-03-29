#!/bin/bash
set -e

cd client && npm install && npm run build && cd ..
cd server && npm install && npm run dev
