#!/bin/bash
set -e

echo "🧪 Testing GitHub Action"

# Check if we're in a devcontainer
if [ -n "$DEVCONTAINER" ]; then
    echo "📦 Running in devcontainer environment"
fi

# Build the action
echo "📦 Building action..."
npm run build

# Test 1: Direct CLI test
echo "🔍 Testing CLI interface..."
node dist/index.cjs --help

# Test 2: Basic functionality test
echo "🔍 Testing basic functionality..."
node dist/index.cjs --token test-token --username test-user || {
    echo "⚠️ Basic functionality test failed (expected with test token)"
}

# Test 3: Run with act if available and Docker is accessible
if command -v act &> /dev/null; then
    if docker info &> /dev/null; then
        echo "🔍 Testing with act (local testing only)..."
        # Use -n to skip image selection and -P to specify the image
        # Pass inputs directly as command-line arguments
        act -n -W .github/workflows/test-action.yml workflow_dispatch \
            -P ubuntu-latest=nektos/act-environments-ubuntu:18.04 \
            --input username=test-user \
            --input token=test-token \
            --input limit=6 \
            --input min-views=0 || {
            echo "⚠️ act test failed (expected with test token)"
        }
    else
        echo "⚠️ Docker is not accessible. Skipping act tests."
        echo "To run act tests, ensure Docker is running and accessible."
    fi
else
    echo "⚠️ act not found. Skipping act tests."
    echo "To run act tests, ensure act is installed in your devcontainer."
fi

echo "✅ Tests completed"
echo "Note: For GitHub Actions workflow testing, use the workflow_dispatch interface in the GitHub UI"
