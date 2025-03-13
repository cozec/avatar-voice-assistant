'use client';

import VoiceAssistant from './components/VoiceAssistant';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
      <header className="w-full max-w-4xl text-center mb-8">
        <h1 className="text-4xl font-bold mb-2">Voice Assistant</h1>
        <p className="text-gray-600 dark:text-gray-300">Speak to me and I&apos;ll respond with voice</p>
      </header>
      
      <div className="w-full max-w-4xl">        
        <main className="flex-1 w-full flex items-start justify-center">
          <VoiceAssistant />
        </main>
      </div>
      
      <footer className="w-full max-w-4xl text-center mt-8 text-sm text-gray-500 dark:text-gray-400">
        <p>Powered by Next.js, AI Models, and Web Speech API</p>
        <p className="mt-1">
          <a 
            href="https://github.com/yourusername/avatar-voice-assistant" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            GitHub Repository
          </a>
        </p>
      </footer>
    </div>
  );
}
