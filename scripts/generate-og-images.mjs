import { createElement as h } from 'react';
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import matter from 'gray-matter';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJ_ROOT = join(__dirname, '..');

const BRAND = 'Coding Tutorials Blog';
const GRADIENT = ['#1e293b', '#0f172a', '#1e3a5f'];
const ACCENT = '#38bdf8';
const URL_TEXT = 'tuts.alexmercedcoder.dev';
const WIDTH = 1200;
const HEIGHT = 630;

function loadFont() {
  return readFileSync(join(__dirname, 'inter-regular.ttf')).buffer;
}

function slugify(relativePath) {
  // relativePath is something like: 2020/10JSObjects/index.md
  let slug = relativePath.replace(/\.md$/i, '');       // 2020/10JSObjects/index
  slug = slug.replace(/\//g, '-');                      // 2020-10JSObjects-index
  slug = slug.replace(/-index$/, '');                   // 2020-10JSObjects
  return slug;
}

function renderOG(title) {
  return h('div', {
    style: {
      width: WIDTH,
      height: HEIGHT,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'flex-start',
      background: `linear-gradient(135deg, ${GRADIENT[0]} 0%, ${GRADIENT[1]} 50%, ${GRADIENT[2]} 100%)`,
      padding: '80px',
      fontFamily: 'Inter',
      position: 'relative',
      overflow: 'hidden',
    }
  },
    // Decorative circles (background accents)
    h('div', {
      style: {
        position: 'absolute',
        top: 80,
        left: 100,
        width: 400,
        height: 400,
        borderRadius: '50%',
        background: ACCENT,
        opacity: 0.04,
      }
    }),
    h('div', {
      style: {
        position: 'absolute',
        bottom: -80,
        right: -80,
        width: 350,
        height: 350,
        borderRadius: '50%',
        background: ACCENT,
        opacity: 0.04,
      }
    }),
    // Accent line
    h('div', {
      style: {
        width: 80,
        height: 6,
        borderRadius: 3,
        background: ACCENT,
        marginBottom: 24,
      }
    }),
    // Brand
    h('div', {
      style: {
        fontSize: 28,
        fontWeight: 700,
        color: ACCENT,
        letterSpacing: '0.05em',
        marginBottom: 60,
      }
    }, BRAND),
    // Title
    h('div', {
      style: {
        fontSize: title.length > 60 ? 42 : 48,
        fontWeight: 700,
        color: '#ffffff',
        lineHeight: 1.3,
        marginBottom: 40,
        maxWidth: 900,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }
    }, title),
    // Spacer
    h('div', {
      style: { flex: 1 }
    }),
    // URL at bottom
    h('div', {
      style: {
        fontSize: 22,
        fontWeight: 400,
        color: '#94a3b8',
        letterSpacing: '0.02em',
      }
    }, URL_TEXT),
    // Bottom accent bar
    h('div', {
      style: {
        width: 120,
        height: 4,
        borderRadius: 2,
        background: ACCENT,
        marginTop: 24,
      }
    }),
  );
}

async function main() {
  console.log('Generating OG images...');

  // Load font
  console.log('Loading Inter font...');
  const fontData = loadFont();
  const fontRegular = { name: 'Inter', data: fontData, weight: 400, style: 'normal' };
  const fontBold = { name: 'Inter', data: fontData, weight: 700, style: 'normal' };

  // Find all markdown files in content/blog
  const blogDir = join(PROJ_ROOT, 'content', 'blog');
  const files = await glob('**/*.md', { cwd: blogDir });

  if (files.length === 0) {
    console.log('No markdown files found in content/blog/');
    return;
  }

  console.log(`Found ${files.length} markdown files`);

  // Ensure output directory
  const outDir = join(PROJ_ROOT, 'public', 'og');
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  let generated = 0;
  let skipped = 0;

  for (const file of files) {
    const slug = slugify(file);
    const outPath = join(outDir, `${slug}.png`);

    // Skip if already exists and source hasn't changed
    if (existsSync(outPath)) {
      const srcStat = statSync(fullPath);
      const outStat = statSync(outPath);
      if (srcStat.mtimeMs < outStat.mtimeMs) {
        skipped++;
        continue;
      }
    }

    const fullPath = join(blogDir, file);
    const content = readFileSync(fullPath, 'utf-8');
    let title;

    try {
      const parsed = matter(content);
      title = parsed.data?.title;
    } catch {
      // If gray-matter fails, skip
    }

    if (!title) {
      console.log(`  Skipping ${file}: no title in frontmatter`);
      skipped++;
      continue;
    }

    console.log(`  Generating OG for: ${title}`);

    const jsxElement = renderOG(title);

    // Convert React element tree to SVG string via satori
    const svg = await satori(jsxElement, {
      width: WIDTH,
      height: HEIGHT,
      fonts: [fontRegular, fontBold],
    });

    // Convert SVG to PNG
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } });
    const pngBuffer = resvg.render().asPng();

    writeFileSync(outPath, pngBuffer);
    console.log(`  Saved: public/og/${slug}.png`);
    generated++;
  }

  console.log(`\nDone! Generated ${generated} OG images (${skipped} skipped).`);
}

main().catch(err => {
  console.error('OG image generation failed:', err);
  process.exit(1);
});