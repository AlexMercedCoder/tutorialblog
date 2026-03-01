#!/bin/bash
# Publish 30 staging blog posts to content/blog/2026/
set -euo pipefail

ROOT="/home/alexmerced/development/personal/Personal/gatsblog"
STAGING="$ROOT/staging"
DEST="$ROOT/content/blog/2026"
DATE="2026-03-01"
AUTHOR="Alex Merced"

mkdir -p "$DEST"

total=0

publish_series() {
    local series_name="$1"
    local category="$2"
    local slug_prefix="$3"
    local tags="$4"
    local series_dir="$STAGING/$series_name"

    if [ ! -d "$series_dir" ]; then
        echo "SKIP: $series_dir not found"
        return
    fi

    echo "Processing: $series_name"

    for post_dir in "$series_dir"/*/; do
        [ -d "$post_dir" ] || continue
        local content_file="$post_dir/content.md"
        [ -f "$content_file" ] || { echo "  SKIP: No content.md in $post_dir"; continue; }

        local post_dir_name
        post_dir_name=$(basename "$post_dir")
        local post_number
        post_number=$(echo "$post_dir_name" | grep -oP '^\d+')

        # Extract title from H1 line
        local title
        title=$(grep -m1 '^# ' "$content_file" | sed 's/^# //')

        # Create slug from title
        local title_slug
        title_slug=$(echo "$title" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9 -]//g' | sed 's/ \+/-/g' | sed 's/-\+/-/g' | cut -c1-60 | sed 's/-$//')

        # Extract description: first non-empty, non-image paragraph after H1
        local description
        description=$(awk '
            /^# / { found_h1=1; next }
            found_h1 && /^$/ { next }
            found_h1 && /^!\[/ { next }
            found_h1 && /.+/ { 
                gsub(/\[([^\]]+)\]\([^)]+\)/, "\\1")
                gsub(/\*\*([^*]+)\*\*/, "\\1")
                gsub(/\*([^*]+)\*/, "\\1")
                gsub(/`([^`]+)`/, "\\1")
                if (length > 160) $0 = substr($0, 1, 157) "..."
                print
                exit
            }
        ' "$content_file")

        # Copy images
        local img_rel_dir="images/${series_name}/${post_number}"
        local img_dest_dir="$DEST/$img_rel_dir"
        mkdir -p "$img_dest_dir"

        local banner_image=""
        for img in "$post_dir"*.png "$post_dir"*.jpg "$post_dir"*.jpeg "$post_dir"*.gif "$post_dir"*.webp; do
            [ -f "$img" ] || continue
            local img_name
            img_name=$(basename "$img")
            cp "$img" "$img_dest_dir/$img_name"
            if [ -z "$banner_image" ]; then
                banner_image="./${img_rel_dir}/${img_name}"
            fi
        done

        if [ -z "$banner_image" ]; then
            banner_image="https://i.imgur.com/cpoMZQ8.png"
        fi

        local date_prefix="${DATE:0:7}"  # e.g. "2026-03"
        local filename="${date_prefix}-${slug_prefix}-${post_number}-${title_slug}.md"
        local dest_path="$DEST/$filename"

        # Build content: frontmatter + body (with H1 stripped and image refs updated)
        {
            echo "---"
            echo "title: \"$title\""
            echo "date: \"$DATE\""
            echo "description: \"$description\""
            echo "author: \"$AUTHOR\""
            echo "category: \"$category\""
            echo "bannerImage: \"$banner_image\""
            echo "tags:"
            echo "$tags"
            echo "---"
            echo ""
            # Strip H1 line, strip leading blank lines, update image references
            sed '0,/^# /{ /^# /d }' "$content_file" | \
                sed '/./,$!d' | \
                perl -pe "s|!\[([^\]]*)\]\((?!https?://)([^)]+)\)|![\1](${img_rel_dir}/\2)|g"
        } > "$dest_path"

        echo "  OK: $filename"
        total=$((total + 1))
    done
}

publish_series "AI_FEATURE_BLOGS" "AI Features" "ai" \
"  - dremio
  - AI
  - SQL
  - data lakehouse
  - machine learning"

publish_series "connector-blogs" "Dremio Connectors" "conn" \
"  - dremio
  - data integration
  - connectors
  - data lakehouse
  - federated queries"

echo ""
echo "Done: $total posts published to $DEST"
