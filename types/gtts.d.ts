declare module 'gtts' {
  class gTTS {
    constructor(text: string, lang: string, options?: any);
    save(filepath: string, callback: (err: Error | null) => void): void;
  }
  export = gTTS;
} 