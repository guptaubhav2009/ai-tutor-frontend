'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';

type Message = {
  text: string;
  isUser: boolean;
};

export default function ChatClient({ apiUrl }: { apiUrl: string })  {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

const handleSend = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;

    const userMessage: Message = { text: messageText, isUser: true };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    setMessages((prev) => [...prev, { text: '', isUser: false }]);

    try {
      // Use the apiUrl prop for the fetch call
      const response = await fetch(`${apiUrl}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: messageText }),
      });

      if (!response.body) return;
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;
          const chunk = decoder.decode(value);
          setMessages(prev => {
              const lastMessage = prev[prev.length - 1];
              lastMessage.text += chunk;
              return [...prev.slice(0, -1), lastMessage];
          });
      }

    } catch (error) {
      console.error('Error fetching stream:', error);
      setMessages(prev => {
        const lastMessage = prev[prev.length - 1];
        lastMessage.text = "Sorry, an error occurred. Please check the backend connection.";
        return [...prev.slice(0, -1), lastMessage];
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleSend(input);
    setInput('');
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <header className="bg-white shadow-md p-4">
        <h1 className="text-2xl font-bold text-gray-800">iVidya Biology Tutor (NCERT)</h1>
        <p className="text-sm text-gray-500">Prototype based on Photosynthesis Chapter</p>
      </header>
      
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, index) => (
          <div key={index} className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xl p-3 rounded-lg ${msg.isUser ? 'bg-blue-500 text-white' : 'bg-white text-gray-800'}`}>
              <p style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</p>
            </div>
          </div>
        ))}
         <div ref={messagesEndRef} />
      </main>

      <footer className="bg-white p-4">
        <form onSubmit={handleSubmit} className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Ask a question about photosynthesis..."
            disabled={isLoading}
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:bg-blue-300"
            disabled={isLoading}
          >
            {isLoading ? 'Thinking...' : 'Send'}
          </button>
        </form>
      </footer>
    </div>
  );
}