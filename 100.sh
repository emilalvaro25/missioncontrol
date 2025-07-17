#!/bin/bash

# ==============================================================================
# Mission Control Static Site Generator
#
# Author: Alex, Full-Stack Developer
#
# Description:
# This script converts a single source HTML file into a structured, fully-static
# website. It performs the following actions:
#   1. Sets up a clean build directory ('dist/').
#   2. Downloads all external CSS and JavaScript assets.
#   3. Generates a static Tailwind CSS stylesheet based on classes in the source.
#   4. Extracts custom styles and combines all CSS into a single minified file.
#   5. Extracts the main JavaScript logic into its own file.
#   6. Creates the final, clean index.html linking to the static assets.
#   7. Cleans up all temporary files.
#
# Prerequisites:
#   - curl: For downloading assets.
#   - npm/npx: For running the Tailwind CSS CLI.
#
# Usage:
#   ./build.sh <source_html_file>
#
# Example:
#   chmod +x ./build.sh
#   ./build.sh './index (15).html'
# ==============================================================================

# --- Configuration ---
set -e # Exit immediately if a command exits with a non-zero status.
set -o pipefail # The return value of a pipeline is the status of the last command.

# Asset URLs from the source HTML
FONT_AWESOME_CSS_URL="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css"
GOOGLE_FONT_INTER_URL="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
GOOGLE_FONT_ROBOTO_URL="https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500&display=swap"
FIREBASE_APP_JS_URL="https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js"
FIREBASE_DB_JS_URL="https://www.gstatic.com/firebasejs/9.6.1/firebase-database-compat.js"
MARKDOWNIT_JS_URL="https://cdn.jsdelivr.net/npm/markdown-it@14.1.0/dist/markdown-it.min.js" # UMD version

# Build directories
BUILD_DIR="dist"
CSS_DIR="$BUILD_DIR/css"
JS_DIR="$BUILD_DIR/js"
ASSETS_DIR="$BUILD_DIR/assets/images"

# --- Script Functions ---

main() {
    validate_input "$@"
    check_dependencies

    local source_file="$1"

    setup_environment
    process_assets "$source_file"
    process_html "$source_file"
    
    cleanup
    
    echo "✅ Success! Static site built in '$BUILD_DIR/' directory."
}

validate_input() {
    if [ "$#" -ne 1 ]; then
        echo "❌ Error: Invalid number of arguments." >&2
        echo "Usage: $0 <source_html_file>" >&2
        exit 1
    fi
    if [ ! -f "$1" ]; then
        echo "❌ Error: Source file '$1' not found." >&2
        exit 1
    fi
}

check_dependencies() {
    command -v curl >/dev/null 2>&1 || { echo "❌ Error: 'curl' is required but not installed." >&2; exit 1; }
    command -v npx >/dev/null 2>&1 || { echo "❌ Error: 'npx' (part of npm) is required but not installed." >&2; exit 1; }
    echo "✅ Dependencies checked: curl, npx."
}

setup_environment() {
    echo "⚙️  Setting up build environment..."
    rm -rf "$BUILD_DIR"
    mkdir -p "$CSS_DIR" "$JS_DIR" "$ASSETS_DIR"
    
    # Create temporary working directory
    TEMP_DIR=$(mktemp -d)
    trap 'cleanup' EXIT # Ensure cleanup runs on exit
    
    echo "✅ Build directories created in '$BUILD_DIR/'."
}

cleanup() {
    if [ -d "$TEMP_DIR" ]; then
        rm -rf "$TEMP_DIR"
    fi
    # The trap will handle this, but we can call it at the end too.
}

process_assets() {
    local source_file="$1"
    echo "⚙️  Processing CSS and JavaScript assets..."
    
    # --- CSS Processing ---
    echo "   - Downloading external CSS..."
    curl -s -A "Mozilla/5.0" "$GOOGLE_FONT_INTER_URL" -o "$TEMP_DIR/fonts-inter.css"
    curl -s -A "Mozilla/5.0" "$GOOGLE_FONT_ROBOTO_URL" -o "$TEMP_DIR/fonts-roboto.css"
    curl -s -L "$FONT_AWESOME_CSS_URL" -o "$TEMP_DIR/fontawesome.css"

    echo "   - Extracting inline styles..."
    awk '/<style>/, /<\/style>/' "$source_file" | sed '1d;$d' | grep -v '@import' > "$TEMP_DIR/custom.css"
    
    echo "   - Generating Tailwind CSS..."
    echo "@tailwind base; @tailwind components; @tailwind utilities;" > "$TEMP_DIR/tailwind.in.css"
    npx tailwindcss -i "$TEMP_DIR/tailwind.in.css" --content "$source_file" -o "$TEMP_DIR/tailwind.out.css" --minify >/dev/null 2>&1

    echo "   - Bundling all CSS into '$CSS_DIR/styles.css'..."
    cat "$TEMP_DIR/fonts-inter.css" "$TEMP_DIR/fonts-roboto.css" "$TEMP_DIR/fontawesome.css" "$TEMP_DIR/tailwind.out.css" "$TEMP_DIR/custom.css" > "$CSS_DIR/styles.css"

    # --- JavaScript Processing ---
    echo "   - Downloading external JavaScript libraries..."
    curl -sL "$FIREBASE_APP_JS_URL" -o "$JS_DIR/firebase-app-compat.js"
    curl -sL "$FIREBASE_DB_JS_URL" -o "$JS_DIR/firebase-database-compat.js"
    curl -sL "$MARKDOWNIT_JS_URL" -o "$JS_DIR/markdown-it.min.js"
    
    echo "   - Extracting main application script to '$JS_DIR/main.js'..."
    # Extract, remove module line, and fix dynamic import
    awk '/<script type="module">/,/<\/script>/' "$source_file" | sed '1d;$d' \
    | sed "s|window.markdownit = (await import('https://cdn.jsdelivr.net/npm/markdown-it@14.1.0/+esm')).default;|// markdown-it is now loaded globally from markdown-it.min.js|" \
    > "$JS_DIR/main.js"

    echo "✅ Asset processing complete."
}

process_html() {
    local source_file="$1"
    echo "⚙️  Generating final '$BUILD_DIR/index.html'..."
    
    # Create the new HTML structure by replacing style/script blocks
    # 1. Start with the head content, up to the title
    awk '/<head>/, /<\/title>/' "$source_file" > "$BUILD_DIR/index.html"
    
    # 2. Add our new static CSS link
    echo '    <link rel="stylesheet" href="css/styles.css" />' >> "$BUILD_DIR/index.html"
    
    # 3. Add the rest of the file, filtering out the old blocks
    # Use awk state machine to filter out <style> and <script> blocks
    awk '
        # Skip these lines entirely
        /<script src="https:\/\/cdn.tailwindcss.com"><\/script>/ {next}
        /<link rel="stylesheet" href="https:\/\/cdnjs.cloudflare.com\/ajax\/libs\/font-awesome/ {next}
        
        # Filtering state
        /<\/head>/ {in_head=0}
        /<style>/ {in_style=1; next}
        /<\/style>/ {in_style=0; next}
        /<script src="https:\/\/www.gstatic.com/ {next}
        /<script type="module">/ {in_script=1; next}
        /<\/script>/ {if(in_script){in_script=0; next}}
        
        # Print lines that are not inside filtered blocks
        { if (!in_head && !in_style && !in_script) print }
        
        # Set initial state
        BEGIN {in_head=1; in_style=0; in_script=0}
    ' "$source_file" >> "$BUILD_DIR/index.html"

    # 4. Inject the new script tags before the closing </body> tag
    # Use a temp file for sed because in-place editing can be tricky across systems
    sed -i.bak '/<\/body>/i \
    \    <!-- Static JavaScript Libraries -->\
    <script src="js\/firebase-app-compat.js"><\/script>\
    <script src="js\/firebase-database-compat.js"><\/script>\
    <script src="js\/markdown-it.min.js"><\/script>\
    <!-- Main Application Logic -->\
    <script src="js\/main.js"><\/script>
    ' "$BUILD_DIR/index.html"
    rm "$BUILD_DIR/index.html.bak" # clean up sed backup file

    echo "✅ HTML generation complete."
}

# --- Execute Script ---
main "$@"