declare global {
  var __audioCache: {
    [key: string]: {
      filepath: string;
      timestamp: number;
      buffer: Buffer;
    };
  } | undefined;
}

export {}; 