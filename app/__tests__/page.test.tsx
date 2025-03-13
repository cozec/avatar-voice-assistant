import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from '../page';

// Mock the components that are imported in the page
jest.mock('../components/VoiceAssistant', () => {
  return function MockVoiceAssistant() {
    return <div data-testid="voice-assistant-mock">Voice Assistant Mock</div>;
  };
});

jest.mock('../components/AdvancedVoiceRecorder', () => {
  return function MockAdvancedVoiceRecorder() {
    return <div data-testid="advanced-recorder-mock">Advanced Voice Recorder Mock</div>;
  };
});

describe('Home Page', () => {
  it('renders the page with the heading', () => {
    render(<Home />);
    
    // Check for the main heading
    expect(screen.getByText('Voice Assistant')).toBeInTheDocument();
    
    // Check that the simple mode is active by default
    expect(screen.getByTestId('voice-assistant-mock')).toBeInTheDocument();
  });
  
  it('switches between simple and advanced modes', async () => {
    const user = userEvent.setup();
    render(<Home />);
    
    // Initially in simple mode
    expect(screen.getByTestId('voice-assistant-mock')).toBeInTheDocument();
    
    // Click the advanced mode button
    const advancedButton = screen.getByText('Advanced Mode');
    await user.click(advancedButton);
    
    // Should now show the advanced recorder
    expect(screen.getByTestId('advanced-recorder-mock')).toBeInTheDocument();
    
    // Click the simple mode button
    const simpleButton = screen.getByText('Simple Mode');
    await user.click(simpleButton);
    
    // Should now show the voice assistant again
    expect(screen.getByTestId('voice-assistant-mock')).toBeInTheDocument();
  });
}); 