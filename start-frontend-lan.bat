@echo off
set VITE_API_BASE_URL=http://192.168.1.104:3000
cd /d C:\Users\shwan\Downloads\Sportyra-News-production-ready-final\Sporty-News
pnpm --filter @workspace/sportyra dev
