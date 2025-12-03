#!/bin/bash
#
# Quick PARA Benchmark Helper
# Convenience wrapper for generating test vaults and managing benchmarks
#
# Usage:
#   ./benchmark-helper.sh setup small
#   ./benchmark-helper.sh clean
#   ./benchmark-helper.sh status

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GENERATOR="$SCRIPT_DIR/generate-test-notes.py"
TEST_VAULT="/Users/mriechers/Library/Mobile Documents/iCloud~md~obsidian/Documents/Test Vault"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

function print_header() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  Quick PARA Performance Benchmark Helper${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

function check_python() {
    if ! command -v python3 &> /dev/null; then
        echo -e "${RED}❌ ERROR: python3 not found${NC}"
        echo "Please install Python 3 to use this script."
        exit 1
    fi
}

function check_vault() {
    if [ ! -d "$TEST_VAULT" ]; then
        echo -e "${RED}❌ ERROR: Test Vault not found at:${NC}"
        echo "   $TEST_VAULT"
        echo ""
        echo "Please create Test Vault in Obsidian first."
        exit 1
    fi
}

function count_test_notes() {
    # Count Test Note *.md files in Test Vault
    find "$TEST_VAULT" -name "Test Note *.md" 2>/dev/null | wc -l | tr -d ' '
}

function show_status() {
    echo -e "${YELLOW}Test Vault Status:${NC}"
    echo "  Location: $TEST_VAULT"

    if [ -d "$TEST_VAULT" ]; then
        echo -e "  ${GREEN}✓${NC} Vault exists"

        local count=$(count_test_notes)
        echo "  Test notes: $count"

        # Show breakdown by PARA folder
        echo ""
        echo "  Distribution:"
        for folder in "0 - INBOX" "1 - PROJECTS" "2 - AREAS" "3 - RESOURCES" "4 - ARCHIVE"; do
            local folder_count=$(find "$TEST_VAULT/$folder" -name "Test Note *.md" 2>/dev/null | wc -l | tr -d ' ')
            if [ "$folder_count" -gt 0 ]; then
                printf "    %-20s %s notes\n" "$folder:" "$folder_count"
            fi
        done
    else
        echo -e "  ${RED}✗${NC} Vault not found"
    fi
}

function setup_vault() {
    local size="$1"

    if [ -z "$size" ]; then
        echo -e "${RED}❌ ERROR: Vault size required${NC}"
        echo "Usage: $0 setup <small|medium|large|COUNT>"
        exit 1
    fi

    echo -e "${YELLOW}Setting up test vault: $size${NC}\n"

    # Check if it's a preset size or custom count
    case "$size" in
        small|medium|large)
            python3 "$GENERATOR" --size "$size"
            ;;
        [0-9]*)
            python3 "$GENERATOR" --count "$size"
            ;;
        *)
            echo -e "${RED}❌ ERROR: Invalid size: $size${NC}"
            echo "Valid options: small, medium, large, or a number (e.g., 100)"
            exit 1
            ;;
    esac
}

function clean_vault() {
    echo -e "${YELLOW}Cleaning test notes from Test Vault...${NC}\n"
    python3 "$GENERATOR" --clean
}

function show_help() {
    cat << EOF
Quick PARA Benchmark Helper

USAGE:
    $0 <command> [options]

COMMANDS:
    setup <size>    Generate test vault with specified size
                    Sizes: small (50), medium (500), large (1000)
                    Or specify a custom count: setup 250

    clean           Remove all test notes from Test Vault

    status          Show current Test Vault status

    help            Show this help message

EXAMPLES:
    $0 setup small          # Generate 50 test notes
    $0 setup medium         # Generate 500 test notes
    $0 setup 250            # Generate exactly 250 test notes
    $0 clean                # Remove all test notes
    $0 status               # Check current state

WORKFLOW:
    1. Generate test vault:     $0 setup small
    2. Open Test Vault in Obsidian
    3. Enable profiling in Quick PARA settings
    4. Run benchmarks (see docs/PERFORMANCE-PROFILING.md)
    5. Clean up:                $0 clean

SAFETY:
    This script only works with Test Vault to prevent accidental data loss.
    Your main MarkBrain vault is never touched.

EOF
}

# Main script logic
print_header
check_python
check_vault

command="${1:-help}"

case "$command" in
    setup)
        setup_vault "$2"
        echo ""
        show_status
        ;;
    clean)
        clean_vault
        echo ""
        show_status
        ;;
    status)
        show_status
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo -e "${RED}❌ Unknown command: $command${NC}\n"
        show_help
        exit 1
        ;;
esac

echo ""
