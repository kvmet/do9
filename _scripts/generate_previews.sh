# Configuration
MAX_WIDTH=800
QUALITY=85
INPUT_EXTENSIONS="jpg,jpeg,png,tiff"

# Print help if requested
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    echo "Usage: $0 [directory]"
    echo "If no directory is specified, uses current directory"
    exit 0
fi

# Use provided directory or current directory
SEARCH_DIR="${1:-.}"

# Convert quality (0-100) to ffmpeg's quality scale (2-31, lower is better)
# 85% JPG quality ≈ QP 5 in ffmpeg
FFMPEG_QUALITY=5

find "$SEARCH_DIR" -type f -regextype posix-extended \
    -regex ".*\.($INPUT_EXTENSIONS)$" \
    -not -name "*_preview.*" | while read -r file; do

    # Generate preview filename
    preview="${file%.*}_preview.jpg"

    # Skip if preview exists
    if [ -f "$preview" ]; then
        echo "Skip existing: $preview"
        continue
    fi

    echo "Processing: $file"

    # Create thumbnail
    # -n: never overwrite
    # -y: automatically overwrite
    ffmpeg -nostats -loglevel error -i "$file" \
        -vf "scale=min('$MAX_WIDTH',iw):'-1'" \
        -q:v "$FFMPEG_QUALITY" \
        -n "$preview"
done
