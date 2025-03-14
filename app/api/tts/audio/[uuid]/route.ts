import { NextResponse } from 'next/server';

// Define the global audio cache on the global object
declare global {
  var __audioCache: {
    [key: string]: {
      filepath: string;
      timestamp: number;
      buffer: Buffer;
    };
  } | undefined;
}

export async function GET(
  request: Request,
  { params }: { params: { uuid: string } }
) {
  const { uuid } = params;
  
  // Check if the audio exists in our cache
  if (!global.__audioCache || !global.__audioCache[uuid]) {
    console.log(`Audio not found for UUID: ${uuid}`);
    return NextResponse.json(
      { error: 'Audio not found or expired' },
      { status: 404 }
    );
  }
  
  try {
    // Get the buffer from cache
    const { buffer } = global.__audioCache[uuid];
    console.log(`Serving audio file for UUID: ${uuid}, size: ${buffer.length} bytes`);
    
    // Create response with appropriate headers
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'public, max-age=300'
      }
    });
  } catch (error) {
    console.error('Error serving audio file:', error);
    return NextResponse.json(
      { error: 'An error occurred while serving the audio file' },
      { status: 500 }
    );
  }
} 