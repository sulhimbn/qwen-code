#!/usr/bin/env bash
set -euo pipefail

# GitHub Label Migration Script
# This script migrates existing labels to the new label system
# WARNING: Only run this after creating new labels!

REPO="${GITHUB_REPOSITORY:-QwenLM/qwen-code}"

# Color definitions - must match create-labels.sh
# Status colors (orange tones)
COLOR_STATUS_NEEDS_TRIAGE="ff9500"

# Type colors (multi-color)
COLOR_TYPE_BUG="d73a49"
COLOR_TYPE_FEATURE="0366d6"
COLOR_TYPE_DOCS="7057ff"
COLOR_TYPE_QUESTION="d876e3"
COLOR_TYPE_SUPPORT="28a745"

# Category colors (blue)
COLOR_CATEGORY="0052cc"

# Scope colors (dark blue)
COLOR_SCOPE="003d99"

echo "🔄 Migrating labels for repository: ${REPO}"

# Function to migrate a label (rename existing label)
migrate_label() {
    local old_name="$1"
    local new_name="$2"
    local description="$3"
    local color="$4"
    
    echo "Migrating: ${old_name} → ${new_name}"
    if gh label edit "${old_name}" --name "${new_name}" --description "${description}" --color "${color}" --repo "${REPO}" 2>/dev/null; then
        echo "✅ Migrated: ${old_name} → ${new_name}"
    else
        echo "⚠️  Failed to migrate or label doesn't exist: ${old_name}"
    fi
}

# Function to delete a label
delete_label() {
    local name="$1"
    
    echo "Deleting obsolete label: ${name}"
    if gh label delete "${name}" --yes --repo "${REPO}" 2>/dev/null; then
        echo "🗑️  Deleted: ${name}"
    else
        echo "ℹ️  Label doesn't exist or failed to delete: ${name}"
    fi
}

echo "📋 Migrating existing labels..."

# Migrate kind/* to type/*
migrate_label "kind/bug" "type/bug" "Something isn't working as expected" "${COLOR_TYPE_BUG}"
migrate_label "kind/feature-request" "type/feature-request" "New feature or enhancement request" "${COLOR_TYPE_FEATURE}"
migrate_label "kind/documentation" "type/documentation" "Documentation improvements or additions" "${COLOR_TYPE_DOCS}"
migrate_label "kind/question" "type/question" "Further information is requested" "${COLOR_TYPE_QUESTION}"
migrate_label "kind/support" "type/support" "User support and help requests" "${COLOR_TYPE_SUPPORT}"

# Migrate area/* to category/*
migrate_label "area/ux" "category/ui" "User interface and display" "${COLOR_CATEGORY}"
migrate_label "area/platform" "category/platform" "Platform compatibility" "${COLOR_CATEGORY}"
migrate_label "area/background" "category/core" "Core engine and logic" "${COLOR_CATEGORY}"
migrate_label "area/models" "category/core" "Core engine and logic" "${COLOR_CATEGORY}"
migrate_label "area/tools" "category/tools" "Tool integration and execution" "${COLOR_CATEGORY}"
migrate_label "area/core" "category/core" "Core engine and logic" "${COLOR_CATEGORY}"
migrate_label "area/contribution" "category/development" "Development experience" "${COLOR_CATEGORY}"
migrate_label "area/authentication" "category/authentication" "Authentication and authorization" "${COLOR_CATEGORY}"
migrate_label "area/security-privacy" "category/security" "Security and privacy" "${COLOR_CATEGORY}"
migrate_label "area/extensibility" "category/integration" "External integrations" "${COLOR_CATEGORY}"
migrate_label "area/performance" "category/performance" "Performance and optimization" "${COLOR_CATEGORY}"

# Migrate sub-area/* to scope/*
migrate_label "sub-area/cli" "scope/commands" "Command implementation" "${COLOR_SCOPE}"
migrate_label "sub-area/api" "scope/api-keys" "API key management" "${COLOR_SCOPE}"
migrate_label "sub-area/ui" "scope/components" "UI components and widgets" "${COLOR_SCOPE}"
migrate_label "sub-area/config" "scope/settings" "Settings and preferences" "${COLOR_SCOPE}"

# Update status labels to match new naming
migrate_label "status/need-triage" "status/needs-triage" "Needs to be triaged and labeled" "${COLOR_STATUS_NEEDS_TRIAGE}"

echo "🗑️  Cleaning up obsolete labels..."

# Delete legacy labels that have been replaced
delete_label "bug"
delete_label "enhancement" 
delete_label "documentation"
delete_label "question"

# Delete duplicate labels
delete_label "duplicate"
delete_label "invalid"
delete_label "wontfix"

echo "✅ Label migration completed!"
echo ""
echo "📊 Summary:"
echo "   - Migrated kind/* → type/*"
echo "   - Migrated area/* → category/*"
echo "   - Migrated sub-area/* → scope/*"
echo "   - Updated status label naming"
echo "   - Cleaned up obsolete legacy labels"
echo ""
echo "🔍 Next steps:"
echo "   1. Verify all labels are correctly applied"
echo "   2. Test the updated workflows"
echo "   3. Monitor issue triage effectiveness"
