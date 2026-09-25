@echo off
setlocal
cd /d "%~dp0"

if not exist "backend\.venv\Scripts\python.exe" (
    echo Setting up the FastAPI backend environment...
    py -m venv backend\.venv
    if errorlevel 1 (
        echo Failed to create the Python environment. Make sure Python is installed.
        pause
        exit /b 1
    )
    backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
    if errorlevel 1 (
        echo Failed to install backend dependencies.
        pause
        exit /b 1
    )
)

if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    pushd frontend
    call npm install
    if errorlevel 1 (
        popd
        echo Failed to install frontend dependencies. Make sure Node.js and npm are installed.
        pause
        exit /b 1
    )
    popd
)

echo Starting FastAPI backend at http://localhost:8000 ...
start "Signal Clone Backend" /D "%~dp0backend" cmd /k ".venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000"

echo Starting Next.js frontend at http://localhost:3000 ...
start "Signal Clone Frontend" /D "%~dp0frontend" cmd /k "npm.cmd run dev"

echo Waiting for the development servers to start...
timeout /t 8 /nobreak >nul
start "" http://localhost:3000
echo Both services were started. Keep their terminal windows open while using the app.
endlocal
