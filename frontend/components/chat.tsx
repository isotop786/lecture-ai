'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User } from 'lucide-react';
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import ReactMarkdown from "react-markdown";



interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

export default function Chat() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string>('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [key, setKey] = useState<string>('');
    const [action, setAction] = useState<string>("");
    const [nextStep, setNextStep] = useState<string | null>(null);


    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

     const uploadPdf = async (file: File) => {
    // Get signed URL
    const res = await fetch("/api/upload-url", {
        method: "POST",
        body: JSON.stringify({
            fileName: file.name,
            fileType: file.type,
        }),
    });

    const { uploadUrl, key } = await res.json();

    // Upload directly to S3
    await fetch(uploadUrl, {
        method: "PUT",
        headers: {
            "Content-Type": file.type,
        },
        body: file,
    });

    console.log("Uploaded to S3:", key);
    setKey(key);

    // Trigger chat immediately
    // 
    if(key){
        await sendMessage({message: `I have uploaded a new PDF: ${file.name}`});
    }
  
};

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  setIsLoading(true);

  if (!action) {
    alert("Please select an option");
    return;
  }
  setNextStep("next");

   try {
            const response = await fetch('http://localhost:8000/chat2', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: `Please generate a ${action} for the uploaded PDF`,
                    session_id: sessionId || undefined,
                    key:key,
                }),
            });

            if (!response.ok) throw new Error('Failed to send message');

            const data = await response.json();

            if (!sessionId) {
                setSessionId(data.session_id);
            }

            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: data.response,
                timestamp: new Date(),
            };

            setMessages(prev => [...prev, assistantMessage]);
        } catch (error) {
            console.error('Error:', error);
            // Add error message
            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: 'Sorry, I encountered an error. Please try again.',
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
};



    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const sendMessage = async ({message}: {message: string}) => {
        if (!input.trim() || isLoading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input,
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);
        setNextStep("next");

        try {
            const response = await fetch('http://localhost:8000/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: input,
                    session_id: sessionId || undefined,
                    key:key,
                }),
            });

            if (!response.ok) throw new Error('Failed to send message');

            const data = await response.json();

            if (!sessionId) {
                setSessionId(data.session_id);
            }

            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: data.response,
                timestamp: new Date(),
            };

            setMessages(prev => [...prev, assistantMessage]);
        } catch (error) {
            console.error('Error:', error);
            // Add error message
            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: 'Sorry, I encountered an error. Please try again.',
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
           sendMessage({message: input});
        }
    };

    return (
        <>
        

{nextStep === null && (
    <div>
        <div className="grid w-full max-w-sm items-center gap-3">
        <Label htmlFor="picture">Selec lecture file</Label>
        <Input type="file"
        accept="application/pdf"
        onChange={(e) => e.target.files && uploadPdf(e.target.files[0])} />
        </div>

            {/* Input */}
            {key.length > 0 && (
               <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
  <form onSubmit={handleSubmit} className="space-y-4">
    <h3 className="text-sm font-semibold text-gray-700">
      What would you like to generate?
    </h3>

    {/* Option 1 */}
    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition">
      <input
        type="radio"
        name="action"
        value="summary"
        checked={action === "summary"}
        onChange={(e) => setAction(e.target.value)}
        className="h-4 w-4 text-slate-700 focus:ring-slate-600"
        disabled={isLoading}
      />
      <span className="text-gray-800 text-sm">
        📄 Summarize lecture
      </span>
    </label>

    {/* Option 2 */}
    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition">
      <input
        type="radio"
        name="action"
        value="at least 20 mcqs"
        checked={action === "at least 20 mcqs"}
        onChange={(e) => setAction(e.target.value)}
        className="h-4 w-4 text-slate-700 focus:ring-slate-600"
        disabled={isLoading}
      />
      <span className="text-gray-800 text-sm">
        📝 Multiple Choice Questions
      </span>
    </label>

    {/* Option 3 */}
    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition">
      <input
        type="radio"
        name="action"
        value="brainstorm"
        checked={action === "brainstorm"}
        onChange={(e) => setAction(e.target.value)}
        className="h-4 w-4 text-slate-700 focus:ring-slate-600"
        disabled={isLoading}
      />
      <span className="text-gray-800 text-sm">
        🧠 Brainstroming
      </span>
    </label>

    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition">
      <input
        type="radio"
        name="action"
        value="analyze"
        checked={action === "analyze"}
        onChange={(e) => setAction(e.target.value)}
        className="h-4 w-4 text-slate-700 focus:ring-slate-600"
        disabled={isLoading}
      />
      <span className="text-gray-800 text-sm">
        Analyze lecture
      </span>
    </label>

    {/* Submit */}
    <button
      type="submit"
      disabled={!action || isLoading}

      className="w-full mt-2 bg-slate-700 text-white py-2 rounded-lg hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isLoading ? "Generating..." : "Generate"}
    </button>
  </form>
</div>
)}
</div>
)}

            { nextStep === "next" && (

                <div className="flex flex-col h-full bg-gray-50 rounded-lg shadow-lg">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-700 to-slate-800 text-white p-4 rounded-t-lg">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Bot className="w-6 h-6" />
                    Lecture AI
                </h2>
                <p className="text-sm text-slate-300 mt-1">Your AI course companion</p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                    <div className="text-center text-gray-500 mt-8">
                        <Bot className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                        <p>Hello! I&apos;m your Knowledge Assistant.</p>
                        {/* <p className="text-sm mt-2">Ask me anything about AI deployment!</p> */}
                    </div>
                )}

                {messages.map((message) => (
                    <div
                        key={message.id}
                        className={`flex gap-3 ${
                            message.role === 'user' ? 'justify-end' : 'justify-start'
                        }`}
                    >
                        {message.role === 'assistant' && (
                            <div className="flex-shrink-0">
                                <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center">
                                    <Bot className="w-5 h-5 text-white" />
                                </div>
                            </div>
                        )}

                        <div
                            className={`max-w-[70%] rounded-lg p-3 ${
                                message.role === 'user'
                                    ? 'bg-slate-700 text-white'
                                    : 'bg-white border border-gray-200 text-gray-800'
                            }`}
                        >
                            {/* <p className="whitespace-pre-wrap">{message.content}</p> */}
                            
                              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                                  {message.content}
                              </ReactMarkdown>
                         
                            <p
                                className={`text-xs mt-1 ${
                                    message.role === 'user' ? 'text-slate-300' : 'text-gray-500'
                                }`}
                            >
                                {message.timestamp.toLocaleTimeString()}
                            </p>
                        </div>

                        {message.role === 'user' && (
                            <div className="flex-shrink-0">
                                <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center">
                                    <User className="w-5 h-5 text-white" />
                                </div>
                            </div>
                        )}
                    </div>
                ))}

                {isLoading && (
                    <div className="flex gap-3 justify-start">
                        <div className="flex-shrink-0">
                            <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center">
                                <Bot className="w-5 h-5 text-white" />
                            </div>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-lg p-3">
                            <div className="flex space-x-2">
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100" />
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200" />
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

    
        

                 <div className="border-t border-gray-200 p-4 bg-white rounded-b-lg">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyPress}
                        placeholder="Type your message..."
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-600 focus:border-transparent text-gray-800"
                        disabled={isLoading}
                    />
                    <button
                        onClick={() => sendMessage({ message: input })}
                        disabled={!input.trim() || isLoading}
                        className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <Send className="w-5 h-5" />
                    </button>
                </div>
            </div>
          
           
        </div>
                
            )}
        </>
    )

}