#!/bin/bash
export NODE_ENV=production
export PORT=${PORT:-5000}
node server/dist/index.js
