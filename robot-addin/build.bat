@echo off
echo ============================================================
echo   Building DiagridImporter for Robot 2026
echo ============================================================

set CSC=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe
set ROBOT_DLL="C:\Program Files\Autodesk\Robot Structural Analysis Professional 2026\Exe\Interop.RobotOM.dll"

if not exist %CSC% (
    echo ERROR: C# compiler not found at %CSC%
    pause
    exit /b 1
)

if not exist %ROBOT_DLL% (
    echo ERROR: Interop.RobotOM.dll not found at %ROBOT_DLL%
    echo Check your Robot installation path.
    pause
    exit /b 1
)

echo Compiling...
%CSC% /target:exe /platform:x64 /out:DiagridImporter.exe /reference:%ROBOT_DLL% /reference:System.Web.Extensions.dll /reference:System.Windows.Forms.dll DiagridImporter.cs

if %ERRORLEVEL% == 0 (
    echo.
    echo BUILD SUCCESSFUL: DiagridImporter.exe
    echo.
    echo Usage:
    echo   DiagridImporter.exe                    (opens file picker)
    echo   DiagridImporter.exe model.json         (loads directly)
    echo.
) else (
    echo.
    echo BUILD FAILED
)
pause
