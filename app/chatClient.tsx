// frontend/app/ChatClient.tsx

'use client';

import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { fetchEventSource } from '@microsoft/fetch-event-source';

// --- A new "Up Arrow" Icon for the submit button ---
const UpArrowIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7 11L12 6L17 11M12 18V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

type Message = {
  text: string;
  isUser: boolean;
};

type Suggestion = {
  label: string;
  action: string;
};

// --- Main Chat Component ---
export default function ChatClient({ apiUrl }: { apiUrl: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- State variables for video generation ---
  const [videoJobId, setVideoJobId] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  // --- Logic to auto-resize the textarea ---
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'; // Reset height
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${scrollHeight}px`;
    }
  }, [input]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  // Auto-scroll to bottom of chat
  useEffect(scrollToBottom, [messages]);

    // --- Polling logic for video status ---
  useEffect(() => {
    if (!videoJobId) return;

    const attempts = { current: 0 };
    const maxAttempts = 24; // 24 attempts * 5 seconds/attempt = 120 seconds (2 minutes)

    const interval = setInterval(async () => {
      // --- NEW: Check for timeout ---
      if (attempts.current > maxAttempts) {
        clearInterval(interval);
        setVideoStatus('TIMED_OUT');
        setVideoJobId(null);
        // You can update the last message to show the timeout error
        setMessages(prev => {
            const newMessages = [...prev];
            const lastMessageIndex = newMessages.length - 1;
            if (lastMessageIndex >= 0) {
              newMessages[lastMessageIndex] = {
                  ...newMessages[lastMessageIndex],
                  text: (newMessages[lastMessageIndex].text || "") + "\n\nSorry, the video generation timed out.",
              };
            }
            return newMessages;
        });
        return;
      }

      attempts.current += 1; // Increment attempt counter
      try {
        const res = await fetch(`${apiUrl}/video-status/${videoJobId}`);
        if (!res.ok) throw new Error("Failed to fetch status");
        
        const data = await res.json();
        setVideoStatus(data.status);

        if (data.status === 'COMPLETE') {
          setVideoUrl(data.video_url);
          setVideoJobId(null); // Stop polling
          clearInterval(interval);
        } else if (data.status === 'FAILED') {
          console.error("Video generation failed:", data.error);
          setVideoJobId(null); // Stop polling
          clearInterval(interval);
        }
      } catch (e) {
        console.error("Polling error:", e);
        setVideoStatus('FAILED');
        setVideoJobId(null);
        clearInterval(interval);
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [videoJobId, apiUrl]);

   const handleGenerateVideo = async (textContent: string) => {
    if (!textContent) return;
    setVideoStatus('REQUESTED');
    
    try {
        const res = await fetch(`${apiUrl}/generate-video`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text_content: textContent }),
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.detail || "Failed to start video generation.");
        }

        const data = await res.json();
        setVideoJobId(data.job_id);
    } catch(err: any) {
        setVideoStatus(`FAILED: ${err.message}`);
    }
  };
    const handleSend = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;
    
    // Reset video state for new conversations
    setVideoJobId(null);
    setVideoStatus('');
    setVideoUrl('');
    setSuggestions([]); // Clear previous suggestions
   
    const userMessage: Message = { text: messageText, isUser: true };
    const newMessagesHistory = [...messages, userMessage];
    setMessages(newMessagesHistory);
    setIsLoading(true);
    setMessages((prev) => [...prev, { text: '', isUser: false }]);
    const ctrl = new AbortController();

    await fetchEventSource(`${apiUrl}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: messageText,
                  chat_history: newMessagesHistory.slice(0, -1).slice(-6)  }),
      signal: ctrl.signal,
      onopen: async (res: { ok: any; status: any; }) => {
        if (!res.ok) {
          throw new Error(`Failed to connect: ${res.status}`);
        }
        // Add a placeholder for the AI's response
        setMessages((prev) => [...prev, { text: '', isUser: false }]);
      },
      onmessage(event: { data: string; }) {
      // --- FIX 2: Robust JSON parsing ---
      // If the data is not a valid JSON string, we simply ignore this chunk
      // and wait for the next one, preventing a crash.
       try {
            const parsed = JSON.parse(event.data);

            if (parsed.type === 'content_delta') {
              setMessages(prev => {
                // --- FIX 1: Correct immutable state update ---
                // We create a new array and a new object for the last message
                // to ensure React detects the change correctly.
                const newMessages = [...prev];
                const lastMessageIndex = newMessages.length - 1;
                newMessages[lastMessageIndex] = {
                    ...newMessages[lastMessageIndex],
                    text: newMessages[lastMessageIndex].text + parsed.data,
                };
                return newMessages;
              });
            } else if (parsed.type === 'video_trigger') {
              handleGenerateVideo(parsed.text_content);
            }else if (parsed.type === 'suggestion') {
            setSuggestions(prev => [...prev, parsed.payload]);
            }else if (parsed.type === 'stream_end') {
              // --- FIX 1: Explicitly stop loading on successful stream end ---
              setIsLoading(false);
            }else if (parsed.type === 'error') {
              // Gracefully display the specific error message from the backend
              setMessages(prev => {
                const newMessages = [...prev];
                const lastMessageIndex = newMessages.length - 1;
                newMessages[lastMessageIndex] = {
                    ...newMessages[lastMessageIndex],
                    text: `Sorry, an error occurred: ${parsed.data}`,
                };
                return newMessages;
              });
              setIsLoading(false); // Re-enable the input
              // Gracefully stop the stream now that we've received a definitive error
              ctrl.abort();
            }
        } catch(e) {
            console.error("Received a malformed stream event:", event.data);
        }finally {
          // --- THE DEFINITIVE FIX ---
          // This block is GUARANTEED to run after the await fetchEventSource completes,
          // whether it succeeded, failed, or was aborted.
         setIsLoading(false);
    }
      },

      onclose() {
        // This will be called when the connection closes cleanly.
        // If isLoading is still true here, it's a fallback to re-enable the UI.
        if (isLoading) {
            setIsLoading(false);
        }
      },
    onerror(err: any) {
        console.error('EventSource failed:', err);
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMessageIndex = newMessages.length - 1;
          if (lastMessageIndex >= 0) {
            newMessages[lastMessageIndex] = {
                ...newMessages[lastMessageIndex],
                text: "An unexpected network error occurred. Please check your connection and try again.",
            };
          }
          return newMessages;
        });
        setIsLoading(false);
        throw err; // This stops the library from retrying
      }
    });
  };
  
  const handleAction = (action: string) => {
    setSuggestions([]); // Clear suggestions after clicking one
    const lastAiResponse = messages.filter(m => !m.isUser).pop()?.text;

    if (action === 'GENERATE_VIDEO') {
        if (lastAiResponse) {
            handleGenerateVideo(lastAiResponse);
        }
    } else if (action === 'CREATE_QUIZ') {
        // In the future, this would trigger a new query to the backend for a quiz
        handleSend("Test my understanding with a few questions");
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleSend(input);
    setInput('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };
  
  return (
    <div className="flex flex-col h-screen bg-white">
      <header className="bg-white shadow-md p-4">
        <h1 className="text-2xl font-bold text-gray-800">IVidya AI Concept Tutor</h1>
        <p className="text-sm text-gray-500">Prototype based on Class VI (NCERT) Science chapter on Magnets</p>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-10">
          {messages.length > 0 ? (
            <div className="space-y-8">
              {messages.map((msg, index) => (
                <div key={index}>
                  <div className="font-bold text-gray-800">{msg.isUser ? 'You' : 'AI Tutor'}</div>
                  <div className="mt-2 text-gray-700">
                    <article className="prose prose-sm max-w-none">
                        <ReactMarkdown>{msg.text || '...'}</ReactMarkdown>
                    </article>
                    {/* --- NEW: Display Suggestion Buttons --- */}
                      { !isLoading && !msg.isUser && index === messages.length - 1 && suggestions.length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-2">
                              {suggestions.map((s, i) => (
                                  <button 
                                      key={i}
                                      onClick={() => handleAction(s.action)}
                                      className="px-3 py-1.5 text-sm bg-blue-100 text-blue-800 rounded-full hover:bg-blue-200 transition-colors"
                                  >
                                      {s.label}
                                  </button>
                              ))}
                          </div>
                      )}
                     {/* --- Video Status and Player Logic --- */}
                    { !msg.isUser && index === messages.length - 1 && (
                      <div className="mt-4">
                        { videoStatus && videoStatus !== 'COMPLETE' && (
                          <p className="text-sm text-gray-500 italic">
                            {videoStatus.startsWith('FAILED') ? `Video generation failed.` : `Generating video... (${videoStatus})`}
                          </p>
                        )}
                        { videoUrl && (
                          <div className="mt-4">
                            <p className="text-sm font-semibold text-gray-600 mb-2">Here is your video explanation:</p>
                            <video controls src={videoUrl} className="w-full rounded-lg" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          ) : (
            <div className="text-center pt-20">
              
            </div>
          )}
        </div>
      </div>

      {/* --- New Textarea Input --- */}
      <div className="px-4 pb-4">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              className="w-full p-4 pr-16 border border-gray-300 rounded-2xl shadow-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ask a question..."
              disabled={isLoading}
            />
            <button
              type="submit"
              className="absolute right-4 bottom-3 p-2 bg-blue-500 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
              disabled={isLoading || !input.trim()}
            >
              <UpArrowIcon />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}