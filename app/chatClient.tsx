'use client';

import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { fetchEventSource } from '@microsoft/fetch-event-source';

// --- Icon Components ---
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

type Suggestion = { label: string; action: string; };

// --- Main Chat Component ---
export default function ChatClient({ apiUrl }: { apiUrl: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Video generation state
  const [videoJobId, setVideoJobId] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState('');
  const [videoUrl, setVideoUrl] = useState('');

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Polling logic for video status
  useEffect(() => {
    if (!videoJobId) return;
    const attempts = { current: 0 };
    const maxAttempts = 24; // 2 minutes timeout

    const interval = setInterval(async () => {
      if (attempts.current > maxAttempts) {
        clearInterval(interval);
        setVideoStatus('TIMED_OUT');
        setVideoJobId(null);
        return;
      }
      attempts.current += 1;
      
      try {
        const res = await fetch(`${apiUrl}/video-status/${videoJobId}`);
        if (!res.ok) throw new Error("Failed to fetch status");
        const data = await res.json();
        setVideoStatus(data.status);
        if (data.status === 'COMPLETE') {
          setVideoUrl(data.video_url);
          setVideoJobId(null);
          clearInterval(interval);
        } else if (data.status === 'FAILED') {
          setVideoJobId(null);
          clearInterval(interval);
        }
      } catch (e) {
        setVideoStatus('FAILED');
        setVideoJobId(null);
        clearInterval(interval);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [videoJobId, apiUrl]);

  const handleGenerateVideo = async (textContent: string) => {
    if (!textContent) return;
    setVideoStatus('REQUESTED');
    try {
      const res = await fetch(`${apiUrl}/generate-video`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text_content: textContent }) });
      if (!res.ok) { const error = await res.json(); throw new Error(error.detail || "Failed to start video."); }
      const data = await res.json();
      setVideoJobId(data.job_id);
    } catch (err: any) { setVideoStatus(`FAILED: ${err.message}`); }
  };

  const handleAction = (action: string) => {
    setSuggestions([]);
    const lastAiResponse = messages.filter(m => !m.isUser).pop()?.text;
    if (action === 'GENERATE_VIDEO') 
      { 
        if (lastAiResponse) { 
          handleGenerateVideo(lastAiResponse); 
        }
      }  
    else if (action === 'CREATE_QUIZ') 
      { 
        handleSend("Lets test the understanding with a few questions"); 
      }
      else {
        // Handle any unknown or future actions gracefully.
        const unsupportedActionMessage: Message = {
            text: `Sorry, the "${action.toLowerCase().replace('_', ' ')}" feature is coming soon.`,
            isUser: false
        };
        setMessages(prev => [...prev, unsupportedActionMessage]);
    }
  };

  const handleSend = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;

     // Clear any previous state
    setVideoJobId(null);
    setVideoStatus('');
    setVideoUrl('');
    setSuggestions([]);

    const userMessage: Message = { text: messageText, isUser: true };
    const newMessagesHistory = [...messages, userMessage];
    setMessages(newMessagesHistory);
    setIsLoading(true);
  
    const ctrl = new AbortController();
    try {
     
      await fetchEventSource(`${apiUrl}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: messageText,
          chat_history: newMessagesHistory.slice(0, -1).slice(-6)
        }),
        signal: ctrl.signal,
        onopen: async (res) => {
          if (!res.ok){
              throw new Error(`Failed to connect: ${res.status}`);
          } 
          setMessages((prev) => [...prev, { text: '', isUser: false }]);
        },
        onmessage(event: { data: string; }) {
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.type === 'content_delta') {
              setMessages(prev => {
                const newMessages = [...prev];
                const lastMessageIndex = newMessages.length - 1;
                newMessages[lastMessageIndex] = { ...newMessages[lastMessageIndex], text: newMessages[lastMessageIndex].text + parsed.data };
                return newMessages;
              });
            } else if (parsed.type === 'error') {
              // --- Logic for handling specific errors sent by the backend ---
              setMessages(prev => {
                const newMessages = [...prev];
                const lastMessageIndex = newMessages.length - 1;
                if (lastMessageIndex >= 0) {
                    newMessages[lastMessageIndex] = {
                        ...newMessages[lastMessageIndex],
                        text: `Sorry, an error occurred: ${parsed.data}`,
                    };
                }
                return newMessages;
              });
              ctrl.abort(); // Gracefully stop the stream});
            } else if (parsed.type === 'suggestion') {
              setSuggestions(prev => [...prev, parsed.payload]);
            } else if (parsed.type === 'video_job_started') {
              setVideoJobId(parsed.job_id);
            } else if (parsed.type === 'stream_end') {
              // The stream ended, the finally block will handle the loading state
            }
          } catch (e) {
            console.error("Malformed stream event:", event.data);
          }
        },
        onclose() {
          setIsLoading(false);
          console.log("Stream closed by server.");
        },
        onerror(err: any) {
          console.error('EventSource failed:', err);
          throw err;
        }
      });
    } catch (err) {
      setMessages(prev => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage && !lastMessage.isUser && lastMessage.text === '') {
            newMessages[newMessages.length - 1].text = "An unexpected network error occurred. Please try again.";
        } else {
            newMessages.push({ text: "An unexpected network error occurred. Please try again.", isUser: false });
        }
        return newMessages;
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

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };
  
  return (
    <div className="relative h-screen w-screen flex flex-col bg-white">
      <header className="bg-white shadow-md p-4">
        <h1 className="text-2xl font-bold text-gray-800">IVidya AI Concept Tutor</h1>
        <p className="text-sm text-gray-500">Prototype based on Class VI (NCERT) Science chapter on Magnets</p>
      </header>
      <div className="flex-1 overflow-y-auto pb-40">
        <div className="max-w-3xl mx-auto px-4 pt-10">
          {messages.length > 0 ? (
            <div className="space-y-8">
              {messages.map((msg, index) => (
                <div key={index} className="flex items-start gap-4">
                  <div className="flex-shrink-0">{msg.isUser ? <UserIcon /> : <AiIcon />}</div>
                  <div className={`flex-1 pt-0.5 ${!msg.isUser ? 'bg-gray-50 rounded-xl p-4' : ''}`}>
                    <article className="prose prose-sm max-w-none"><ReactMarkdown>{msg.text || (isLoading && index === messages.length - 1 ? '...' : '')}</ReactMarkdown></article>
                    { !isLoading && !msg.isUser && index === messages.length - 1 && suggestions.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {suggestions.map((s, i) => ( <button key={i} onClick={() => handleAction(s.action)} className="px-3 py-1.5 text-sm bg-blue-100 text-blue-800 rounded-full hover:bg-blue-200 transition-colors">{s.label}</button> ))}
                      </div>
                    )}
                    {/* Video Status and Player Logic */}
                    { !msg.isUser && index === messages.length - 1 && (
                      <div className="mt-4">
                        { videoStatus && videoStatus !== 'COMPLETE' && (
                          <p className="text-sm text-gray-500 italic">
                            {videoStatus.startsWith('FAILED') || videoStatus === 'TIMED_OUT' ? `Video generation failed.` : `Generating video... (${videoStatus})`}
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