import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';

// Define type for the SpeechRecognition interface
interface SpeechRecognitionEvent {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
        isFinal?: boolean;
      };
    };
  };
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

// Define a type for SpeechRecognition
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
  onspeechend?: () => void;
  onsoundend?: () => void;
}

// Declare the global interfaces
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

const VoiceAssistant = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isInferencing, setIsInferencing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [useLocalModel, setUseLocalModel] = useState(false);
  const [transcriptFinal, setTranscriptFinal] = useState(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [listeningTime, setListeningTime] = useState(0);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const lastTranscriptRef = useRef<string>('');
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const activityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const maxListeningTimeRef = useRef<number>(15000); // Max 15 seconds of listening time
  const activityTimestampRef = useRef<number>(0);
  const restartAttemptRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const originalPushStateRef = useRef<typeof window.history.pushState | null>(null);

  // Define refs to avoid circular dependencies
  const processTranscriptRef = useRef<(() => Promise<void>) | null>(null);
  const startListeningRef = useRef<(() => void) | null>(null);
  const stopListeningAndProcessRef = useRef<(() => void) | null>(null);
  // Add refs for the handler functions
  const handleRecognitionResultRef = useRef<((event: SpeechRecognitionEvent) => void) | null>(null);
  const handleRecognitionErrorRef = useRef<((event: SpeechRecognitionErrorEvent) => void) | null>(null);
  const handleRecognitionEndRef = useRef<(() => void) | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // New flag to track if cancellation just happened
  const [wasCancelled, setWasCancelled] = useState(false);
  // Add a cancellation message state that's separate from the error state
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);
  
  // Fix: Use an asynchronous XMLHttpRequest with navigation prevention and cancellation support
  const preventNavRequest = useCallback((url: string, body: Record<string, unknown>): Promise<Record<string, unknown>> => {
    console.log(`Making navigation-safe request to ${url}`);
    
    // Create a new AbortController for this request
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    return new Promise((resolve, reject) => {
      try {
        // Set inferencing state for LLM requests
        if (url.includes('/api/llm/process')) {
          setIsInferencing(true);
        }
        
        // Create XMLHttpRequest
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true); // true for asynchronous
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        
        // Handle completion
        xhr.onload = function() {
          if (url.includes('/api/llm/process')) {
            setIsInferencing(false);
          }
          
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error(`HTTP error ${xhr.status}: ${xhr.statusText}`));
          }
        };
        
        // Handle errors
        xhr.onerror = function() {
          if (url.includes('/api/llm/process')) {
            setIsInferencing(false);
          }
          reject(new Error('Network error occurred'));
        };
        
        // Handle abort
        xhr.onabort = function() {
          if (url.includes('/api/llm/process')) {
            setIsInferencing(false);
          }
          reject(new Error('Request was cancelled'));
        };
        
        // Check for abort signal
        signal.addEventListener('abort', () => {
          xhr.abort();
        });
        
        // Send the request
        xhr.send(JSON.stringify(body));
      } catch (error) {
        if (url.includes('/api/llm/process')) {
          setIsInferencing(false);
        }
        console.error('Request error:', error);
        reject(error);
      }
    });
  }, []);
  
  // Cancel the current inference request
  const cancelInference = useCallback(() => {
    console.log("Cancelling inference request - button clicked");
    if (abortControllerRef.current) {
      console.log("AbortController found - aborting request");
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    } else {
      console.log("No AbortController found to cancel");
    }
    
    // Set flag that cancellation happened
    setWasCancelled(true);
    
    // Set states in this specific order
    setIsInferencing(false);
    setIsProcessing(false); // Also stop overall processing
    setResponse(''); // Clear any partial response
    setCancelMessage("LLM stopped by user"); // Changed message as requested
    
    // Don't set error for user-initiated cancellations
    // setError("Inference cancelled by user");
    
    // Keep the cancelled message visible for 3 seconds
    setTimeout(() => {
      if (isMountedRef.current) {
        setWasCancelled(false);
        setCancelMessage(null);
      }
    }, 3000);
  }, []);
  
  // Process transcript function - defined early to avoid circular reference
  const processTranscript = useCallback(async () => {
    // Add a safety check: don't process if there's no transcript or if we just started listening
    if (!transcript.trim() || !isMountedRef.current) {
      console.log("Not processing: empty transcript or component unmounted");
      return;
    }
    
    // Don't process if we're already processing
    if (isProcessing) {
      console.log("Already processing, not starting another process");
      return;
    }
    
    console.log("Beginning to process transcript:", transcript);
    
    try {
      // Only clear errors if not from cancellation
      if (!wasCancelled && error) {
        setError(null);
      }
      
      setIsProcessing(true);
      
      // Step 1: Process with LLM using safe request
      try {
        const llmResponse = await preventNavRequest('/api/llm/process', {
          text: transcript,
          useLocalModel: useLocalModel
        });
        
        if (!isMountedRef.current) return;
        
        // Check if the request was cancelled
        if (llmResponse.cancelled || llmResponse.status === "cancelled") {
          console.log("LLM request was cancelled");
          setIsProcessing(false);
          setCancelMessage("LLM stopped by user"); // Changed message as requested
          
          // Keep the cancelled message visible for 3 seconds
          setTimeout(() => {
      if (isMountedRef.current) {
              setCancelMessage(null);
            }
          }, 3000);
          
          return;
        }
        
        const generatedResponse = llmResponse.response;
        setResponse(generatedResponse);
        
        // Step 2: Generate audio from text if LLM step succeeded
        try {
          const ttsResponse = await preventNavRequest('/api/tts/generate', {
            text: generatedResponse,
            useBrowserTTS: false, // Set to false to use gTTS by default
            useGTTS: true // Explicitly enable gTTS
          });
          
          if (!isMountedRef.current) return;
          
          // Check data format from the TTS endpoint
          console.log("TTS response:", ttsResponse);
          
          // Check if we should use browser's TTS
          if (ttsResponse.useBrowserTTS) {
            // Use browser's built-in speech synthesis
            if ('speechSynthesis' in window) {
              const textToSpeak = ttsResponse.text || generatedResponse;
              const utterance = new SpeechSynthesisUtterance(textToSpeak);
              utterance.rate = 1.0;
              utterance.pitch = 1.0;
              window.speechSynthesis.speak(utterance);
            } else {
              console.error('Browser speech synthesis not supported');
              setError('Your browser does not support speech synthesis');
            }
          } 
          // Check if gTTS was used
          else if (ttsResponse.useGTTS && ttsResponse.audioUrl) {
            console.log("Using gTTS with audio URL:", ttsResponse.audioUrl);
            setAudioUrl(ttsResponse.audioUrl);
            
            // Play the audio with better error handling
            if (audioRef.current) {
              console.log("Attempting to play audio from:", ttsResponse.audioUrl);
              audioRef.current.src = ttsResponse.audioUrl;
              
              // Force audio to load before playing
              audioRef.current.load();
              
              // Add a small delay before playing to ensure audio is loaded
              setTimeout(() => {
                if (audioRef.current) {
                  const playPromise = audioRef.current.play();
                  
                  if (playPromise !== undefined) {
                    playPromise
                      .then(() => {
                        console.log("Audio playback started successfully");
                      })
                      .catch(err => {
                        console.error("Error playing gTTS audio:", err);
                        // Fall back to browser TTS
                        if ('speechSynthesis' in window) {
                          console.log("Falling back to browser TTS");
                          window.speechSynthesis.cancel(); // Cancel any ongoing speech
                          window.speechSynthesis.speak(new SpeechSynthesisUtterance(generatedResponse));
                        }
                      });
                  }
                }
              }, 100);
            }
          }
          // Fallback for other TTS services
          else {
            // Handle any other TTS services (like OpenAI TTS if it existed)
            const audioURL = ttsResponse.audioUrl || (ttsResponse.data && ttsResponse.data.audioUrl);
            if (audioURL) {
              setAudioUrl(audioURL);
              
              // Play the audio
              if (audioRef.current) {
                audioRef.current.src = audioURL;
                audioRef.current.play();
              }
            } else {
              console.error('No audio URL in response');
              // Fallback to browser TTS if available
              if ('speechSynthesis' in window) {
                window.speechSynthesis.speak(new SpeechSynthesisUtterance(generatedResponse));
              }
            }
          }
        } catch (err) {
          console.error('TTS request error:', err);
          // Continue even if TTS fails - fallback to browser TTS
          if ('speechSynthesis' in window) {
            window.speechSynthesis.speak(new SpeechSynthesisUtterance(generatedResponse));
          }
        }
      } catch (err) {
        console.error('LLM request error:', err);
        if (isMountedRef.current) {
          setError('Error processing your request with the language model. Please try again.');
        }
      }
    } catch (err) {
      console.error('Error processing request:', err);
      if (isMountedRef.current) {
        setError('Error processing your request. Please try again.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsProcessing(false);
      }
    }
  }, [isProcessing, transcript, useLocalModel, preventNavRequest, isMountedRef, wasCancelled, error]);
  
  // Store the processTranscript function in a ref
  useEffect(() => {
    processTranscriptRef.current = processTranscript;
  }, [processTranscript]);
  
  // Clean up any existing recognition instance
  const cleanupRecognition = useCallback(() => {
    console.log("Cleaning up recognition instance");
    
    if (recognitionRef.current) {
      // Remove all event handlers
      recognitionRef.current.onresult = () => {};
      recognitionRef.current.onerror = () => {};
      recognitionRef.current.onend = () => {};
      
      try {
        // Stop if it's running
          recognitionRef.current.stop();
      } catch (e) {
        // Ignore errors during cleanup
        console.log("Error stopping recognition during cleanup:", e);
      }
      
      recognitionRef.current = null;
    }
  }, []);
  
  // Handle recognition results - MOVED UP before startListening
  const handleRecognitionResult = useCallback((event: SpeechRecognitionEvent) => {
    if (!isMountedRef.current) return;
    
    console.log("Recognition result received");
    const results = event.results;
    let finalTranscript = '';
    let interimTranscript = '';
    let isFinal = false;
    
    // Process results
    for (let i = 0; i < results.length; i++) {
      if (results[i] && results[i][0]) {
        const transcript = results[i][0].transcript;
        
        if (results[i].isFinal) {
          finalTranscript += transcript;
          isFinal = true;
        } else {
          interimTranscript += transcript;
        }
      }
    }
    
    const fullTranscript = finalTranscript || interimTranscript;
    setTranscript(fullTranscript);
    
    // Reset activity timestamp whenever we get new speech
    if (fullTranscript !== lastTranscriptRef.current) {
      activityTimestampRef.current = Date.now();
      lastTranscriptRef.current = fullTranscript;
      
      // Reset restart attempts since we're getting results
      restartAttemptRef.current = 0;
      
      // If we detect a final result, mark as ready to process and process immediately
      if (isFinal && finalTranscript.trim() !== '') {
        setTranscriptFinal(true);
        
        // Stop listening and process immediately - reduced delay to 300ms to feel more responsive
        setTimeout(() => {
          if (isMountedRef.current && isListening && !isProcessing && stopListeningAndProcessRef.current) {
            console.log("Final transcript detected - stopping listening and processing immediately");
            stopListeningAndProcessRef.current();
          }
        }, 300); // Reduced from 1000ms to 300ms for faster response
      }
    }
  }, [isListening, isProcessing]);
  
  // Store the handleRecognitionResult function in a ref
  useEffect(() => {
    handleRecognitionResultRef.current = handleRecognitionResult;
  }, [handleRecognitionResult]);
  
  // Handle recognition errors - MOVED UP before startListening
  const handleRecognitionError = useCallback((event: SpeechRecognitionErrorEvent) => {
    if (!isMountedRef.current) return;
    
    console.error('Speech recognition error:', event.error);
    
    // Only show errors to the user that are actionable
    // Filter out "aborted" errors as they're often just from normal stopping
    const ignoredErrors = ['aborted', 'no-speech'];
    if (!ignoredErrors.includes(event.error)) {
      setError(`Speech recognition error: ${event.error}`);
    }
    
    setIsListening(false);
  }, []);
  
  // Store the handleRecognitionError function in a ref
  useEffect(() => {
    handleRecognitionErrorRef.current = handleRecognitionError;
  }, [handleRecognitionError]);
  
  // Handle recognition ending - MOVED UP before startListening
  const handleRecognitionEnd = useCallback(() => {
    if (!isMountedRef.current) return;
    
    console.log("Recognition ended event");
    
    if (isListening) {
    // If we're still supposed to be listening but recognition ended
      // Just update the UI state - don't try to restart automatically
      setIsListening(false);
    }
  }, [isListening]);
  
  // Store the handleRecognitionEnd function in a ref
  useEffect(() => {
    handleRecognitionEndRef.current = handleRecognitionEnd;
  }, [handleRecognitionEnd]);
  
  // Start listening for speech - MOVED UP TO RESOLVE CIRCULAR REFERENCE
  const startListening = useCallback(() => {
    if (!isMountedRef.current || isListening || isProcessing) {
      console.log("Cannot start listening: component not mounted, already listening, or processing");
      return;
    }
    
    console.log("Starting speech recognition");
    
    // Check for browser support
    if (typeof window === 'undefined' || (!window.SpeechRecognition && !window.webkitSpeechRecognition)) {
      console.error("Speech recognition not supported");
      setError("Speech recognition is not supported in your browser. Please try Chrome, Edge, or Safari.");
      return;
    }
    
    try {
      // Clean up any existing instance
      cleanupRecognition();
      
      // Reset all flags and state before starting
      setTranscript('');
      setTranscriptFinal(false);
      lastTranscriptRef.current = '';
      restartAttemptRef.current = 0;
      
      // Create a new SpeechRecognition instance
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      // Configure recognition
      recognition.continuous = true;
      recognition.interimResults = true;
      
      // Set up handlers using the refs (use actual functions first, fall back to refs)
      recognition.onresult = handleRecognitionResultRef.current || handleRecognitionResult;
      recognition.onerror = handleRecognitionErrorRef.current || handleRecognitionError;
      recognition.onend = handleRecognitionEndRef.current || handleRecognitionEnd;
      
      // Save instance to ref
      recognitionRef.current = recognition;
      
      // Request microphone permission explicitly first
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(() => {
          console.log("Microphone permission granted");
          
          // Start recognition
          if (recognitionRef.current) {
            try {
              recognitionRef.current.start();
              setIsListening(true);
              
              // Reset state
              restartAttemptRef.current = 0;
              activityTimestampRef.current = Date.now();
              
              console.log("Recognition started successfully");
            } catch (e) {
              console.error("Failed to start recognition:", e);
              setError(`Failed to start speech recognition: ${e instanceof Error ? e.message : String(e)}`);
      cleanupRecognition();
            }
          }
        })
        .catch(err => {
          console.error("Microphone permission denied:", err);
          setError(`Microphone access is required. Please grant permission to use the microphone.`);
          cleanupRecognition();
        });
    } catch (e) {
      console.error("Error in startListening:", e);
      setError(`Could not start listening: ${e instanceof Error ? e.message : String(e)}`);
      cleanupRecognition();
    }
  }, [isListening, isProcessing, cleanupRecognition]);
  
  // Store the startListening function in a ref
  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);
  
  // Stop listening and process results - uses the ref to avoid circular dependencies
  const stopListeningAndProcess = useCallback(() => {
    if (!isMountedRef.current || !isListening || isProcessing) return;
    
    console.log("Stopping listening and processing transcript immediately");
    
    // First stop recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.error("Error stopping recognition:", e);
      }
    }
    
    setIsListening(false);
    setTranscriptFinal(false);
    
    // Process transcript if we have content - immediately without delay
    if (transcript.trim() !== '' && processTranscriptRef.current) {
      // Process immediately without delay
      processTranscriptRef.current();
    }
  }, [isListening, isProcessing, transcript]);
  
  // Store the stopListeningAndProcess function in a ref
  useEffect(() => {
    stopListeningAndProcessRef.current = stopListeningAndProcess;
  }, [stopListeningAndProcess]);
  
  // Toggle listening state
  const toggleListening = useCallback((e?: React.MouseEvent | React.SyntheticEvent) => {
    // Log this call for debugging
    console.log("toggleListening called", { isListening, isProcessing });
    
    // Stop event propagation if we have an event
    if (e) {
      e.preventDefault();
      e.stopPropagation();
      console.log("Event prevented in toggleListening");
    }
    
    // Safety check - only proceed if component is mounted and not processing
    if (!isMountedRef.current || isProcessing) {
      console.log("Toggle listening aborted: component unmounted or processing");
      return false;
    }
    
    try {
      if (isListening) {
        // If already listening, stop and process immediately
        console.log("Stopping listening mode and processing immediately");
        
        // First update the state
        setIsListening(false);
        
        // Then stop recognition and processing if needed
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch (err) {
            console.error("Error stopping recognition:", err);
          }
        }
        
        setTranscriptFinal(false);
        
        // Process transcript if we have content - no delay, process immediately
        if (transcript.trim() !== '' && processTranscriptRef.current) {
          console.log("Processing transcript after stopping");
          processTranscriptRef.current();
        }
      } else {
        // If not listening, start fresh
        console.log("Starting listening mode");
        
        // Clear any previous state
        setTranscript('');
        setResponse('');
        setAudioUrl(null);
        setError(null);
        setTranscriptFinal(false);
        lastTranscriptRef.current = '';
      setListeningTime(0);
        
        // Then start listening with a slight delay to ensure state is updated
        setTimeout(() => {
          if (isMountedRef.current && startListeningRef.current) {
            startListeningRef.current();
          }
        }, 10);
      }
      
      return false;
    } catch (error) {
      console.error("Error in toggleListening:", error);
      return false;
    }
  }, [isListening, isProcessing, transcript]);
  
  // Reset everything
  const resetRecognition = useCallback((e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    
    console.log("Resetting recognition");
    
    // Clean up existing recognition
    cleanupRecognition();
    
    // Reset state
    setIsListening(false);
    setError(null);
    setTranscript('');
    setTranscriptFinal(false);
    lastTranscriptRef.current = '';
    restartAttemptRef.current = 0;
  }, [cleanupRecognition]);
  
  // Wrap setupAudioContext in useCallback
  const setupAudioContext = useCallback(async () => {
    if (!isMountedRef.current) return;
    
    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isMountedRef.current) {
        // Clean up stream if component unmounted during microphone access
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      
      microphoneStreamRef.current = stream;
      
      // Set up audio context and analyser for visualization
      audioContextRef.current = new (window.AudioContext || 
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      
      const microphone = audioContextRef.current.createMediaStreamSource(stream);
      microphone.connect(analyserRef.current);
      
      // Start monitoring audio levels
      updateAudioLevel();
    } catch (error) {
      console.error('Error accessing microphone:', error);
      if (isMountedRef.current) {
        setError(`Error accessing microphone: ${error instanceof Error ? error.message : String(error)}`);
        setIsListening(false);
      }
    }
  }, [isMountedRef, updateAudioLevel, setError, setIsListening]);
  
  // Use useCallback for cleanupAudioContext to avoid dependency changes
  const cleanupAudioContext = useCallback(() => {
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }
      } catch (e) {
        console.error('Error closing audio context:', e);
      }
      audioContextRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);
  
  // Update audio level for visualization
  const updateAudioLevel = () => {
    if (!isMountedRef.current) return;
    
    if (analyserRef.current && isListening) {
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyserRef.current.getByteFrequencyData(dataArray);
      
      // Calculate average volume level
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;
      setAudioLevel(average);
      
      // Continue the animation loop
      animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
    }
  };

  // Toggle model between online and local
  const toggleModel = useCallback((e: React.MouseEvent) => {
    console.log("toggleModel called");
    e.preventDefault();
    e.stopPropagation();
    
    if (!isMountedRef.current) {
      console.log("Component not mounted, ignoring toggle");
      return;
    }
    
    // Toggle the model and log the change
    setUseLocalModel(prev => {
      const newValue = !prev;
      console.log(`Model switched to: ${newValue ? 'DeepSeek Math (Local)' : 'Gemma (Online)'}`);
      return newValue;
    });
    
    // Return false to prevent any default behavior
    return false;
  }, []);
  
  // Fix the useEffect dependencies
  useEffect(() => {
    if (isListening) {
      setupAudioContext();
      
      // Set initial activity timestamp
      activityTimestampRef.current = Date.now();
      
      // Start activity monitor
      if (activityTimerRef.current) {
        clearInterval(activityTimerRef.current);
      }
      
      // Set up timer to check for inactivity and max listening time
      const timer = setInterval(() => {
        if (!isMountedRef.current) {
          clearInterval(timer);
          return;
        }
        
        const currentTime = Date.now();
        const elapsedSinceActivity = currentTime - activityTimestampRef.current;
        const totalListeningTime = currentTime - activityTimestampRef.current + listeningTime;
        
        // Update the listening time display
        setListeningTime(totalListeningTime);
        
        // Check if we've exceeded max listening time
        if (totalListeningTime > maxListeningTimeRef.current) {
          console.log("Max listening time reached");
          if (isListening && !isProcessing && transcript.trim() !== '' && stopListeningAndProcessRef.current) {
            stopListeningAndProcessRef.current();
          } else if (isListening) {
            cleanupRecognition();
            setIsListening(false);
          }
          return;
        }
        
        // Check for silence - if no new activity for 1.5 seconds and we have transcript (reduced from 2s for faster response)
        if (elapsedSinceActivity > 1500 && transcript.trim() !== '') {
          console.log(`Silence detected for ${elapsedSinceActivity}ms - stopping and processing immediately`);
          if (stopListeningAndProcessRef.current) {
            stopListeningAndProcessRef.current();
          }
        }
      }, 500);
      
      activityTimerRef.current = timer;
    } else {
      cleanupAudioContext();
      if (activityTimerRef.current) {
        clearInterval(activityTimerRef.current);
        activityTimerRef.current = null;
      }
      setListeningTime(0);
    }
    
    return () => {
      if (activityTimerRef.current) {
        clearInterval(activityTimerRef.current);
        activityTimerRef.current = null;
      }
    };
  }, [isListening, transcript, isProcessing, cleanupAudioContext, setupAudioContext, listeningTime]);
  
  // Clean up on component unmount
  useEffect(() => {
    isMountedRef.current = true;
    
    // Add a listener to prevent navigation
    const preventNavigation = (e: MouseEvent) => {
      // Check if the click is on an anchor tag or inside our component
      const target = e.target as Element;
      const anchor = target.closest('a');
      const isInsideComponent = target.closest('.voice-isolator') || target.closest('.voice-assistant-wrapper');
      
      if (anchor && isInsideComponent) {
        console.log('Preventing navigation from anchor tag click within component');
        e.preventDefault();
        e.stopPropagation();
      }
    };
    
    // Add listener to catch any anchor tag clicks
    document.addEventListener('click', preventNavigation, true);
    
    return () => {
      isMountedRef.current = false;
      
      // Remove navigation prevention listener
      document.removeEventListener('click', preventNavigation, true);
      
      // Clean up recognition
      cleanupRecognition();
      
      // Clean up audio
      cleanupAudioContext();
      
      // Clear timers
      if (activityTimerRef.current) {
        clearInterval(activityTimerRef.current);
        activityTimerRef.current = null;
      }
    };
  }, [cleanupRecognition, cleanupAudioContext, listeningTime, setupAudioContext]);

  // Format time for display
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    return `${seconds}s`;
  };

  // Clean up all resources for deep cleanup
  const cleanupAllResources = useCallback(() => {
    console.log("Performing deep cleanup of all resources");
    
    // 1. Clean up audio context
    cleanupAudioContext();
    
    // 2. Stop any speech recognition
    cleanupRecognition();
    
    // 3. Clear all timers
    if (activityTimerRef.current) {
      clearInterval(activityTimerRef.current);
      activityTimerRef.current = null;
    }
    
    // 4. Stop any speech synthesis
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    
    // 5. Reset all flags
    setIsListening(false);
    setIsProcessing(false);
    
    // 6. Prevent any pending callbacks from running
    isMountedRef.current = false;
    
    // 7. Allow navigation again
    window.onbeforeunload = null;
    
    // 8. Reset history
    if (originalPushStateRef.current) {
      window.history.pushState = originalPushStateRef.current;
    }
    
    // 9. Clear any audio elements
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    
    // 10. Clear references to WebAudio streams
    if (microphoneStreamRef.current) {
      microphoneStreamRef.current.getTracks().forEach(track => {
        track.stop();
        microphoneStreamRef.current?.removeTrack(track);
      });
    }
  }, [cleanupAudioContext, cleanupRecognition]);
  
  // Ensure cleanup on component unmount
  useEffect(() => {
    const handleBeforeUnload = () => {
      cleanupAllResources();
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [cleanupAllResources]);

  // Block all events - commented out since it's unused
  // const blockAllEvents = useCallback((e: React.SyntheticEvent) => {
  //   e.preventDefault();
  //   e.stopPropagation();
  // }, []);
  
  // Prevent any form submissions
  const preventFormSubmission = useCallback((e: React.FormEvent) => {
    console.log("Prevented form submission", e);
    
    // Get the form element if it exists
    const form = e.target as HTMLFormElement;
    if (form && form.tagName === 'FORM') {
      console.log("Form submission prevented:", form.action || "no action");
    }
    
    // Stop all possible default behaviors
    if (e) {
    e.preventDefault();
    e.stopPropagation();
      e.stopImmediatePropagation();
    }
    
    return false;
  }, []);
  
  // Capture navigation events
  useEffect(() => {
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    
    // Store the original for restoration later
    originalPushStateRef.current = originalPushState;
    
    // Override pushState
    window.history.pushState = function(...args) {
      console.log('Navigation attempted with pushState:', args);
      return originalPushState.apply(this, args);
    };
    
    // Override replaceState
    window.history.replaceState = function(...args) {
      console.log('Navigation attempted with replaceState:', args);
      return originalReplaceState.apply(this, args);
    };
    
    // Detect back/forward navigation
    const handlePopState = () => {
      console.log('Navigation detected with popstate');
    };
    
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      // Restore original methods
      if (originalPushStateRef.current) {
        window.history.pushState = originalPushStateRef.current;
      }
      window.history.replaceState = originalReplaceState;
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  return (
    <div 
      className="voice-isolator flex flex-col items-center w-full max-w-2xl mx-auto p-4 space-y-6"
      onSubmit={preventFormSubmission}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transition-all duration-300">
        <div className="flex flex-col items-center space-y-6">
          {/* Einstein Avatar */}
          <div className="w-24 h-24 mb-2 overflow-hidden rounded-full border-4 border-blue-500 shadow-lg">
            <Image 
              src="/einstein_avatar.jpeg" 
              alt="Einstein Avatar" 
              width={96}
              height={96}
              className="w-full h-full object-cover"
            />
          </div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">Einstein AI Assistant</h2>
          
          <div className="flex items-center space-x-2 mb-4">
            <span className={`text-sm ${!useLocalModel ? 'text-blue-500 font-medium' : 'text-gray-500'}`}>
              Gemma (Online)
            </span>
            <button 
              onClick={toggleModel}
              type="button"
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none voice-assistant-button model-toggle-button ${
                useLocalModel ? 'bg-green-500' : 'bg-blue-500'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  useLocalModel ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className={`text-sm ${useLocalModel ? 'text-green-500 font-medium' : 'text-gray-500'}`}>
              DeepSeek Math (Local)
            </span>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="relative w-24 h-24">
              <div
                onMouseDown={(e) => {
                  if (isProcessing) return;
                  
                  // Prevent any possible form submission or navigation
                  e.preventDefault();
                  e.stopPropagation();
                  
                  console.log("Start/Stop triggered via mousedown");
                  
                  // We'll use a flag to track if toggleListening was called
                  // let toggleCalled = false;
                  
                  // Execute immediately but wrapped in try/catch
                  try {
                    toggleListening();
                    // toggleCalled = true;
                  } catch (error) {
                    console.error("Error toggling listening state:", error);
                  }
                  
                  // Return false to prevent any possible default behavior
                  return false;
                }}
                tabIndex={0}
                role="button"
                aria-label={isListening ? "Stop listening" : "Start listening"}
                className={`voice-assistant-button absolute inset-0 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                  isListening 
                    ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
                    : 'bg-blue-500 hover:bg-blue-600'
                } text-white font-medium shadow-lg z-10`}
                style={{ userSelect: 'none' }}
              >
                <span className="pointer-events-none">{isListening ? 'Stop' : 'Start'}</span>
              </div>
              
              {/* Audio level visualization rings */}
              {isListening && (
                <>
                  <div 
                    className="absolute inset-0 rounded-full bg-red-400 opacity-30 animate-ping"
                    style={{ 
                      transform: `scale(${1 + Math.min(0.5, audioLevel / 100)})`,
                      animationDuration: '2s'
                    }}
                  ></div>
                  <div 
                    className="absolute inset-0 rounded-full bg-red-300 opacity-20"
                    style={{ 
                      transform: `scale(${1 + Math.min(0.8, audioLevel / 75)})`,
                      animationDuration: '3s'
                    }}
                  ></div>
                </>
              )}
            </div>
            
            <button
              onClick={resetRecognition}
              className="voice-assistant-button px-4 py-2 rounded-md text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium transition-colors"
              type="button"
            >
              Reset
            </button>
          </div>
          
          <div className="text-sm text-gray-500 dark:text-gray-400 flex flex-col items-center">
            {isListening ? (
              <>
                <p>Listening... {formatTime(listeningTime)} / {formatTime(maxListeningTimeRef.current)}</p>
                <p className="text-xs mt-1">
                  {transcriptFinal 
                    ? "Processing will begin automatically" 
                    : "Will auto-process after 1.5s of silence or 15s total"}
                </p>
              </>
            ) : (
              <p>Click to start listening</p>
            )}
          </div>
        </div>
        
        <div className="mt-6 space-y-4 transition-all duration-300">
          {transcript && (
            <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg transition-all duration-300">
              <h3 className="font-semibold mb-2 flex items-center">
                <span className="w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
                You said:
              </h3>
              <p className="text-gray-800 dark:text-gray-200">{transcript}</p>
            </div>
          )}
          
          {response && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg shadow-sm transition-all duration-300">
              <h3 className="font-semibold mb-2 flex items-center">
                <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                Assistant response:
              </h3>
              <p className="text-gray-800 dark:text-gray-200">{response}</p>
            </div>
          )}
          
          {isProcessing && !response && (
            <div className="p-4 bg-gray-50 dark:bg-gray-700/20 rounded-lg shadow-sm transition-all duration-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-t-blue-500 border-blue-200"></div>
                  <span className="text-gray-600 dark:text-gray-300 text-sm">
                    {isInferencing ? "AI is thinking..." : "Processing..."}
                  </span>
                </div>
                
                {/* Stop button - only visible during inferencing */}
                {isInferencing && (
                  <button
                    onClick={cancelInference}
                    type="button"
                    className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-md transition-colors stop-inference-button"
                    aria-label="Stop inference"
                  >
                    Stop
                  </button>
                )}
              </div>
            </div>
          )}
          
          {cancelMessage && (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-yellow-600 shadow-sm transition-all duration-300">
              <h3 className="font-semibold mb-2 flex items-center">
                <span className="w-3 h-3 bg-yellow-500 rounded-full mr-2"></span>
                Status:
              </h3>
              <p>{cancelMessage}</p>
            </div>
          )}
          
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-500 shadow-sm transition-all duration-300">
              <h3 className="font-semibold mb-2 flex items-center">
                <span className="w-3 h-3 bg-red-500 rounded-full mr-2"></span>
                Error:
              </h3>
              <p>{error}</p>
              {console.log("Rendering error message:", error)}
            </div>
          )}
        </div>
      </div>
      
      {audioUrl && (
        <audio 
          ref={audioRef} 
          src={audioUrl} 
          controls  // Add controls for debugging
          onPlay={() => console.log("Audio started playing")}
          onError={(e) => {
            console.error("Audio error:", e);
            // Log more detailed error information
            const audioElement = e.currentTarget as HTMLAudioElement;
            console.error("Audio error code:", audioElement.error?.code);
            console.error("Audio error message:", audioElement.error?.message);
            console.error("Audio URL that failed:", audioUrl);
            
            if (isMountedRef.current) {
              setError("Failed to play audio response. Falling back to browser TTS.");
              
              // Fall back to browser TTS
              if ('speechSynthesis' in window && response) {
                window.speechSynthesis.cancel(); // Cancel any ongoing speech
                window.speechSynthesis.speak(new SpeechSynthesisUtterance(response));
              }
            }
          }}
        />
      )}
    </div>
  );
};

// Add a wrapper component to catch any navigation attempts
const VoiceAssistantWrapper = () => {
  // Prevent any form submissions at the wrapper level
  const preventAnyFormSubmission = (e: React.FormEvent) => {
    console.log("Preventing form submission at wrapper level");
    e.preventDefault();
    e.stopPropagation();
    return false;
  };

  // Prevent click propagation at the wrapper level
  const preventClickPropagation = (e: React.MouseEvent) => {
    const target = e.target as Element;
    
    // Check if this is the model toggle button
    const isModelToggle = target.closest('.model-toggle-button') || 
                         target.classList.contains('model-toggle-button');
    
    // Check if this is the stop button
    const isStopButton = target.closest('.stop-inference-button') || 
                         target.closest('button[aria-label="Stop inference"]');
    
    // Allow model toggle button and stop button clicks to proceed
    if (isModelToggle || isStopButton) {
      console.log(`Allowing ${isStopButton ? 'stop button' : 'model toggle button'} click in preventClickPropagation`);
      return true;
    }
    
    console.log("Preventing click propagation at wrapper level");
    e.stopPropagation();
    e.preventDefault();
    return false;
  };

  useEffect(() => {
    // Add a global listener for form submissions
    const handleFormSubmit = (e: Event) => {
      console.log("Caught form submission globally", e);
      e.preventDefault();
      e.stopPropagation();
      return false;
    };

    // Handle any clicks that might lead to navigation
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Element;
      
      // Check if this is part of our component
      const isInsideComponent = target.closest('.voice-assistant-wrapper');
      
      if (isInsideComponent) {
        // Check if this is the model toggle button
        const isModelToggle = target.closest('.model-toggle-button') || 
                             target.classList.contains('model-toggle-button');
        
        // Check if this is the stop button
        const isStopButton = target.closest('.stop-inference-button') || 
                            target.closest('button[aria-label="Stop inference"]');
        
        // Allow model toggle button and stop button clicks to proceed
        if (isModelToggle || isStopButton) {
          console.log(`Allowing ${isStopButton ? 'stop button' : 'model toggle button'} click`);
          return true;
        }
        
        // If it's any form of navigation element, prevent it
        if (target.tagName === 'A' || target.closest('a') || 
            (target.tagName === 'BUTTON' && !isStopButton) || (target.closest('button') && !isStopButton) ||
            target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'submit') {
          console.log("Preventing potential navigation from click:", target.tagName);
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };

    // Listen for any form submissions on the page
    document.addEventListener('submit', handleFormSubmit, true);
    // Listen for all clicks to prevent navigation
    document.addEventListener('click', handleClick, true);
    
    return () => {
      document.removeEventListener('submit', handleFormSubmit, true);
      document.removeEventListener('click', handleClick, true);
    };
  }, []);

  return (
    // Wrapping div with preventative handlers - important: add onMouseDown handler too
    <div 
      onClick={preventClickPropagation}
      onMouseDown={(e) => {
        // Check if this is the model toggle button
        const target = e.target as Element;
        const isModelToggle = target.closest('.model-toggle-button') || 
                             target.classList.contains('model-toggle-button');
        
        // Check if this is the stop button
        const isStopButton = target.closest('.stop-inference-button') || 
                            target.closest('button[aria-label="Stop inference"]');
        
        // Allow model toggle button and stop button clicks to proceed
        if (isModelToggle || isStopButton) {
          console.log(`Allowing ${isStopButton ? 'stop button' : 'model toggle button'} click in onMouseDown`);
          return true;
        }
        
        // Only prevent default for non-interactive elements
        if ((e.target as Element).tagName !== 'DIV') {
          e.stopPropagation();
        }
      }}
      onSubmit={preventAnyFormSubmission}
      className="voice-assistant-wrapper"
    >
      <VoiceAssistant />
    </div>
  );
};

export default VoiceAssistantWrapper; 