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
global.URL.createObjectURL = (() => {}) as jest.Mock;
global.URL.revokeObjectURL = (() => {}) as jest.Mock;

// Mock MediaRecorder
class MockMediaRecorder {
  start() {}
  stop() {}
  ondataavailable = (() => {}) as jest.Mock;
  onstop = (() => {}) as jest.Mock;
}

window.MediaRecorder = MockMediaRecorder as any;

// Mock getUserMedia
Object.defineProperty(global.navigator, 'mediaDevices', {
  value: {
    getUserMedia: (() => {}) as jest.Mock.mockImplementation(() => {
      return Promise.resolve({
        getTracks: () => [{stop: (() => {}) as jest.Mock}],
      });
    }),
  },
  writable: true,
}); 