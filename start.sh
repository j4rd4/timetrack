#!/bin/bash

echo "=============================================="
echo "   Spoustim TimeTracker s primym JSON zapisem"
echo "=============================================="
echo

# Přepnutí do adresáře skriptu
cd "$(dirname "$0")" || exit 1

# Otevření prohlížeče podle OS
open_browser() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        open http://localhost:3000
    elif command -v xdg-open >/dev/null 2>&1; then
        xdg-open http://localhost:3000 >/dev/null 2>&1 &
    fi
}

if command -v node >/dev/null 2>&1; then
    echo "Pouzivam Node.js server..."
    open_browser
    node server.js
    exit $?
fi

echo "CHYBA: Nebyl nalezen Node.js pro spusteni backendu."
exit 1