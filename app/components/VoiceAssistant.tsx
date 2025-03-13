import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const VoiceAssistant = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);

  // Initialize speech recognition on component mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      // @ts-ignore - WebkitSpeechRecognition is not in the types
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      
      recognitionRef.current.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join('');
        
        setTranscript(transcript);
      };
      
      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setError(`Speech recognition error: ${event.error}`);
        setIsListening(false);
      };
    } else {
      setError('Speech recognition not supported in this browser');
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      processTranscript();
    } else {
      setTranscript('');
      setResponse('');
      setAudioUrl(null);
      setError(null);
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const processTranscript = async () => {
    if (!transcript.trim()) return;
    
    try {
      setIsProcessing(true);
      
      // Step 1: Process with LLM
      const llmResponse = await axios.post('/api/llm/process', { text: transcript });
      const generatedResponse = llmResponse.data.response;
      setResponse(generatedResponse);
      
      // Step 2: Generate audio from text
      const ttsResponse = await axios.post('/api/tts/generate', { text: generatedResponse });
      setAudioUrl(ttsResponse.data.audioUrl);
      
      // Play the audio
      if (audioRef.current && ttsResponse.data.audioUrl) {
        audioRef.current.src = ttsResponse.data.audioUrl;
        audioRef.current.play();
      }
    } catch (err) {
      console.error('Error processing request:', err);
      setError('Error processing your request. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col items-center w-full max-w-2xl mx-auto p-4 space-y-6">
      <h2 className="text-2xl font-bold">Voice Assistant</h2>
      
      <button
        onClick={toggleListening}
        className={`rounded-full p-4 transition-all ${
          isListening 
            ? 'bg-red-500 hover:bg-red-600' 
            : 'bg-blue-500 hover:bg-blue-600'
        } text-white font-medium`}
        disabled={isProcessing}
      >
        {isListening ? 'Stop Listening' : 'Start Listening'}
      </button>
      
      <div className="w-full space-y-4">
        {transcript && (
          <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <h3 className="font-semibold mb-2">You said:</h3>
            <p>{transcript}</p>
          </div>
        )}
        
        {response && (
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <h3 className="font-semibold mb-2">Assistant response:</h3>
            <p>{response}</p>
          </div>
        )}
        
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-500">
            {error}
          </div>
        )}
      </div>
      
      {audioUrl && <audio ref={audioRef} src={audioUrl} className="hidden" />}
      
      {isProcessing && (
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          <span className="ml-2">Processing...</span>
        </div>
      )}
    </div>
  );
};

export default VoiceAssistant; 