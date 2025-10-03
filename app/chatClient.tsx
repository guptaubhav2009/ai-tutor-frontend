'use client';

import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { fetchEventSource } from '@microsoft/fetch-event-source';

// --- Icon Components for a polished look ---
const AiIcon = () => (
    <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br from-gray-700 to-gray-900">
         <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 14 4-4-4-4"/><path d="M4 18v-1a4 4 0 0 1 4-4h4"/></svg>
    </div>
);
const UserIcon = () => (
    <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full bg-gray-200 text-gray-600">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    </div>
);
const UpArrowIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 11L12 6L17 11M12 18V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
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

  // Auto-resize the textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${scrollHeight}px`;
    }
  }, [input]);

  // Scroll to the bottom of the chat on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;

    const userMessage: Message = { text: messageText, isUser: true };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setMessages((prev) => [...prev, { text: '', isUser: false }]);

    await fetchEventSource(`${apiUrl}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: messageText }),
      onopen: async (res: { ok: any; status: any; }) => {
        if (!res.ok) throw new Error(`Failed to connect: ${res.status}`);
      },
      onmessage(event: { data: string; }) {
        const parsed = JSON.parse(event.data);
        if (parsed.type === 'content_delta') {
          setMessages(prev => {
            const lastMessage = prev[prev.length - 1];
            lastMessage.text += parsed.data;
            return [...prev.slice(0, -1), lastMessage];
          });
        } else if (parsed.type === 'error') {
          setMessages(prev => {
            const lastMessage = prev[prev.length - 1];
            lastMessage.text = `Sorry, an error occurred: ${parsed.data}`;
            return [...prev.slice(0, -1), lastMessage];
          });
          throw new Error(parsed.data);
        }
      },
      onclose() {
        setIsLoading(false);
      },
      onerror(err: any) {
        setIsLoading(false);
        throw err;
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
    <div className="relative h-screen w-screen flex flex-col bg-white">

      {/* Main chat log area with padding at the bottom to avoid overlapping with the input bar */}
      <div className="flex-1 overflow-y-auto pb-40">
        <div className="max-w-3xl mx-auto px-4 pt-10">
          {messages.length > 0 ? (
            <div className="space-y-8">
              {messages.map((msg, index) => (
                <div key={index} className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    {msg.isUser ? <UserIcon /> : <AiIcon />}
                  </div>
                  <div className={`flex-1 pt-0.5 ${!msg.isUser ? 'bg-gray-50 rounded-xl p-4' : ''}`}>
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

      {/* Absolutely positioned input form container */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white to-transparent">
        <div className="max-w-3xl mx-auto px-4 pb-4 pt-8">
          <form onSubmit={handleSubmit} className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              className="w-full p-4 pr-16 border border-gray-200 bg-gray-50 rounded-2xl shadow-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ask a question..."
              disabled={isLoading}
            />
            <button
              type="submit"
              className="absolute right-4 bottom-3.5 p-2 bg-blue-500 text-white rounded-full disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
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