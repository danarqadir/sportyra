@echo off
set DATABASE_URL=postgresql://postgres@127.0.0.1:5432/sportyra
set SPORTYRA_ADMIN_TOKEN=IP5Sio6pELdaIsR0d2P1xcMBhStFndFWBF63uHVB0a0oWcyR_FD1Wz4eAIH6xMun
set PORT=3000
set NODE_ENV=development
set VITE_API_BASE_URL=http://localhost:3000
cd /d C:\Users\shwan\Downloads\Sportyra-News-production-ready-final\Sporty-News\artifacts\api-server
node --enable-source-maps dist\index.mjs
