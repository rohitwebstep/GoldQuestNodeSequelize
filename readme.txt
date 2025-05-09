1. git remote add karannode https://github.com/karan415/goldquest-node.git
2. git push karannode main --force

1. git remote add rohitnode https://github.com/rohitwebstep/goldquestreact.git
2. git push rohitnode main --force



----------------
<VirtualHost *:80>
    DocumentRoot /var/www/html
    DirectoryIndex index.html index.htm

    # Default directory settings
    <Directory /var/www/html>
        Options Indexes FollowSymLinks
        AllowOverride None
        Require all granted
    </Directory>

    # Reverse Proxy for React app
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/

    # Reverse Proxy for Node.js API
    # ProxyPass /api http://localhost:5000/
    # ProxyPassReverse /api http://localhost:5000/

    # Error and access logs
    ErrorLog ${APACHE_LOG_DIR}/error.log
    CustomLog ${APACHE_LOG_DIR}/access.log combined

    # Alias for phpMyAdmin (update with your actual phpMyAdmin path)
    Alias /phpmyadmin /usr/share/phpmyadmi

    # Remove or comment out the SSL redirection
    # RewriteEngine on
    # RewriteCond %{SERVER_NAME} =bgvadmin.goldquestglobal.in
    # RewriteRule ^ https://%{SERVER_NAME}%{REQUEST_URI} [END,NE,R=permanent]
</VirtualHost>


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