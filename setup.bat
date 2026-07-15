@echo off
echo Installing everything the bot needs. This can take a minute or two.
echo.
call npm install
echo.
echo Done installing. Registering the Discord slash commands...
call npm run deploy-commands
echo.
echo All set up! Next, double-click start.bat to run the bot and website.
pause
