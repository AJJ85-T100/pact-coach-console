/**
 * POST /api/gym-scan
 *
 * Body: { imageBase64: string, mediaType?: 'image/jpeg' | 'image/png' | 'image/webp' }
 * Returns: { equipment: Array<{ name: string, quantity: number, confidence: 'high'|'medium'|'low' }> }
 *
 * Takes a photo of a gym/home gym setup and returns identified equipment.
 * Image is expected to already be resized client-side to ~1568px on longest
 * edge (Claude Vision's recommended max). No persistence yet — v0 just
 * returns the result for the UI to display. Persistence + Program Builder
 * integration come next session.
 */

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

// Allow up to 30s for the vision call — Claude Vision typically takes 5-15s
// on a single image, this gives headroom for network/queue variance.
export const maxDuration = 30;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SCAN_PROMPT = `You are analyzing a photo of a gym or home workout space. Identify every distinct piece of fitness equipment visible.

Rules:
- Be specific: "adjustable bench" not "bench"; "Olympic barbell" if you can tell it's Olympic; "20kg dumbbells" if weight is visible
- For multiples of the same item, set quantity correctly (e.g., a pair of 20kg dumbbells: name "20kg dumbbells", quantity 2)
- Skip non-equipment: don't list mirrors, walls, floors, towels, water bottles, mats unused
- If you're uncertain about an item, include it but mark confidence as "low"

Return ONLY a JSON object with this exact structure, no markdown fences, no explanation:
{
  "equipment": [
    { "name": "string", "quantity": number, "confidence": "high" | "medium" | "low" }
  ]
}`;

const VALID_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function POST(req) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured on the server.' },
      { status: 500 },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { imageBase64, mediaType = 'image/jpeg' } = body || {};

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return NextResponse.json({ error: 'imageBase64 required.' }, { status: 400 });
  }
  if (!VALID_MEDIA_TYPES.has(mediaType)) {
    return NextResponse.json({ error: 'Unsupported media type.' }, { status: 400 });
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageBase64,
              },
            },
            { type: 'text', text: SCAN_PROMPT },
          ],
        },
      ],
    });

    // Claude returns content as an array of blocks. For our structured-output
    // prompt we expect a single text block with the JSON.
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock?.text) {
      return NextResponse.json(
        { error: 'No text content returned by the model.' },
        { status: 502 },
      );
    }

    // Defensive parse — strip stray fences if Claude added them despite the prompt
    const cleaned = textBlock.text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('[gym-scan] failed to parse response:', textBlock.text);
      return NextResponse.json(
        { error: 'Could not read the scan result. Try a clearer photo.' },
        { status: 502 },
      );
    }

    const equipment = Array.isArray(parsed.equipment) ? parsed.equipment : [];

    // Light shape-validation — drop anything that doesn't fit the contract
    const cleanList = equipment
      .filter((item) => item && typeof item.name === 'string')
      .map((item) => ({
        name: item.name,
        quantity: Number.isFinite(item.quantity) && item.quantity >= 1 ? item.quantity : 1,
        confidence: ['high', 'medium', 'low'].includes(item.confidence) ? item.confidence : 'medium',
      }));

    return NextResponse.json({ equipment: cleanList });
  } catch (err) {
    console.error('[gym-scan] Anthropic call failed:', err);
    return NextResponse.json(
      { error: 'Scan failed. Try again in a moment.' },
      { status: 502 },
    );
  }
}
