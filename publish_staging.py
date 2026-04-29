#!/usr/bin/env python3
"""
Publish staging blog posts to content/blog/2026/.
- Extracts title from H1
- Generates frontmatter (date, description, author, category, tags, bannerImage)
- Copies images to content/blog/2026/images/{series}/{post-number}/
- Updates image references in markdown
- Handles two-pass linking to convert relative paths to final Gatsby slugs
- Writes final .md files to content/blog/2026/
"""

import os
import re
import shutil
import glob
import textwrap

ROOT = os.path.dirname(os.path.abspath(__file__))
STAGING = os.path.join(ROOT, "staging")
DEST = os.path.join(ROOT, "content", "blog", "2026")
DATE = "2026-04-29"
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
    "apache-lakehouse": {
        "category": "Data Lakehouse",
        "tags": [
            "apache",
            "lakehouse",
            "data engineering",
            "dremio",
            "parquet",
            "iceberg",
            "polaris",
            "arrow"
        ],
        "slug_prefix": "al",
    },
    "apache-iceberg-masterclass": {
        "category": "Apache Iceberg",
        "tags": [
            "apache iceberg",
            "data lakehouse",
            "data engineering",
            "table formats",
        ],
        "slug_prefix": "ib",
    },
    "query-engine-optimization": {
        "category": "Query Engines",
        "tags": [
            "query engines",
            "databases",
            "optimization",
            "data engineering",
            "distributed systems",
        ],
        "slug_prefix": "qeo",
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
        if not stripped:
            continue
        if stripped.startswith("!["):
            past_first_image = True
            continue
        desc = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", stripped)
        desc = re.sub(r"\*\*([^*]+)\*\*", r"\1", desc)
        desc = re.sub(r"\*([^*]+)\*", r"\1", desc)
        desc = re.sub(r"`([^`]+)`", r"\1", desc)
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
    while result and not result[0].strip():
        result.pop(0)
    return "\n".join(result) + "\n"

def find_images(post_dir):
    """Find all image files in a post directory."""
    exts = ("*.png", "*.jpg", "*.jpeg", "*.gif", "*.webp")
    images = []
    for ext in exts:
        images.extend(glob.glob(os.path.join(post_dir, ext)))
    return sorted(images)

def build_frontmatter(title, description, category, tags, banner_image_path):
    """Build YAML frontmatter string."""
    title_escaped = title.replace('"', '\\"')
    desc_escaped = description.replace('"', '\\"')
    tags_yaml = "\n".join(f"  - {tag}" for tag in tags)
    
    return f'''---
title: "{title_escaped}"
date: "{DATE}"
description: "{desc_escaped}"
author: "{AUTHOR}"
category: "{category}"
bannerImage: "{banner_image_path}"
tags:
{tags_yaml}
---
'''

def compute_post_info(series_name, post_dir_name, config, content):
    """Computes the target file name and Gatsby slug."""
    title = extract_title(content)
    post_number = post_dir_name.split("-")[0]
    title_slug = slugify(title)[:60]
    filename = f"{DATE[:7]}-{config['slug_prefix']}-{post_number}-{title_slug}.md"
    slug = f"/2026/{filename[:-3]}/"
    return filename, slug, title

def pass_one(series_config):
    """First pass: compute all destination URLs for all posts in all configured series."""
    # Mapping of series_name -> { post_dir_name: slug }
    link_mapping = {}
    
    for series_name, config in series_config.items():
        series_dir = os.path.join(STAGING, series_name)
        if not os.path.isdir(series_dir):
            continue
            
        link_mapping[series_name] = {}
        post_dirs = sorted([d for d in os.listdir(series_dir) if os.path.isdir(os.path.join(series_dir, d))])
        
        for post_dir_name in post_dirs:
            post_dir = os.path.join(series_dir, post_dir_name)
            content_path = os.path.join(post_dir, "content.md")
            if not os.path.exists(content_path):
                continue
                
            with open(content_path, "r") as f:
                content = f.read()
            
            _, slug, _ = compute_post_info(series_name, post_dir_name, config, content)
            link_mapping[series_name][post_dir_name] = slug
            
    return link_mapping

def process_post(series_name, post_dir_name, config, link_mapping):
    """Process a single post directory."""
    post_dir = os.path.join(STAGING, series_name, post_dir_name)
    content_path = os.path.join(post_dir, "content.md")
    if not os.path.exists(content_path):
        return None

    with open(content_path, "r") as f:
        content = f.read()

    title = extract_title(content)
    description = extract_description(content)
    post_number = post_dir_name.split("-")[0]

    images = find_images(post_dir)
    img_rel_dir = f"images/{series_name}/{post_number}"
    img_dest_dir = os.path.join(DEST, img_rel_dir)
    os.makedirs(img_dest_dir, exist_ok=True)

    banner_image_rel = ""
    for img_path in images:
        img_name = os.path.basename(img_path)
        shutil.copy2(img_path, os.path.join(img_dest_dir, img_name))
        if not banner_image_rel:
            banner_image_rel = f"./{img_rel_dir}/{img_name}"

    if not banner_image_rel:
        banner_image_rel = "https://i.imgur.com/cpoMZQ8.png"

    body = strip_h1(content)
    
    # Replace relative image references
    def replace_image_ref(match):
        alt = match.group(1)
        img_filename = match.group(2)
        if img_filename.startswith("http://") or img_filename.startswith("https://"):
            return match.group(0)
        new_path = f"{img_rel_dir}/{img_filename}"
        return f"![{alt}]({new_path})"

    body = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", replace_image_ref, body)

    # Replace relative markdown links like ../<folder>/content.md
    def replace_md_link(match):
        link_text = match.group(1)
        link_target = match.group(2)
        
        # Check if it's a link to README
        if link_target == "../README.md" or link_target == "README.md":
            # Link to the tag page instead
            tag_slug = slugify(config["tags"][0])
            return f"[{link_text}](/tags/{tag_slug}/)"
            
        # Match ../folder-name/content.md
        target_match = re.search(r"\.\./([^/]+)/content\.md", link_target)
        if target_match:
            target_folder = target_match.group(1)
            # Find it in current series
            if target_folder in link_mapping[series_name]:
                return f"[{link_text}]({link_mapping[series_name][target_folder]})"
                
        # Return original if no match
        return match.group(0)

    # regex for markdown links: [text](target)
    # Be careful not to match images
    body = re.sub(r"(?<!!)\[([^\]]+)\]\(([^)]+)\)", replace_md_link, body)

    frontmatter = build_frontmatter(
        title, description, config["category"], config["tags"], banner_image_rel
    )

    filename, _, _ = compute_post_info(series_name, post_dir_name, config, content)
    dest_path = os.path.join(DEST, filename)

    with open(dest_path, "w") as f:
        f.write(frontmatter)
        f.write("\n")
        f.write(body)

    print(f"  ✓ {filename}")
    return dest_path


def main():
    os.makedirs(DEST, exist_ok=True)
    
    # Pass 1: Compute mappings
    print("Executing Pass 1: Computing target URLs for internal links...")
    link_mapping = pass_one(SERIES_CONFIG)

    total = 0

    # Pass 2: Process posts
    for series_name, config in sorted(SERIES_CONFIG.items()):
        series_dir = os.path.join(STAGING, series_name)
        if not os.path.isdir(series_dir):
            continue

        print(f"\n📁 Processing series: {series_name}")
        post_dirs = sorted([d for d in os.listdir(series_dir) if os.path.isdir(os.path.join(series_dir, d))])

        for post_dir_name in post_dirs:
            result = process_post(series_name, post_dir_name, config, link_mapping)
            if result:
                total += 1

    print(f"\n✅ Published {total} blog posts to {DEST}")

if __name__ == "__main__":
    main()
