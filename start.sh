#!/bin/bash
# Build the React client first
cd client && npm install && npm run build
cd ..
# Start the Express server on port 5000 (serves both API and built frontend)
cd server && npm rebuild && npm run dev
