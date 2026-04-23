#!/bin/bash
cd /home/z/my-project

# Kill any existing instances
pkill -f "next dev -p 3000" 2>/dev/null
sleep 2

# Start the server
exec node node_modules/.bin/next dev -p 3000
