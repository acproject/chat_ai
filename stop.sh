#!/bin/bash

# AI Chat Application Stop Script

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${RED}========================================${NC}"
echo -e "${RED}   AI Chat Application Stopper${NC}"
echo -e "${RED}========================================${NC}"

# Stop server
if [ -f "$PROJECT_ROOT/server.pid" ]; then
    SERVER_PID=$(cat "$PROJECT_ROOT/server.pid")
    if kill -0 $SERVER_PID 2>/dev/null; then
        kill $SERVER_PID
        echo -e "${GREEN}✓ Server stopped (PID: $SERVER_PID)${NC}"
    else
        echo "Server not running"
    fi
    rm "$PROJECT_ROOT/server.pid"
else
    echo "Server PID file not found"
fi

# Stop client
if [ -f "$PROJECT_ROOT/client.pid" ]; then
    CLIENT_PID=$(cat "$PROJECT_ROOT/client.pid")
    if kill -0 $CLIENT_PID 2>/dev/null; then
        kill $CLIENT_PID
        echo -e "${GREEN}✓ Client stopped (PID: $CLIENT_PID)${NC}"
    else
        echo "Client not running"
    fi
    rm "$PROJECT_ROOT/client.pid"
else
    echo "Client PID file not found"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}All processes stopped${NC}"
echo -e "${GREEN}========================================${NC}"