#!/usr/bin/env bash
set -euo pipefail

# GitHub Label Management Script
# This script creates all labels for the new label system
# WARNING: Only run this after updating all workflows!

REPO="${GITHUB_REPOSITORY:-QwenLM/qwen-code}"

# Color definitions - organized by category
# Status colors (orange tones)
COLOR_STATUS_NEEDS_TRIAGE="ff9500"
COLOR_STATUS_IN_PROGRESS="ff7b00"
COLOR_STATUS_IN_REVIEW="e6a23c"
COLOR_STATUS_BLOCKED="d73a49"
COLOR_STATUS_WAITING="f0ad4e"
COLOR_STATUS_NEED_INFO="ff8c42"
COLOR_STATUS_NEED_RETEST="ff6b35"
COLOR_STATUS_STALE="cccccc"
COLOR_STATUS_READY="28a745"
COLOR_STATUS_ON_HOLD="6c757d"

# Type colors (multi-color)
COLOR_TYPE_BUG="d73a49"
COLOR_TYPE_FEATURE="0366d6"
COLOR_TYPE_DOCS="7057ff"
COLOR_TYPE_QUESTION="d876e3"
COLOR_TYPE_SUPPORT="28a745"

# Priority colors (red gradient)
COLOR_PRIORITY_P0="b60205"
COLOR_PRIORITY_P1="d93f0b"
COLOR_PRIORITY_P2="fbca04"
COLOR_PRIORITY_P3="0e8a16"

# Category colors (blue)
COLOR_CATEGORY="0052cc"

# Scope colors (dark blue)
COLOR_SCOPE="003d99"

echo "🏷️  Creating labels for repository: ${REPO}"

# Function to create a label if it doesn't exist
create_label() {
    local name="$1"
    local description="$2"
    local color="$3"
    
    echo "Creating label: ${name}"
    if gh label create "${name}" --description "${description}" --color "${color}" --repo "${REPO}" 2>/dev/null; then
        echo "✅ Created: ${name}"
    else
        echo "ℹ️  Label already exists or failed to create: ${name}"
    fi
}

echo "📋 Creating Status labels (orange tones)..."
create_label "status/needs-triage" "Needs to be triaged and labeled" "${COLOR_STATUS_NEEDS_TRIAGE}"
create_label "status/in-progress" "Currently being worked on" "${COLOR_STATUS_IN_PROGRESS}"
create_label "status/in-review" "Under review or discussion" "${COLOR_STATUS_IN_REVIEW}"
create_label "status/blocked" "Blocked by external dependency" "${COLOR_STATUS_BLOCKED}"
create_label "status/waiting-for-feedback" "Waiting for user/maintainer feedback" "${COLOR_STATUS_WAITING}"
create_label "status/need-information" "More information needed" "${COLOR_STATUS_NEED_INFO}"
create_label "status/need-retesting" "Needs retesting on latest version" "${COLOR_STATUS_NEED_RETEST}"
create_label "status/stale" "No activity for extended period" "${COLOR_STATUS_STALE}"
create_label "status/ready-for-merge" "Ready to be merged" "${COLOR_STATUS_READY}"
create_label "status/on-hold" "Temporarily paused" "${COLOR_STATUS_ON_HOLD}"

echo "🔍 Creating Type labels (multi-color)..."
create_label "type/bug" "Something isn't working as expected" "${COLOR_TYPE_BUG}"
create_label "type/feature-request" "New feature or enhancement request" "${COLOR_TYPE_FEATURE}"
create_label "type/documentation" "Documentation improvements or additions" "${COLOR_TYPE_DOCS}"
create_label "type/question" "Further information is requested" "${COLOR_TYPE_QUESTION}"
create_label "type/support" "User support and help requests" "${COLOR_TYPE_SUPPORT}"

echo "🔥 Creating Priority labels (red gradient)..."
create_label "priority/P0" "Critical/Blocker - Catastrophic failure requiring immediate attention" "${COLOR_PRIORITY_P0}"
create_label "priority/P1" "High Priority - Serious issue with significant user impact" "${COLOR_PRIORITY_P1}"
create_label "priority/P2" "Medium Priority - Moderate impact with available workaround" "${COLOR_PRIORITY_P2}"
create_label "priority/P3" "Low Priority - Minor issue, cosmetic, nice-to-fix" "${COLOR_PRIORITY_P3}"

echo "🔵 Creating Category labels (blue)..."
create_label "category/cli" "Command line interface and interaction" "${COLOR_CATEGORY}"
create_label "category/core" "Core engine and logic" "${COLOR_CATEGORY}"
create_label "category/ui" "User interface and display" "${COLOR_CATEGORY}"
create_label "category/authentication" "Authentication and authorization" "${COLOR_CATEGORY}"
create_label "category/tools" "Tool integration and execution" "${COLOR_CATEGORY}"
create_label "category/configuration" "Configuration management" "${COLOR_CATEGORY}"
create_label "category/integration" "External integrations" "${COLOR_CATEGORY}"
create_label "category/platform" "Platform compatibility" "${COLOR_CATEGORY}"
create_label "category/performance" "Performance and optimization" "${COLOR_CATEGORY}"
create_label "category/security" "Security and privacy" "${COLOR_CATEGORY}"
create_label "category/telemetry" "Telemetry and analytics" "${COLOR_CATEGORY}"
create_label "category/development" "Development experience" "${COLOR_CATEGORY}"

echo "🔷 Creating Scope labels (dark blue)..."

# CLI related scopes
create_label "scope/commands" "Command implementation" "${COLOR_SCOPE}"
create_label "scope/interactive" "Interactive CLI features" "${COLOR_SCOPE}"
create_label "scope/non-interactive" "Non-interactive mode" "${COLOR_SCOPE}"
create_label "scope/keybindings" "Keyboard shortcuts and bindings" "${COLOR_SCOPE}"

# Core related scopes
create_label "scope/content-generation" "AI content generation" "${COLOR_SCOPE}"
create_label "scope/token-management" "Token handling and limits" "${COLOR_SCOPE}"
create_label "scope/session-management" "Session state and persistence" "${COLOR_SCOPE}"
create_label "scope/model-switching" "Model selection and switching" "${COLOR_SCOPE}"

# UI related scopes
create_label "scope/themes" "Theme system and customization" "${COLOR_SCOPE}"
create_label "scope/components" "UI components and widgets" "${COLOR_SCOPE}"
create_label "scope/rendering" "Display and rendering logic" "${COLOR_SCOPE}"
create_label "scope/markdown" "Markdown parsing and display" "${COLOR_SCOPE}"

# Authentication related scopes
create_label "scope/oauth" "OAuth authentication flows" "${COLOR_SCOPE}"
create_label "scope/api-keys" "API key management" "${COLOR_SCOPE}"
create_label "scope/token-storage" "Token storage and retrieval" "${COLOR_SCOPE}"
create_label "scope/google-auth" "Google-specific authentication" "${COLOR_SCOPE}"

# Tools related scopes
create_label "scope/mcp" "Model Context Protocol" "${COLOR_SCOPE}"
create_label "scope/shell" "Shell command execution" "${COLOR_SCOPE}"
create_label "scope/file-operations" "File system operations" "${COLOR_SCOPE}"
create_label "scope/web-search" "Web search functionality" "${COLOR_SCOPE}"
create_label "scope/memory" "Memory and context management" "${COLOR_SCOPE}"
create_label "scope/git" "Git integration features" "${COLOR_SCOPE}"

# Configuration related scopes
create_label "scope/settings" "Settings and preferences" "${COLOR_SCOPE}"
create_label "scope/extensions" "Extension configuration" "${COLOR_SCOPE}"
create_label "scope/trusted-folders" "Trusted folder management" "${COLOR_SCOPE}"
create_label "scope/sandbox" "Sandbox configuration" "${COLOR_SCOPE}"

# Integration related scopes
create_label "scope/ide" "IDE integration general" "${COLOR_SCOPE}"
create_label "scope/vscode" "VSCode extension specific" "${COLOR_SCOPE}"
create_label "scope/zed" "Zed editor integration" "${COLOR_SCOPE}"
create_label "scope/github-actions" "GitHub Actions integration" "${COLOR_SCOPE}"

# Platform related scopes
create_label "scope/installation" "Installation process" "${COLOR_SCOPE}"
create_label "scope/macos" "macOS specific issues" "${COLOR_SCOPE}"
create_label "scope/windows" "Windows specific issues" "${COLOR_SCOPE}"
create_label "scope/linux" "Linux specific issues" "${COLOR_SCOPE}"
create_label "scope/packaging" "Package distribution" "${COLOR_SCOPE}"

# Performance related scopes
create_label "scope/latency" "Response time optimization" "${COLOR_SCOPE}"
create_label "scope/memory-usage" "Memory consumption" "${COLOR_SCOPE}"
create_label "scope/model-performance" "AI model performance" "${COLOR_SCOPE}"
create_label "scope/caching" "Caching mechanisms" "${COLOR_SCOPE}"

# Security related scopes
create_label "scope/data-privacy" "Data privacy concerns" "${COLOR_SCOPE}"
create_label "scope/credential-security" "Credential security" "${COLOR_SCOPE}"
create_label "scope/vulnerability" "Security vulnerabilities" "${COLOR_SCOPE}"

# Telemetry related scopes
create_label "scope/metrics" "Metrics collection" "${COLOR_SCOPE}"
create_label "scope/logging" "Logging systems" "${COLOR_SCOPE}"
create_label "scope/analytics" "Usage analytics" "${COLOR_SCOPE}"

# Development related scopes
create_label "scope/build-system" "Build and compilation" "${COLOR_SCOPE}"
create_label "scope/testing" "Test frameworks and cases" "${COLOR_SCOPE}"
create_label "scope/ci-cd" "Continuous integration/deployment" "${COLOR_SCOPE}"
create_label "scope/documentation" "Documentation tooling" "${COLOR_SCOPE}"

echo "✅ Label creation completed!"
echo ""
echo "⚠️  IMPORTANT: Before running this script, make sure:"
echo "   1. All GitHub Actions workflows have been updated"
echo "   2. Issue templates have been updated"
echo "   3. You have reviewed the label migration plan"
echo ""
echo "🔄 Next steps:"
echo "   1. Run migrate-labels.sh to update existing issues"
echo "   2. Verify all labels are correctly applied"
