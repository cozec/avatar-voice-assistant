import { NextResponse } from 'next/server';
import gTTS from 'gtts';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';

// Define type for global cache
declare global {
  var __audioCache: {
    [key: string]: {
      filepath: string;
      timestamp: number;
      buffer: Buffer;
    };
  } | undefined;
}

// Ensure we have a directory for temp files
const TEMP_DIR = path.join(os.tmpdir(), 'avatar-tts');

// Create temp directory if it doesn't exist
async function ensureTempDir() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
    console.log(`TTS temp directory ensured at: ${TEMP_DIR}`);
  } catch (err) {
    console.error('Error creating temp directory:', err);
  }
}

export async function POST(request: Request) {
  try {
    const { text, useBrowserTTS = false, useGTTS = true } = await request.json() as {
      text: string;
      useBrowserTTS?: boolean;
      useGTTS?: boolean;
    };

    console.log(`TTS request received: ${text.substring(0, 50)}... [${text.length} chars]`);
    console.log(`TTS options: useBrowserTTS=${useBrowserTTS}, useGTTS=${useGTTS}`);

    // Validate input
    if (!text || typeof text !== 'string') {
      console.error('Invalid TTS request: Missing or invalid text');
      return NextResponse.json(
        { error: 'Invalid request. Please provide text.' },
        { status: 400 }
      );
    }

    // Option 1: Use browser's built-in TTS
    if (useBrowserTTS) {
      console.log('Using browser TTS');
      return NextResponse.json({
        useBrowserTTS: true,
        text: text
      });
    }

    // Option 2: Use Google TTS
    if (useGTTS) {
      try {
        await ensureTempDir();
        
        // Generate a unique filename
        const uuid = uuidv4();
        const filename = `${uuid}.mp3`;
        const filepath = path.join(TEMP_DIR, filename);
        
        console.log(`Creating gTTS audio file: ${filepath}`);
        
        // Create a new gTTS instance with improved options
        const gtts = new gTTS(text, 'en');
        
        // Return a promise that resolves when the file is saved
        return new Promise((resolve, reject) => {
          gtts.save(filepath, (err: any) => {
            if (err) {
              console.error('gTTS error while saving file:', err);
              reject(err);
              return;
            }
            
            console.log(`gTTS audio file saved successfully to: ${filepath}`);
            
            // Read the file to send it as a response
            fs.readFile(filepath)
              .then(buffer => {
                console.log(`Read audio file of size: ${buffer.length} bytes`);
                
                // Create URL to the audio file
                const audioUrl = `/api/tts/audio/${uuid}`;
                
                // Store the audio file path in a simple in-memory cache
                global.__audioCache = global.__audioCache || {};
                global.__audioCache[uuid] = {
                  filepath,
                  timestamp: Date.now(),
                  buffer
                };
                
                console.log(`Cached audio file with UUID: ${uuid}`);
                
                // Clean up old cache entries after a delay
                setTimeout(() => {
                  try {
                    if (global.__audioCache && global.__audioCache[uuid]) {
                      delete global.__audioCache[uuid];
                      fs.unlink(filepath).catch(e => console.error('Error deleting temp file:', e));
                      console.log(`Cleaned up cached audio file: ${uuid}`);
                    }
                  } catch (e) {
                    console.error('Error cleaning up cache:', e);
                  }
                }, 5 * 60 * 1000); // 5 minutes
                
                resolve(NextResponse.json({
                  useGTTS: true,
                  audioUrl,
                  text
                }));
              })
              .catch(err => {
                console.error('Error reading audio file:', err);
                reject(err);
              });
          });
        });
      } catch (error) {
        console.error('Error using gTTS:', error);
        // Fall back to browser TTS if gTTS fails
        return NextResponse.json({
          useBrowserTTS: true,
          text: text,
          error: 'gTTS failed, falling back to browser TTS'
        });
      }
    }

    // If no valid TTS option is specified, fall back to browser TTS
    console.log('No valid TTS option specified, falling back to browser TTS');
    return NextResponse.json({
      useBrowserTTS: true,
      text
    });
  } catch (error) {
    console.error('Error in TTS API:', error);
    return NextResponse.json(
      { error: 'An error occurred while generating speech.' },
      { status: 500 }
    );
  }
} 