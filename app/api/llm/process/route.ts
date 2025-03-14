import { NextResponse } from 'next/server';
import { HfInference } from '@huggingface/inference';
import axios from 'axios';

// Initialize Hugging Face client
// You can use this without an API token for some models with rate limits, 
// or sign up for a free token at huggingface.co
const hf = new HfInference(process.env.HUGGINGFACE_API_TOKEN || undefined);

// Models configuration
const ONLINE_MODEL = 'google/gemma-2b-it'; // Small but capable math model that works with free API
const LOCAL_API_URL = 'http://localhost:11434/api/generate'; // Ollama API URL - default port

// Define interface for axios response
interface LocalApiResponse {
  data: {
    response: string;
    [key: string]: unknown;
  };
}

// Define interface for Hugging Face text generation response
interface HfTextGenerationResponse {
  generated_text: string;
  [key: string]: unknown;
}

export async function POST(request: Request) {
  try {
    const { text, useLocalModel = false } = await request.json() as { 
      text: string;
      useLocalModel?: boolean;
    };

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Invalid request. Please provide text.' },
        { status: 400 }
      );
    }

    // Create a promise with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timed out')), 300000); // 5 minute timeout for very slow connections
    });

    // Process with the appropriate model based on the toggle
    try {
      let response;
      
      if (useLocalModel) {
        // Use locally hosted DeepSeek Math model
        console.log("Using local DeepSeek Math model");
        
        const result = await Promise.race([
          axios.post(LOCAL_API_URL, {
            model: 't1c/deepseek-math-7b-rl:latest', // The specific DeepSeek Math model you pulled
            prompt: `If this is a mathematical question, please solve it step by step: ${text}`,
            stream: false,
            options: {
              temperature: 0.2,
              top_p: 0.95,
              max_tokens: 500
            }
          }),
          timeoutPromise
        ]) as LocalApiResponse;
        
        // Parse the response from the local API
        response = result.data?.response || "I'm sorry, I couldn't process that request.";
        
      } else {
        // Use Hugging Face's Gemma model
        console.log("Using Hugging Face Gemma model");
        
        // Format the prompt appropriately for this model
        const formattedPrompt = `<start_of_turn>user
If this is a mathematical question, please solve it step by step: ${text}<end_of_turn>
<start_of_turn>model
`;
        
        const result = await Promise.race([
          hf.textGeneration({
            model: ONLINE_MODEL,
            inputs: formattedPrompt,
            parameters: {
              max_new_tokens: 250, // Allow for longer responses for step-by-step math solutions
              temperature: 0.2,    // Low temperature for more precise math answers
              top_p: 0.95,
              do_sample: true
            }
          }),
          timeoutPromise
        ]) as HfTextGenerationResponse;

        // Extract just the model's response from the generated text
        response = result.generated_text || "I'm sorry, I couldn't process that request.";
        
        // Remove the prompt part to get only the response
        if (response.includes("<start_of_turn>model\n")) {
          response = response.split("<start_of_turn>model\n")[1].replace("<end_of_turn>", "").trim();
        }
      }
      
      return NextResponse.json({ response });
      
    } catch (error) {
      console.error('LLM API error or timeout:', error);
      
      // Check if this was a client cancellation
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isCancelled = errorMessage.includes('cancel') || errorMessage.includes('abort');
      
      // Provide a graceful response if the model call fails
      const modelType = useLocalModel ? "local DeepSeek Math" : "Hugging Face Gemma";
      
      if (isCancelled) {
        return NextResponse.json({
          response: "The request was cancelled.",
          cancelled: true
        });
      }
      
      return NextResponse.json({ 
        response: `I apologize, but it's taking longer than expected to process your request. The ${modelType} model may be experiencing issues. Your question was: '${text}'. Please try again in a few minutes or try the other model option.`
      });
    }
  } catch (error) {
    console.error('Error processing LLM request:', error);
    return NextResponse.json(
      { error: 'An error occurred while processing your request.' },
      { status: 500 }
    );
  }
} 