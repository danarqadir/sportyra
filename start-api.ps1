$env:DATABASE_URL="postgresql://postgres@127.0.0.1:5432/sportyra"
$env:SPORTYRA_ADMIN_TOKEN="IP5Sio6pELdaIsR0d2P1xcMBhStFndFWBF63uHVB0a0oWcyR_FD1Wz4eAIH6xMun"
$env:PORT="3000"
$env:NODE_ENV="development"
$env:VITE_API_BASE_URL="http://localhost:3000"
Set-Location "C:\Users\shwan\Downloads\Sportyra-News-production-ready-final\Sporty-News\artifacts\api-server"
node --enable-source-maps ./dist/index.mjs
