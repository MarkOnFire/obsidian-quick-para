#!/bin/bash
#
# deploy.sh - Deploy Obsidian plugin to test or production vaults
#
# Usage:
#   ./deploy.sh [--test|--prod|--both] [--setup]
#
# Options:
#   --test    Deploy to test vault only (default)
#   --prod    Deploy to production vault only
#   --both    Deploy to both vaults
#   --setup   Configure vault paths interactively
#
# Configuration:
#   Vault paths are stored in .env.local (gitignored). Run --setup to configure.
#   Alternatively, set environment variables:
#   - OBSIDIAN_PROD_VAULT: Path to production vault
#   - OBSIDIAN_TEST_VAULT: Path to test vault

set -e

# ============================================================================
# CONFIGURATION
# ============================================================================

# Load configuration from .env.local if it exists (this file is gitignored)
if [ -f ".env.local" ]; then
    source .env.local
fi

# Fallback defaults (will prompt for setup if not configured)
PROD_VAULT="${OBSIDIAN_PROD_VAULT:-}"
TEST_VAULT="${OBSIDIAN_TEST_VAULT:-}"

# Plugin ID (folder name in .obsidian/plugins/)
# Defaults to the manifest.json id field, or current directory name
if [ -f "manifest.json" ]; then
    PLUGIN_ID=$(grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' manifest.json | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
fi
PLUGIN_ID="${PLUGIN_ID:-$(basename "$(pwd)")}"

# ============================================================================
# SCRIPT LOGIC
# ============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() { echo -e "${GREEN}✓${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_info() { echo -e "${BLUE}ℹ${NC} $1"; }

# Interactive setup function
run_setup() {
    echo ""
    echo "Obsidian Plugin Deployment Setup"
    echo "─────────────────────────────────────────"
    echo ""
    echo "This will configure your local vault paths."
    echo "The configuration is saved to .env.local (gitignored)."
    echo ""

    # Get test vault path
    echo "Enter the path to your TEST vault:"
    echo "(e.g., ~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Test Vault)"
    read -r -p "> " input_test_vault

    # Expand ~ to home directory
    input_test_vault="${input_test_vault/#\~/$HOME}"

    if [ ! -d "$input_test_vault" ]; then
        print_warning "Directory doesn't exist: $input_test_vault"
        read -r -p "Create it? [y/N] " create_test
        if [[ "$create_test" =~ ^[Yy]$ ]]; then
            mkdir -p "$input_test_vault"
            print_status "Created: $input_test_vault"
        fi
    fi

    echo ""
    echo "Enter the path to your PRODUCTION vault:"
    echo "(e.g., ~/Library/Mobile Documents/iCloud~md~obsidian/Documents/MarkBrain)"
    read -r -p "> " input_prod_vault

    # Expand ~ to home directory
    input_prod_vault="${input_prod_vault/#\~/$HOME}"

    if [ ! -d "$input_prod_vault" ]; then
        print_warning "Directory doesn't exist: $input_prod_vault"
        read -r -p "Create it? [y/N] " create_prod
        if [[ "$create_prod" =~ ^[Yy]$ ]]; then
            mkdir -p "$input_prod_vault"
            print_status "Created: $input_prod_vault"
        fi
    fi

    # Write to .env.local
    cat > .env.local << EOF
# Obsidian vault paths for plugin deployment
# This file is gitignored - safe to store local paths here

OBSIDIAN_TEST_VAULT="$input_test_vault"
OBSIDIAN_PROD_VAULT="$input_prod_vault"
EOF

    echo ""
    print_status "Configuration saved to .env.local"
    echo ""
    echo "You can now run ./deploy.sh to deploy your plugin."
    exit 0
}

# Check if setup is needed
check_setup() {
    if [ -z "$TEST_VAULT" ] && [ -z "$PROD_VAULT" ]; then
        print_warning "No vault paths configured."
        echo ""
        echo "Run './deploy.sh --setup' to configure vault paths,"
        echo "or set environment variables OBSIDIAN_TEST_VAULT and OBSIDIAN_PROD_VAULT."
        exit 1
    fi
}

# Parse arguments
TARGET="test"  # Default to test vault
while [[ $# -gt 0 ]]; do
    case $1 in
        --test) TARGET="test"; shift ;;
        --prod) TARGET="prod"; shift ;;
        --both) TARGET="both"; shift ;;
        --setup) run_setup; exit 0 ;;
        --help|-h)
            echo "Usage: ./deploy.sh [--test|--prod|--both] [--setup]"
            echo ""
            echo "Options:"
            echo "  --test    Deploy to test vault only (default)"
            echo "  --prod    Deploy to production vault only"
            echo "  --both    Deploy to both vaults"
            echo "  --setup   Configure vault paths interactively"
            echo ""
            echo "Configuration:"
            echo "  Vault paths are stored in .env.local (gitignored)."
            echo "  Run --setup to configure, or set environment variables:"
            echo "    OBSIDIAN_PROD_VAULT  Path to production vault"
            echo "    OBSIDIAN_TEST_VAULT  Path to test vault"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Ensure setup is done before deploying
check_setup

# Verify we're in a plugin directory
if [ ! -f "manifest.json" ]; then
    print_error "manifest.json not found. Run this script from the plugin directory."
    exit 1
fi

# Check if main.js exists (might need to build first)
if [ ! -f "main.js" ]; then
    if [ -f "package.json" ]; then
        print_warning "main.js not found. Building plugin..."
        npm run build
        if [ ! -f "main.js" ]; then
            print_error "Build failed - main.js still not found"
            exit 1
        fi
    else
        print_error "main.js not found and no package.json to build from"
        exit 1
    fi
fi

# Deploy function
deploy_to_vault() {
    local vault_path="$1"
    local vault_name="$2"
    local plugin_dir="$vault_path/.obsidian/plugins/$PLUGIN_ID"

    # Verify vault exists
    if [ ! -d "$vault_path" ]; then
        print_error "Vault not found: $vault_path"
        return 1
    fi

    # Create plugin directory if it doesn't exist
    mkdir -p "$plugin_dir"

    # Deploy core files
    rsync -av --quiet \
        main.js \
        manifest.json \
        "$plugin_dir/"

    # Deploy optional files if they exist
    [ -f "styles.css" ] && rsync -av --quiet styles.css "$plugin_dir/"
    [ -f "README.md" ] && rsync -av --quiet README.md "$plugin_dir/"

    print_status "Deployed to $vault_name: $plugin_dir"
}

echo ""
echo "Deploying plugin: $PLUGIN_ID"
echo "─────────────────────────────────────────"

# Deploy based on target
case $TARGET in
    test)
        deploy_to_vault "$TEST_VAULT" "Test Vault"
        ;;
    prod)
        deploy_to_vault "$PROD_VAULT" "Production Vault"
        ;;
    both)
        deploy_to_vault "$TEST_VAULT" "Test Vault"
        deploy_to_vault "$PROD_VAULT" "Production Vault"
        ;;
esac

echo ""
print_status "Deployment complete!"
echo ""
echo "Next steps:"
echo "  1. In Obsidian, go to Settings → Community Plugins"
echo "  2. Find '$PLUGIN_ID' and toggle it off then on"
echo "  3. Or restart Obsidian to reload all plugins"
echo ""
