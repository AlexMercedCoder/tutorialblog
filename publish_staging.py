#!/usr/bin/env python3
"""
Publish 30 staging blog posts to content/blog/2026/.
- Extracts title from H1
- Generates frontmatter (date, description, author, category, tags, bannerImage)
- Copies images to content/blog/2026/images/{series}/{post-number}/
- Updates image references in markdown
- Writes final .md files to content/blog/2026/
"""

import os
import re
import shutil
import glob
import textwrap

ROOT = "/home/alexmerced/development/personal/Personal/gatsblog"
STAGING = os.path.join(ROOT, "staging")
DEST = os.path.join(ROOT, "content", "blog", "2026")
DATE = "2026-02-19"
AUTHOR = "Alex Merced"

# Series config: folder name -> (category, tags, series slug for filenames)
SERIES_CONFIG = {
    "data_modeling": {
        "category": "Data Modeling",
        "tags": [
            "data modeling",
            "data engineering",
            "data lakehouse",
            "star schema",
            "data architecture",
        ],
        "slug_prefix": "dm",
    },
    "debp": {
        "category": "Data Engineering",
        "tags": [
            "data engineering",
            "best practices",
            "data pipelines",
            "data quality",
            "data lakehouse",
        ],
        "slug_prefix": "debp",
    },
    "semantic_layer_seo": {
        "category": "Semantic Layer",
        "tags": [
            "semantic layer",
            "data governance",
            "analytics",
            "data engineering",
            "data lakehouse",
        ],
        "slug_prefix": "sl",
    },
}


def slugify(text):
    """Convert a title to a URL-friendly slug."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-")


def extract_title(content):
    """Extract title from the first H1 line."""
    for line in content.splitlines():
        line = line.strip()
        if line.startswith("# "):
            return line[2:].strip()
    return "Untitled"


def extract_description(content):
    """Extract first non-empty paragraph after the H1 as description."""
    lines = content.splitlines()
    past_h1 = False
    past_first_image = False
    for line in lines:
        stripped = line.strip()
        if not past_h1:
            if stripped.startswith("# "):
                past_h1 = True
            continue
        # Skip empty lines and image lines after H1
        if not stripped:
            continue
        if stripped.startswith("!["):
            past_first_image = True
            continue
        # First real paragraph
        # Clean markdown formatting for description
        desc = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", stripped)  # links
        desc = re.sub(r"\*\*([^*]+)\*\*", r"\1", desc)  # bold
        desc = re.sub(r"\*([^*]+)\*", r"\1", desc)  # italic
        desc = re.sub(r"`([^`]+)`", r"\1", desc)  # code
        # Truncate to ~160 chars
        if len(desc) > 160:
            desc = desc[:157].rsplit(" ", 1)[0] + "..."
        return desc
    return ""


def strip_h1(content):
    """Remove the first H1 line from content."""
    lines = content.splitlines()
    result = []
    h1_found = False
    for line in lines:
        if not h1_found and line.strip().startswith("# "):
            h1_found = True
            continue
        result.append(line)
    # Remove leading blank lines after stripping H1
    while result and not result[0].strip():
        result.pop(0)
    return "\n".join(result) + "\n"


def find_images(post_dir):
    """Find all image files (png, jpg, jpeg, gif, webp) in a post directory."""
    exts = ("*.png", "*.jpg", "*.jpeg", "*.gif", "*.webp")
    images = []
    for ext in exts:
        images.extend(glob.glob(os.path.join(post_dir, ext)))
    return sorted(images)


def build_frontmatter(title, description, category, tags, banner_image_path):
    """Build YAML frontmatter string."""
    # Escape quotes in title and description
    title_escaped = title.replace('"', '\\"')
    desc_escaped = description.replace('"', '\\"')
    
    tags_yaml = "\n".join(f"  - {tag}" for tag in tags)
    
    return f"""---
title: "{title_escaped}"
date: "{DATE}"
description: "{desc_escaped}"
author: "{AUTHOR}"
category: "{category}"
bannerImage: "{banner_image_path}"
tags:
{tags_yaml}
---
"""


def process_post(series_name, post_dir, config):
    """Process a single staging post directory."""
    content_path = os.path.join(post_dir, "content.md")
    if not os.path.exists(content_path):
        print(f"  SKIP: No content.md in {post_dir}")
        return None

    with open(content_path, "r") as f:
        content = f.read()

    # Extract metadata
    title = extract_title(content)
    description = extract_description(content)
    post_number = os.path.basename(post_dir).split("-")[0]  # "01", "02", etc.

    # Find images and determine banner
    images = find_images(post_dir)
    
    # Image destination directory (relative to content/blog/2026/)
    img_rel_dir = f"images/{series_name}/{post_number}"
    img_dest_dir = os.path.join(DEST, img_rel_dir)
    os.makedirs(img_dest_dir, exist_ok=True)

    # Copy images
    banner_image_rel = ""
    for img_path in images:
        img_name = os.path.basename(img_path)
        shutil.copy2(img_path, os.path.join(img_dest_dir, img_name))
        if not banner_image_rel:
            banner_image_rel = f"./{img_rel_dir}/{img_name}"  # first image as banner

    # If no images found, use default
    if not banner_image_rel:
        banner_image_rel = "https://i.imgur.com/cpoMZQ8.png"

    # Update image references in content
    body = strip_h1(content)
    
    # Replace relative image references like ![alt](image.png) with new path
    def replace_image_ref(match):
        alt = match.group(1)
        img_filename = match.group(2)
        # Only replace relative refs (not URLs)
        if img_filename.startswith("http://") or img_filename.startswith("https://"):
            return match.group(0)
        new_path = f"{img_rel_dir}/{img_filename}"
        return f"![{alt}]({new_path})"

    body = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", replace_image_ref, body)

    # Build frontmatter
    frontmatter = build_frontmatter(
        title, description, config["category"], config["tags"], banner_image_rel
    )

    # Build filename
    title_slug = slugify(title)[:60]  # cap slug length
    filename = f"2026-02-{config['slug_prefix']}-{post_number}-{title_slug}.md"
    dest_path = os.path.join(DEST, filename)

    # Write file
    with open(dest_path, "w") as f:
        f.write(frontmatter)
        f.write("\n")
        f.write(body)

    print(f"  ✓ {filename}")
    return dest_path


def main():
    os.makedirs(DEST, exist_ok=True)
    total = 0

    for series_name, config in sorted(SERIES_CONFIG.items()):
        series_dir = os.path.join(STAGING, series_name)
        if not os.path.isdir(series_dir):
            print(f"SKIP: Series directory {series_dir} not found")
            continue

        print(f"\n📁 Processing series: {series_name}")
        post_dirs = sorted(
            [
                d
                for d in os.listdir(series_dir)
                if os.path.isdir(os.path.join(series_dir, d))
            ]
        )

        for post_dir_name in post_dirs:
            post_dir = os.path.join(series_dir, post_dir_name)
            result = process_post(series_name, post_dir, config)
            if result:
                total += 1

    print(f"\n✅ Published {total} blog posts to {DEST}")


if __name__ == "__main__":
    main()
