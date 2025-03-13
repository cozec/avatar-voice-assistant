import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { AudioRecorder } from '../lib/audioRecorder';

const AdvancedVoiceRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseAudioUrl, setResponseAudioUrl] = useState<string | null>(null);
  
  const recorderRef = useRef<AudioRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const responseAudioRef = useRef<HTMLAudioElement | null>(null);
  
  // Initialize recorder on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      recorderRef.current = new AudioRecorder();
    }
    
    return () => {
      // Clean up any audio URLs
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      if (responseAudioUrl) {
        URL.revokeObjectURL(responseAudioUrl);
      }
    };
  }, []);
  
  const startRecording = async () => {
    try {
      setError(null);
      setTranscript('');
      setResponse('');
      setAudioUrl(null);
      setResponseAudioUrl(null);
      
      await recorderRef.current?.startRecording();
      setIsRecording(true);
    } catch (err: any) {
      setError(err.message || 'Failed to start recording');
      console.error('Recording error:', err);
    }
  };
  
  const stopRecording = async () => {
    try {
      if (!recorderRef.current) return;
      
      const audioBlob = await recorderRef.current.stopRecording();
      const url = recorderRef.current.createAudioUrl(audioBlob);
      setAudioUrl(url);
      setIsRecording(false);
      
      // Create a file from the blob
      const audioFile = recorderRef.current.createAudioFile(audioBlob);
      
      // Process the audio file
      await processAudioFile(audioFile);
    } catch (err: any) {
      setError(err.message || 'Failed to stop recording');
      setIsRecording(false);
      console.error('Recording error:', err);
    }
  };
  
  const processAudioFile = async (file: File) => {
    try {
      setIsProcessing(true);
      
      // Step 1: Transcribe the audio using server-side STT
      const formData = new FormData();
      formData.append('audio', file);
      
      const transcriptionResponse = await axios.post('/api/stt/transcribe', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      const transcribedText = transcriptionResponse.data.text;
      setTranscript(transcribedText);
      
      // Step 2: Process the text with the LLM
      const llmResponse = await axios.post('/api/llm/process', { text: transcribedText });
      const generatedResponse = llmResponse.data.response;
      setResponse(generatedResponse);
      
      // Step 3: Generate TTS response
      const ttsResponse = await axios.post('/api/tts/generate', { text: generatedResponse });
      setResponseAudioUrl(ttsResponse.data.audioUrl);
      
      // Play the audio
      if (responseAudioRef.current && ttsResponse.data.audioUrl) {
        responseAudioRef.current.src = ttsResponse.data.audioUrl;
        responseAudioRef.current.play();
      }
    } catch (err: any) {
      console.error('Error processing audio:', err);
      setError('Error processing your audio. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };
  
  return (
    <div className="flex flex-col items-center w-full max-w-2xl mx-auto p-4 space-y-6">
      <h2 className="text-2xl font-bold">Advanced Voice Recorder</h2>
      
      <div className="flex space-x-4">
        <button
          onClick={startRecording}
          disabled={isRecording || isProcessing}
          className={`px-4 py-2 rounded-md ${
            isRecording ? 'bg-gray-400' : 'bg-blue-500 hover:bg-blue-600'
          } text-white font-medium transition-colors`}
        >
          Start Recording
        </button>
        
        <button
          onClick={stopRecording}
          disabled={!isRecording || isProcessing}
          className={`px-4 py-2 rounded-md ${
            !isRecording ? 'bg-gray-400' : 'bg-red-500 hover:bg-red-600'
          } text-white font-medium transition-colors`}
        >
          Stop Recording
        </button>
      </div>
      
      {isRecording && (
        <div className="flex items-center space-x-2 text-red-500">
          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
          <span>Recording...</span>
        </div>
      )}
      
      {audioUrl && (
        <div className="w-full">
          <h3 className="font-semibold mb-2">Your recording:</h3>
          <audio ref={audioRef} src={audioUrl} controls className="w-full" />
        </div>
      )}
      
      <div className="w-full space-y-4">
        {transcript && (
          <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <h3 className="font-semibold mb-2">Transcription:</h3>
            <p>{transcript}</p>
          </div>
        )}
        
        {response && (
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <h3 className="font-semibold mb-2">Assistant response:</h3>
            <p>{response}</p>
            {responseAudioUrl && (
              <audio 
                ref={responseAudioRef} 
                src={responseAudioUrl} 
                controls 
                className="w-full mt-3" 
              />
            )}
          </div>
        )}
        
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-500">
            {error}
          </div>
        )}
      </div>
      
      {isProcessing && (
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          <span className="ml-2">Processing...</span>
        </div>
      )}
    </div>
  );
};

export default AdvancedVoiceRecorder; 