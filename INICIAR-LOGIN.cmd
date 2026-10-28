@echo off
title UTN MCP Mendoza - Inicio de Sesion
cd /d "%~dp0"
echo ======================================================
echo    UTN MCP Mendoza - Inicio de Sesion (Campus, Autogestion, Webmail)
echo ======================================================
echo.
rem Con el MCP instalado globalmente se usa su comando; desde una copia del repositorio, npm.
where utn-mcp-mendoza >nul 2>&1
if %errorlevel%==0 (
  utn-mcp-mendoza login
) else (
  npm run login
)
pause
