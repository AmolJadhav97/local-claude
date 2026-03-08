#!/bin/bash
# ============================================================
# create-secret.sh
# Creates the ANTHROPIC_API_KEY secret directly on your
# KIND cluster — your key NEVER touches GitHub.
# ============================================================

set -e

echo ""
echo "🔐 Claude Local — Kubernetes Secret Setup"
echo "=========================================="
echo ""
echo "This script creates your API key secret directly on the cluster."
echo "Your key is never written to any file or committed to Git."
echo ""

# Prompt for the key (hidden input)
read -s -p "Paste your Anthropic API key (sk-ant-...): " API_KEY
echo ""

# Validate it looks right
if [[ ! "$API_KEY" == sk-ant-* ]]; then
    echo "⚠️  Warning: Key doesn't start with 'sk-ant-'. Double-check it's correct."
fi

# Create namespace if it doesn't exist
kubectl create namespace claude-local --dry-run=client -o yaml | kubectl apply -f -

# Create the secret (or update it if already exists)
kubectl create secret generic claude-local-secrets \
  --namespace claude-local \
  --from-literal=ANTHROPIC_API_KEY="$API_KEY" \
  --dry-run=client -o yaml | kubectl apply -f -

echo ""
echo "✅ Secret created successfully on your KIND cluster."
echo "   Name:      claude-local-secrets"
echo "   Namespace: claude-local"
echo "   Key:       ANTHROPIC_API_KEY"
echo ""
echo "Your API key was never written to disk or Git. 🔒"
echo ""
