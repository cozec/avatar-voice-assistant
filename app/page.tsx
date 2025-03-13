'use client';

import { useState } from 'react';
import VoiceAssistant from './components/VoiceAssistant';
import AdvancedVoiceRecorder from './components/AdvancedVoiceRecorder';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'simple' | 'advanced'>('simple');

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
      <header className="w-full max-w-4xl text-center mb-8">
        <h1 className="text-4xl font-bold mb-2">Voice Assistant</h1>
        <p className="text-gray-600 dark:text-gray-300">Speak to me and I'll respond with voice</p>
      </header>
      
      <div className="w-full max-w-4xl">
        <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
          <button
            className={`py-2 px-4 font-medium ${
              activeTab === 'simple'
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
            onClick={() => setActiveTab('simple')}
          >
            Simple Mode
          </button>
          <button
            className={`py-2 px-4 font-medium ${
              activeTab === 'advanced'
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
            onClick={() => setActiveTab('advanced')}
          >
            Advanced Mode
          </button>
        </div>
        
        <main className="flex-1 w-full flex items-start justify-center">
          {activeTab === 'simple' ? <VoiceAssistant /> : <AdvancedVoiceRecorder />}
        </main>
      </div>
      
      <footer className="w-full max-w-4xl text-center mt-8 text-sm text-gray-500 dark:text-gray-400">
        <p>Powered by Next.js, OpenAI, and Web Speech API</p>
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
