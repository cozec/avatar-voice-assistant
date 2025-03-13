import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import VoiceAssistant from '../VoiceAssistant';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('VoiceAssistant', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('renders the component with start button', () => {
    render(<VoiceAssistant />);
    
    expect(screen.getByText('Voice Assistant')).toBeInTheDocument();
    expect(screen.getByText('Start Listening')).toBeInTheDocument();
  });

  it('toggles between start and stop listening', async () => {
    const user = userEvent.setup();
    render(<VoiceAssistant />);
    
    // Initially shows "Start Listening"
    const button = screen.getByText('Start Listening');
    
    // Click to start listening
    await user.click(button);
    
    // Should now show "Stop Listening"
    expect(screen.getByText('Stop Listening')).toBeInTheDocument();
    
    // Mock LLM and TTS responses for when we stop listening
    mockedAxios.post.mockImplementation((url) => {
      if (url === '/api/llm/process') {
        return Promise.resolve({ data: { response: 'This is a test response' } });
      }
      if (url === '/api/tts/generate') {
        return Promise.resolve({ data: { audioUrl: 'data:audio/mpeg;base64,test' } });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
    
    // Click to stop listening
    await user.click(screen.getByText('Stop Listening'));
    
    // Button should go back to "Start Listening"
    await waitFor(() => {
      expect(screen.getByText('Start Listening')).toBeInTheDocument();
    });
  });
}); 