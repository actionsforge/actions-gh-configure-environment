#!/bin/bash
set -e

# Get inputs
ACTION="${INPUT_ACTION:-create}"
ENVIRONMENT_NAME="$INPUT_ENVIRONMENT_NAME"
REVIEWERS="$INPUT_REVIEWERS"
WAIT_TIMER="$INPUT_WAIT_TIMER"
PREVENT_SELF_REVIEW="$INPUT_PREVENT_SELF_REVIEW"
DEPLOYMENT_BRANCH_POLICY="$INPUT_DEPLOYMENT_BRANCH_POLICY"

# Validate required inputs
if [ -z "$ENVIRONMENT_NAME" ]; then
  echo "::error::environment_name is required"
  exit 1
fi

# Validate action
if [ "$ACTION" != "create" ] && [ "$ACTION" != "delete" ]; then
  echo "::error::action must be either 'create' or 'delete'"
  exit 1
fi

# Run the Node.js script
node /usr/local/bin/configure-environment.js

# Check if the script failed
if [ $? -ne 0 ]; then
  echo "::error::Failed to $ACTION environment"
  exit 1
fi

echo "::notice::Successfully $ACTION environment '$ENVIRONMENT_NAME'"
