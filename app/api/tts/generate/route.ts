import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Initialize OpenAI client if API key is available
const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export async function POST(request: Request) {
  try {
    const { text, useBrowserTTS } = await request.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Invalid request. Please provide text.' },
        { status: 400 }
      );
    }
    
    // If useBrowserTTS is true or OpenAI is not available, return a flag to use browser TTS
    if (useBrowserTTS || !openai) {
      return NextResponse.json({ 
        useBrowserTTS: true,
        text: text 
      });
    }

    // Otherwise use OpenAI's TTS
    try {
      // Create speech using OpenAI's TTS
      const mp3 = await openai.audio.speech.create({
        model: "tts-1",
        voice: "alloy",
        input: text,
      });

      // Convert to base64 for direct browser playback
      const buffer = Buffer.from(await mp3.arrayBuffer());
      const base64Audio = buffer.toString('base64');
      
      // Return with data URL for browser playback
      const audioUrl = `data:audio/mpeg;base64,${base64Audio}`;
      
      return NextResponse.json({ audioUrl });
    } catch (openaiError) {
      console.error('Error generating TTS with OpenAI:', openaiError);
      // Fall back to browser TTS if OpenAI fails
      return NextResponse.json({
        useBrowserTTS: true,
        text: text
      });
    }
  } catch (error) {
    console.error('Error generating TTS:', error);
    return NextResponse.json(
      { error: 'An error occurred while generating speech.' },
      { status: 500 }
    );
  }
} 