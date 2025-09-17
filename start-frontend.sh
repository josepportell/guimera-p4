#!/bin/bash

echo "🔧 Building frontend for testing..."

cd frontend

# Try to build the project
echo "Building React application..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo "🚀 Starting frontend server on http://localhost:5173..."

    # Install serve if not already installed
    if ! command -v serve &> /dev/null; then
        echo "Installing serve globally..."
        npm install -g serve
    fi

    # Serve the built application
    serve -s dist -l 5173
else
    echo "❌ Build failed. Check the error messages above."
    echo "💡 Common fixes:"
    echo "   - Make sure all TypeScript imports are correct"
    echo "   - Check that all dependencies are installed"
    echo "   - Verify Node.js version compatibility"
fi