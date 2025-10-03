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

// --- Main Chat Component ---
export default function ChatClient({ apiUrl }: { apiUrl: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  useEffect(scrollToBottom, [messages]);

    const handleSend = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;

    const userMessage: Message = { text: messageText, isUser: true };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    // Add a placeholder for the AI's response
    setMessages((prev) => [...prev, { text: '', isUser: false }]);

    await fetchEventSource(`${apiUrl}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: messageText }),
      
      onopen: async (res: { ok: any; status: any; }) => {
        if (!res.ok) {
          throw new Error(`Failed to connect: ${res.status}`);
        }
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
            } else if (parsed.type === 'error') {
              throw new Error(parsed.data);
            }
        } catch(e) {
            console.error("Received a malformed stream event:", event.data);
        }
      },

      onclose() {
        // This is called when the stream ends from the server
        setIsLoading(false);
      },
    onerror(err: any) {
        console.error('EventSource failed:', err);
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMessageIndex = newMessages.length - 1;
          if (lastMessageIndex >= 0) {
            newMessages[lastMessageIndex] = {
                ...newMessages[lastMessageIndex],
                text: "An unexpected error occurred. Please try again.",
            };
          }
          return newMessages;
        });
        setIsLoading(false);
        throw err; // This stops the library from retrying
      }
    });
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