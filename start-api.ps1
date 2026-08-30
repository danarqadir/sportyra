$env:DATABASE_URL="postgresql://postgres@127.0.0.1:5432/sportyra"
# SPORTYRA_ADMIN_TOKEN is loaded from .env - never hardcode secrets
$env:PORT="3000"
$env:NODE_ENV="development"
$env:VITE_API_BASE_URL="http://localhost:3000"
Set-Location "C:\Users\shwan\Downloads\Sportyra-News-production-ready-final\Sporty-News\artifacts\api-server"
node --enable-source-maps ./dist/index.mjs
