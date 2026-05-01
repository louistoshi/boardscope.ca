#!/bin/bash
# BoardScope Launch Script
# Starts the local server and opens the app in your default browser

set -e

PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$PROJECT_DIR"

echo "🚀 BoardScope Launcher"
echo "════════════════════════════════════════"

# Check if port 8080 is already in use
if lsof -i :8080 > /dev/null 2>&1; then
    echo "⚠️  Port 8080 already in use"
    echo "Opening existing instance..."
    open http://localhost:8080
    exit 0
fi

# Start the server in background
echo "📡 Starting BoardScope server..."
npm start > /tmp/boardscope-server.log 2>&1 &
SERVER_PID=$!

# Wait for server to be ready
echo "⏳ Waiting for server to start..."
for i in {1..30}; do
    if curl -s http://localhost:8080 > /dev/null 2>&1; then
        echo "✅ Server ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Server failed to start"
        echo "Check /tmp/boardscope-server.log for details"
        kill $SERVER_PID 2>/dev/null || true
        exit 1
    fi
    sleep 0.2
done

# Open in default browser
echo "🌐 Opening in browser..."
open http://localhost:8080

echo ""
echo "📖 BoardScope is running!"
echo "════════════════════════════════════════"
echo "🔗 URL: http://localhost:8080"
echo "⏹️  To stop: Press Ctrl+C"
echo ""

# Keep server running and handle cleanup
trap "kill $SERVER_PID 2>/dev/null; echo '✓ Server stopped'; exit 0" SIGINT SIGTERM

wait $SERVER_PID
