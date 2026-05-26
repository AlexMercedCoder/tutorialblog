import { createElement as h } from 'react';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

// Cache font data
let fontData = null;

async function getFont() {
  if (fontData) return fontData;

  // Inter Regular 400
  const response = await fetch(
    'https://fonts.gstatic.com/s/inter/v18/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa2JL7W0Q5n-wU.woff'
  );
  fontData = await response.arrayBuffer();
  return fontData;
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    const title = url.searchParams.get('title') || 'Coding Tutorials Blog';

    const font = await getFont();

    const svg = await satori(
      h('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #1e3a5f 100%)',
          fontFamily: 'Inter',
        },
      }, [
        h('div', {
          style: {
            color: '#38bdf8',
            fontSize: 36,
            fontWeight: 700,
            marginBottom: 20,
            letterSpacing: 2,
            textTransform: 'uppercase',
          },
        }, 'Coding Tutorials Blog'),
        h('div', {
          style: {
            color: '#f8fafc',
            fontSize: 52,
            fontWeight: 700,
            padding: '0 60px',
            lineHeight: 1.3,
            textAlign: 'center',
            maxWidth: 1000,
          },
        }, title),
        h('div', {
          style: {
            color: '#94a3b8',
            fontSize: 24,
            marginTop: 30,
            fontWeight: 400,
          },
        }, 'tuts.alexmercedcoder.dev'),
      ]),
      {
        width: 1200,
        height: 630,
        fonts: [
          {
            name: 'Inter',
            data: font,
            weight: 400,
            style: 'normal',
          },
        ],
      }
    );

    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: 1200 },
    });
    const pngBuffer = resvg.render().asPng();

    return new Response(pngBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('OG image generation error:', error);
    return new Response(`OG generation failed: ${error.message}`, { status: 500 });
  }
};

export const config = {
  path: '/og',
};
