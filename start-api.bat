@echo off
set DATABASE_URL=postgresql://postgres@127.0.0.1:5432/sportyra
rem SPORTYRA_ADMIN_TOKEN is loaded from .env - never hardcode secrets
set PORT=3000
set NODE_ENV=development
set VITE_API_BASE_URL=http://localhost:3000
cd /d C:\Users\shwan\Downloads\Sportyra-News-production-ready-final\Sporty-News\artifacts\api-server
node --enable-source-maps dist\index.mjs
