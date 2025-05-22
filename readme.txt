rm -rf api.goldquestglobal.in
git clone https://github.com/rohitwebstep/GoldQuestNodeSequelize.git api.goldquestglobal.in
cd api.goldquestglobal.in
npm install
pm2 delete goldquestnode
pm2 start src/index.js --name "goldquestnode" -i max --max-memory-restart 800M --restart-delay 500
pm2 save
pm2 startup
pm2 list
pm2 logs goldquestnode