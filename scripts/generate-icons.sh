#!/bin/bash

# =============================================================================
# SkillsFan App Icon Generator
# Generates platform-specific icons from a source PNG (or SVG fallback)
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
RESOURCES_DIR="$PROJECT_ROOT/resources"
SOURCE_PNG="$RESOURCES_DIR/icon-source.png"
SOURCE_SVG="$RESOURCES_DIR/icon.svg"
ICONSET_DIR="$RESOURCES_DIR/icon.iconset"

echo "🎨 SkillsFan Icon Generator"
echo "======================"
echo ""

# Check for required tools
check_tools() {
    local missing=()

    if ! command -v convert &> /dev/null; then
        missing+=("ImageMagick (convert)")
    fi

    if [[ "$OSTYPE" == "darwin"* ]]; then
        if ! command -v iconutil &> /dev/null; then
            missing+=("iconutil")
        fi
    fi

    if [ ${#missing[@]} -ne 0 ]; then
        echo "❌ Missing required tools:"
        for tool in "${missing[@]}"; do
            echo "   - $tool"
        done
        echo ""
        echo "Install ImageMagick: brew install imagemagick"
        exit 1
    fi

    echo "✅ All required tools available"
}

# Generate PNG at specific size from source
generate_png() {
    local size=$1
    local output=$2

    if [ -f "$SOURCE_PNG" ]; then
        # Resize from PNG source (high quality)
        magick "$SOURCE_PNG" -resize "${size}x${size}" -strip "$output" 2>/dev/null || \
        convert "$SOURCE_PNG" -resize "${size}x${size}" -strip "$output" 2>/dev/null
    else
        # Fallback to SVG source
        magick -background none -density 300 "$SOURCE_SVG" -resize "${size}x${size}" -gravity center -extent "${size}x${size}" "$output" 2>/dev/null || \
        convert -background none -density 300 "$SOURCE_SVG" -resize "${size}x${size}" -gravity center -extent "${size}x${size}" "$output" 2>/dev/null
    fi
    echo "   Generated: $output (${size}x${size})"
}

# Generate macOS iconset
generate_macos_iconset() {
    echo ""
    echo "📱 Generating macOS iconset..."

    rm -rf "$ICONSET_DIR"
    mkdir -p "$ICONSET_DIR"

    # Required sizes for macOS iconset
    local sizes=(16 32 64 128 256 512 1024)

    for size in "${sizes[@]}"; do
        generate_png $size "$ICONSET_DIR/icon_${size}x${size}.png"

        # Retina versions (except for 1024)
        if [ $size -lt 512 ]; then
            local retina_size=$((size * 2))
            generate_png $retina_size "$ICONSET_DIR/icon_${size}x${size}@2x.png"
        fi
    done

    # Special case: 512@2x = 1024
    cp "$ICONSET_DIR/icon_1024x1024.png" "$ICONSET_DIR/icon_512x512@2x.png"

    echo ""
    echo "🍎 Creating macOS .icns file..."
    iconutil -c icns "$ICONSET_DIR" -o "$RESOURCES_DIR/icon.icns"
    echo "   Generated: $RESOURCES_DIR/icon.icns"

    # Cleanup iconset folder (optional, keep for reference)
    # rm -rf "$ICONSET_DIR"
}

# Generate Windows ICO
generate_windows_ico() {
    echo ""
    echo "🪟 Generating Windows .ico file..."

    local temp_dir="$RESOURCES_DIR/temp_ico"
    mkdir -p "$temp_dir"

    # Windows ICO sizes
    local sizes=(16 24 32 48 64 128 256)
    local png_files=()

    for size in "${sizes[@]}"; do
        local png_file="$temp_dir/icon_${size}.png"
        generate_png $size "$png_file"
        png_files+=("$png_file")
    done

    # Create ICO with all sizes
    convert "${png_files[@]}" "$RESOURCES_DIR/icon.ico"
    echo "   Generated: $RESOURCES_DIR/icon.ico"

    # Cleanup
    rm -rf "$temp_dir"
}

# Generate Linux PNGs
generate_linux_pngs() {
    echo ""
    echo "🐧 Generating Linux PNG files..."

    local linux_dir="$RESOURCES_DIR/linux"
    mkdir -p "$linux_dir"

    # Common Linux icon sizes
    local sizes=(16 24 32 48 64 128 256 512)

    for size in "${sizes[@]}"; do
        generate_png $size "$linux_dir/${size}x${size}.png"
    done

    # Also create a main icon.png at 512x512
    cp "$linux_dir/512x512.png" "$RESOURCES_DIR/icon.png"
    echo "   Generated: $RESOURCES_DIR/icon.png (512x512)"
}

# Generate tray template icon (macOS: black silhouette with alpha)
generate_tray_template() {
    local size=$1
    local output=$2
    local source="${SOURCE_PNG:-$SOURCE_SVG}"

    # Extract white petal shapes as a monochrome template:
    # 1. Resize source to target size
    # 2. Convert to grayscale - white petals stay bright, orange bg becomes dark
    # 3. Threshold at 85% - isolates only the white petals
    # 4. Use brightness as alpha channel with black fill
    # Result: black opaque petals on transparent background (macOS template format)
    magick "$source" -resize "${size}x${size}" \
        -colorspace Gray \
        -threshold 85% \
        -background black -alpha shape \
        "$output" 2>/dev/null || \
    convert "$source" -resize "${size}x${size}" \
        -colorspace Gray \
        -threshold 85% \
        -background black -alpha shape \
        "$output" 2>/dev/null

    echo "   Generated: $output (${size}x${size} template)"
}

# Generate tray icons (for system tray)
generate_tray_icons() {
    echo ""
    echo "🔔 Generating tray icons..."

    local tray_dir="$RESOURCES_DIR/tray"
    mkdir -p "$tray_dir"

    # Tray icon sizes (Windows/Linux - full color)
    generate_png 16 "$tray_dir/tray-16.png"
    generate_png 32 "$tray_dir/tray-16@2x.png"
    generate_png 24 "$tray_dir/tray-24.png"
    generate_png 48 "$tray_dir/tray-24@2x.png"

    # Template icons for macOS (black silhouette with alpha)
    generate_tray_template 22 "$tray_dir/trayTemplate.png"
    generate_tray_template 44 "$tray_dir/trayTemplate@2x.png"

    echo "   Generated tray icons in $tray_dir"
}

# Main execution
main() {
    if [ -f "$SOURCE_PNG" ]; then
        echo "Source: $SOURCE_PNG (PNG)"
    elif [ -f "$SOURCE_SVG" ]; then
        echo "Source: $SOURCE_SVG (SVG fallback)"
    else
        echo "❌ No source found. Place icon-source.png or icon.svg in resources/"
        exit 1
    fi
    echo "Output: $RESOURCES_DIR"
    echo ""

    check_tools

    generate_macos_iconset
    generate_windows_ico
    generate_linux_pngs
    generate_tray_icons

    echo ""
    echo "============================================"
    echo "✅ All icons generated successfully!"
    echo ""
    echo "Generated files:"
    echo "  - icon.icns     (macOS app icon)"
    echo "  - icon.ico      (Windows app icon)"
    echo "  - icon.png      (Linux/general use)"
    echo "  - linux/        (Linux multi-size)"
    echo "  - tray/         (System tray icons)"
    echo "  - icon.iconset/ (macOS iconset source)"
    echo ""
    echo "To rebuild icons, place your new icon-source.png (or icon.svg)"
    echo "in resources/ and run this script again."
    echo "============================================"
}

main "$@"
