@echo off
chcp 65001 >nul
title YouTube サムネ・タイトル置き換え - インストール補助

echo ========================================
echo  YouTube サムネ・タイトル置き換え
echo  インストール補助
echo ========================================
echo.
echo  ブラウザを選んでください
echo    [1] Google Chrome
echo    [2] Microsoft Edge
echo.
choice /c 12 /n /m "番号を入力 (1 or 2): "

if errorlevel 2 (
    set "BROWSER=msedge"
    set "URL=edge://extensions"
    set "NAME=Edge"
) else (
    set "BROWSER=chrome"
    set "URL=chrome://extensions"
    set "NAME=Chrome"
)

rem このフォルダのパスをクリップボードへコピー(末尾の \ は除く)
set "DIR=%~dp0"
set "DIR=%DIR:~0,-1%"
echo %DIR%| clip

echo.
echo  %NAME% の拡張機能ページを開きます...
start "" %BROWSER% %URL%
start "" explorer "%DIR%"

echo.
echo  次の手順で導入してください:
echo    1. 右上(Edgeは左下)の「デベロッパーモード」をオンにする
echo    2. 「パッケージ化されていない拡張機能を読み込む」(Edgeは「展開して読み込み」)を押す
echo    3. このフォルダを選ぶ
echo       (フォルダのパスはコピー済みです。貼り付けも使えます)
echo    4. 開いているYouTubeのタブをF5で再読み込みする
echo.
echo  ※ 導入後にこのフォルダを移動・削除すると使えなくなります。
echo.
pause
