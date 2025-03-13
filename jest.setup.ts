// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Mock the SpeechRecognition API
class MockSpeechRecognition extends EventTarget {
  continuous = false;
  interimResults = false;
  
  start() {}
  stop() {}
}

// Mock the Web Audio API
Object.defineProperty(window, 'SpeechRecognition', {
  writable: true,
  value: MockSpeechRecognition,
});

Object.defineProperty(window, 'webkitSpeechRecognition', {
  writable: true,
  value: MockSpeechRecognition,
});

// Mock URL APIs
global.URL.createObjectURL = jest.fn();
global.URL.revokeObjectURL = jest.fn();

// Mock MediaRecorder
class MockMediaRecorder {
  start() {}
  stop() {}
  ondataavailable = jest.fn();
  onstop = jest.fn();
}

window.MediaRecorder = MockMediaRecorder as any;

// Mock getUserMedia
Object.defineProperty(global.navigator, 'mediaDevices', {
  value: {
    getUserMedia: jest.fn().mockImplementation(() => {
      return Promise.resolve({
        getTracks: () => [{stop: jest.fn()}],
      });
    }),
  },
  writable: true,
}); 