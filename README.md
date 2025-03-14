# Voice Assistant

A web-based voice assistant application that provides a voice-in, voice-out experience. This application uses speech-to-text (STT/ASR) to transcribe user speech, processes the text using Large Language Models (LLMs), and returns audio responses using text-to-speech (TTS). Link to demo page.

## Features

- 🎤 **Voice Input**: Captures user speech using browser's Web Speech API or server-side STT
- 🧠 **LLM Processing**: Processes user queries using OpenAI's GPT models
- 🔊 **Voice Output**: Converts responses to speech using OpenAI's TTS API
- 🌐 **Web-Based**: Runs in any modern browser, no installation required
- 🔄 **Real-Time**: Provides fast and responsive conversational experience

## Technologies Used

- **Frontend**: Next.js, React, TailwindCSS
- **APIs**: OpenAI (GPT, Whisper, TTS)
- **Speech Recognition**: Web Speech API (browser-based), OpenAI Whisper (server-side)
- **Text-to-Speech**: OpenAI TTS API
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js (version 18.x or higher)
- npm or yarn
- OpenAI API key

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/avatar-voice-assistant.git
   cd avatar-voice-assistant
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

3. Create a `.env.local` file from the example:
   ```bash
   cp .env.local.example .env.local
   ```

4. Add your OpenAI API key to the `.env.local` file:
   ```
   OPENAI_API_KEY=your-openai-api-key-here
   ```

### Running Locally

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## Usage

1. Click the "Start Listening" button to begin voice capture
2. Speak clearly into your microphone
3. Click "Stop Listening" when you're done speaking
4. The application will transcribe your speech, process it, and respond with synthesized speech

## Deployment

This project is configured for easy deployment on Vercel:

1. Push your code to GitHub
2. Connect your GitHub repository to Vercel
3. Configure environment variables in Vercel dashboard
4. Deploy!

## Project Structure

```
avatar-voice-assistant/
├── app/
│   ├── api/
│   │   ├── llm/       # LLM processing endpoints
│   │   ├── stt/       # Speech-to-text endpoints
│   │   └── tts/       # Text-to-speech endpoints
│   ├── components/    # React components
│   ├── lib/           # Utility functions & classes
│   ├── layout.tsx     # Main layout
│   └── page.tsx       # Main page
├── public/            # Static assets
├── .env.local.example # Environment variables template
├── package.json       # Dependencies
└── README.md          # This file
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- OpenAI for their API services
- Next.js team for the awesome framework
- The open-source community for inspiration and resources
