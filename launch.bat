@echo off
chcp 65001 >nul
title ЭВОЛЮЦИЯ ОРУЖИЯ
echo.
echo  Запуск игры... Не закрывай это окно.
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0server.ps1"
echo.
echo  Сервер остановлен. Нажми любую клавишу для выхода.
pause >nul
