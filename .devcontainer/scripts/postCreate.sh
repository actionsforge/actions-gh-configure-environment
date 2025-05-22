#!/bin/bash
set -e

# Ensure bc is installed
sudo apt-get update && sudo apt-get install -y jq bc

# Print environment information
echo "🔍 Environment Information:"
echo "Node.js version: $(node -v)"
echo "npm version: $(npm -v)"
echo "TypeScript version: $(npx tsc --version)"
echo "Environment: ${NODE_ENV:-development}"

# Verify Node.js version
echo "🔍 Checking Node.js version..."
NODE_VERSION=$(node -v)
REQUIRED_VERSION="v20.10.0"
if [[ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]]; then
  echo "❌ Node.js version $NODE_VERSION is below required version $REQUIRED_VERSION"
  exit 1
fi
echo "✅ Node.js version $NODE_VERSION meets requirements"

# Install project dependencies
echo "📦 Installing project dependencies..."
npm install

# Install GitHub Actions specific tools
echo "🛠️ Installing GitHub Actions tools..."
npm install -g @vercel/ncc

# Verify ACT installation
echo "🔍 Verifying ACT installation..."
act --version

echo "✨ Development environment setup complete!"

if [ -f "package.json" ]; then
  echo "📦 Installing dependencies..."
  npm install

  echo "🔍 Running lint..."
  npm run lint

  echo "🔍 Type checking..."
  npm run type-check

  echo "🧪 Running tests with coverage..."
  # Run tests with coverage but skip upload
  npm test -- --coverage

  # Check coverage thresholds
  echo "📊 Checking test coverage thresholds..."
  COVERAGE_FILE="coverage/coverage-summary.json"
  if [ -f "$COVERAGE_FILE" ]; then
    # Extract coverage percentages
    STATEMENTS=$(jq '.total.statements.pct' "$COVERAGE_FILE")
    BRANCHES=$(jq '.total.branches.pct' "$COVERAGE_FILE")
    FUNCTIONS=$(jq '.total.functions.pct' "$COVERAGE_FILE")
    LINES=$(jq '.total.lines.pct' "$COVERAGE_FILE")

    # Define thresholds
    THRESHOLD=80

    # Check against thresholds
    FAILED=0
    if (($(echo "$STATEMENTS < $THRESHOLD" | bc -l))); then
      echo "❌ Statement coverage ($STATEMENTS%) is below threshold ($THRESHOLD%)"
      FAILED=1
    fi
    if (($(echo "$BRANCHES < $THRESHOLD" | bc -l))); then
      echo "❌ Branch coverage ($BRANCHES%) is below threshold ($THRESHOLD%)"
      FAILED=1
    fi
    if (($(echo "$FUNCTIONS < $THRESHOLD" | bc -l))); then
      echo "❌ Function coverage ($FUNCTIONS%) is below threshold ($THRESHOLD%)"
      FAILED=1
    fi
    if (($(echo "$LINES < $THRESHOLD" | bc -l))); then
      echo "❌ Line coverage ($LINES%) is below threshold ($THRESHOLD%)"
      FAILED=1
    fi

    if [ "$FAILED" -eq 1 ]; then
      echo "⚠️ One or more coverage thresholds not met!"
      echo "Note: This is a local development environment. Coverage reports are not uploaded."
    else
      echo "✅ All coverage thresholds met!"
      echo "Statements: $STATEMENTS%"
      echo "Branches: $BRANCHES%"
      echo "Functions: $FUNCTIONS%"
      echo "Lines: $LINES%"
      echo "Note: This is a local development environment. Coverage reports are not uploaded."
    fi
  else
    echo "⚠️ Coverage file not found"
  fi

  echo "🔨 Building action..."
  npm run build

  echo "🔍 Verifying distribution..."
  if [ "$(git diff --ignore-space-at-eol dist/ | wc -l)" -gt "0" ]; then
    echo "⚠️ Detected uncommitted changes in dist/ directory"
    echo "Please run 'npm run build' and commit the changes"
    git diff
  else
    echo "✅ Distribution files are up to date"
  fi

  echo "🔒 Security audit (non-blocking)..."
  npm audit || echo "⚠️ Audit issues found, but continuing..."

  echo "📦 Checking dependencies..."
  npm outdated || echo "✅ All dependencies are up to date"

  echo "✅ Dev container setup complete!"
  echo "💡 Available commands:"
  echo "   - npm test: Run unit tests"
  echo "   - npm run test:coverage: Run tests with coverage"
  echo "   - npm run lint: Run ESLint"
  echo "   - npm run type-check: Run TypeScript checks"
  echo "   - npm run build: Build the action"
  echo "   - act: Run GitHub Actions locally"
  echo ""
  echo "💡 Environment variables:"
  echo "   - TEST_STAGE=quick|full: Control test depth"
  echo "   - NODE_ENV=development|production: Set environment"
fi
