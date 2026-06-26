#!/bin/bash

# AI Chat Application Startup Script

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   AI Chat Application Launcher${NC}"
echo -e "${BLUE}========================================${NC}"

# Kill existing processes
echo -e "${GREEN}Stopping existing processes...${NC}"
if [ -f "$PROJECT_ROOT/server.pid" ]; then
    OLD_PID=$(cat "$PROJECT_ROOT/server.pid")
    if kill -0 $OLD_PID 2>/dev/null; then
        kill $OLD_PID
        echo "Server stopped (PID: $OLD_PID)"
    fi
    rm "$PROJECT_ROOT/server.pid"
fi

if [ -f "$PROJECT_ROOT/client.pid" ]; then
    OLD_PID=$(cat "$PROJECT_ROOT/client.pid")
    if kill -0 $OLD_PID 2>/dev/null; then
        kill $OLD_PID
        echo "Client stopped (PID: $OLD_PID)"
    fi
    rm "$PROJECT_ROOT/client.pid"
fi

echo ""
echo -e "${GREEN}Starting Server (Port 3001)...${NC}"
cd "$PROJECT_ROOT/server"
npm run dev > "$PROJECT_ROOT/server.log" 2>&1 &
SERVER_PID=$!
echo $SERVER_PID > "$PROJECT_ROOT/server.pid"
echo "Server PID: $SERVER_PID"

# Wait for server to start
sleep 3

echo -e "${GREEN}Starting Client (Port 5177)...${NC}"
cd "$PROJECT_ROOT/client"
npm run dev > "$PROJECT_ROOT/client.log" 2>&1 &
CLIENT_PID=$!
echo $CLIENT_PID > "$PROJECT_ROOT/client.pid"
echo "Client PID: $CLIENT_PID"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Application started successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Server: http://localhost:3001"
echo "Client: http://localhost:5177"
echo ""
echo "Logs:"
echo "  Server: $PROJECT_ROOT/server.log"
echo "  Client: $PROJECT_ROOT/client.log"
echo ""
echo "To stop: ./stop.sh"