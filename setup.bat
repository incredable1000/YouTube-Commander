@echo off
echo YouTube Commander - Development Setup
echo =====================================
echo.

echo Installing Node.js dependencies...
npm install

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to install dependencies.
    echo Please make sure Node.js is installed and try again.
    echo.
    pause
    exit /b 1
)

echo.
echo Setup completed successfully!
echo.
echo To start development:
echo   npm run dev
echo.
echo To build for production:
echo   npm run build
echo.
pause
