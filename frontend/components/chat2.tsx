'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Upload, Loader2, Sparkles, FileText, RotateCcw, File, CheckCircle2 } from 'lucide-react';
import { Label } from "@/components/ui/label";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import ReactMarkdown from "react-markdown";

// Types
interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

type ActionType = 'summary' | 'at least 20 mcqs' | 'brainstorm' | 'deep analysis' | 'comprehensive questions with answers' | 'presentation';

interface ActionOption {
    value: ActionType;
    label: string;
    icon: string;
    description: string;
}

// Constants
const ACTION_OPTIONS: ActionOption[] = [
    { value: 'summary', label: 'Summarize', icon: '📄', description: 'Get a concise overview' },
    { value: 'at least 20 mcqs', label: 'MCQ Quiz', icon: '✅', description: 'Test your knowledge' },
    { value: 'brainstorm', label: 'Brainstorm', icon: '💡', description: 'Explore ideas & concepts' },
    { value: 'deep analysis', label: 'Deep Analysis', icon: '🔬', description: 'Detailed examination' },
    { value: 'comprehensive questions with answers', label: 'Comprehensive Questions', icon: '📊', description: 'Comprehensive Questions' },
    { value: 'presentation', label: 'Presentation', icon: '👩‍🏫', description: 'Presentation' },
];

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function Chat() {
    // State
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [sessionId, setSessionId] = useState<string>('');
    const [fileKey, setFileKey] = useState<string>('');
    const [selectedAction, setSelectedAction] = useState<ActionType | ''>('');
    const [currentStep, setCurrentStep] = useState<'upload' | 'action' | 'chat'>('upload');
    const [uploadedFileName, setUploadedFileName] = useState<string>('');
    
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Auto-scroll to bottom
    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    // Upload PDF
    const uploadPdf = async (file: File) => {
        if (!file) return;

        setIsUploading(true);
        try {
            // Get signed URL
            const res = await fetch("/api/upload-url", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    fileName: file.name,
                    fileType: file.type,
                }),
            });

            if (!res.ok) throw new Error('Failed to get upload URL');

            const { uploadUrl, key } = await res.json();

            // Upload to S3
            await fetch(uploadUrl, {
                method: "PUT",
                headers: { "Content-Type": file.type },
                body: file,
            });

            setFileKey(key);
            setUploadedFileName(file.name);
            setCurrentStep('action');
        } catch (error) {
            console.error('Upload error:', error);
            alert('Failed to upload file. Please try again.');
        } finally {
            setIsUploading(false);
        }
    };

    // Handle file selection
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.type !== 'application/pdf') {
                alert('Please upload a PDF file');
                return;
            }
            uploadPdf(file);
        }
    };

    // Add message helper
    const addMessage = useCallback((role: 'user' | 'assistant', content: string) => {
        const newMessage: Message = {
            id: `${Date.now()}-${role}`,
            role,
            content,
            timestamp: new Date(),
        };
        setMessages(prev => [...prev, newMessage]);
        return newMessage;
    }, []);

    // Generate initial content
    const handleGenerateContent = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!selectedAction) {
            alert("Please select an option");
            return;
        }

        setIsLoading(true);
        setCurrentStep('chat');

        try {
            const response = await fetch(`${API_BASE_URL}/chat2`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: `Please generate a ${selectedAction} for the uploaded document`,
                    session_id: sessionId || undefined,
                    key: fileKey,
                }),
            });

            if (!response.ok) throw new Error('Failed to generate content');

            const data = await response.json();

            if (!sessionId) {
                setSessionId(data.session_id);
            }

            addMessage('assistant', data.response);
        } catch (error) {
            console.error('Error:', error);
            addMessage('assistant', 'Sorry, I encountered an error generating content. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    // Send chat message
    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const messageText = input;
        setInput('');
        addMessage('user', messageText);
        setIsLoading(true);

        try {
            const response = await fetch(`${API_BASE_URL}/chat2`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: messageText,
                    session_id: sessionId || undefined,
                    key: fileKey,
                }),
            });

            if (!response.ok) throw new Error('Failed to send message');

            const data = await response.json();

            if (!sessionId) {
                setSessionId(data.session_id);
            }

            addMessage('assistant', data.response);
        } catch (error) {
            console.error('Error:', error);
            addMessage('assistant', 'Sorry, I encountered an error. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    // Handle Enter key
    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    // Reset and start over
    const resetChat = () => {
        setMessages([]);
        setInput('');
        setSessionId('');
        setFileKey('');
        setSelectedAction('');
        setCurrentStep('upload');
        setUploadedFileName('');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className="flex flex-col h-full bg-gradient-to-br from-slate-900 via-gray-900 to-zinc-900">
            {/* Upload Step */}
            {currentStep === 'upload' && (
                <div className="flex items-center justify-center min-h-screen p-4">
                    <div className="w-full max-w-lg">
                        {/* Header */}
                        <div className="text-center mb-8">
                            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-emerald-600 to-teal-600 rounded-2xl shadow-lg shadow-emerald-900/50 mb-4">
                                <Sparkles className="w-10 h-10 text-white" />
                            </div>
                            <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent mb-2">
                                MindHive AI
                            </h1>
                            <p className="text-gray-400 text-lg">
                                Transform your lectures into insights
                            </p>
                        </div>

                        {/* Upload Card */}
                        <div className="bg-gradient-to-br from-slate-800/90 to-gray-800/90 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-slate-700">
                            <div className="text-center mb-6">
                                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-emerald-900/50 to-teal-900/50 rounded-xl mb-4">
                                    <Upload className="w-8 h-8 text-emerald-400" />
                                </div>
                                <h2 className="text-2xl font-semibold text-white mb-2">
                                    Upload Your Lecture
                                </h2>
                                <p className="text-gray-400">
                                    Drop your PDF file here to begin
                                </p>
                            </div>

                            <div className="space-y-4">
                                <Label htmlFor="file-upload" className="text-sm font-medium text-gray-300">
                                    Select PDF File
                                </Label>
                                <div className="relative">
                                    <label 
                                        htmlFor="file-upload" 
                                        className="flex items-center justify-center gap-3 px-6 py-8 border-2 border-dashed border-emerald-600/50 hover:border-emerald-500 rounded-xl cursor-pointer transition-all bg-emerald-950/30 hover:bg-emerald-950/50 group"
                                    >
                                        <File className="w-8 h-8 text-emerald-400 group-hover:scale-110 transition-transform" />
                                        <div className="text-left">
                                            <p className="text-white font-medium">Click to browse files</p>
                                            <p className="text-sm text-gray-400">or drag and drop your PDF</p>
                                        </div>
                                        <input
                                            id="file-upload"
                                            ref={fileInputRef}
                                            type="file"
                                            accept="application/pdf"
                                            onChange={handleFileChange}
                                            disabled={isUploading}
                                            className="sr-only"
                                        />
                                    </label>
                                </div>
                                {isUploading && (
                                    <div className="flex items-center justify-center gap-2 text-sm text-emerald-400 bg-emerald-950/50 p-3 rounded-lg border border-emerald-800/50">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span className="font-medium">Uploading your lecture...</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Action Selection Step */}
            {currentStep === 'action' && (
                <div className="flex items-center justify-center min-h-screen p-4">
                    <div className="w-full max-w-2xl">
                        {/* File Info Banner */}
                        <div className="bg-gradient-to-br from-slate-800/90 to-gray-800/90 backdrop-blur-sm rounded-xl p-4 mb-6 border border-slate-700 shadow-xl">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-gradient-to-br from-emerald-900/50 to-teal-900/50 rounded-lg">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm text-gray-400">Uploaded successfully</p>
                                    <p className="font-semibold text-white">{uploadedFileName}</p>
                                </div>
                            </div>
                        </div>

                        {/* Action Selection Card */}
                        <div className="bg-gradient-to-br from-slate-800/90 to-gray-800/90 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-slate-700">
                            <form onSubmit={handleGenerateContent} className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent mb-2">
                                        Choose Your Path
                                    </h2>
                                    <p className="text-gray-400">
                                        What would you like me to create?
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {ACTION_OPTIONS.map((option) => (
                                        <label
                                            key={option.value}
                                            className={`group relative flex flex-col p-5 border-2 rounded-xl cursor-pointer transition-all ${
                                                selectedAction === option.value
                                                    ? 'border-emerald-500 bg-gradient-to-br from-emerald-950/50 to-teal-950/50 shadow-lg shadow-emerald-900/30 scale-[1.02]'
                                                    : 'border-slate-700 bg-slate-800/50 hover:border-emerald-600/50 hover:shadow-md'
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="action"
                                                value={option.value}
                                                checked={selectedAction === option.value}
                                                onChange={(e) => setSelectedAction(e.target.value as ActionType)}
                                                className="sr-only"
                                                disabled={isLoading}
                                            />
                                            <div className="flex items-start gap-3">
                                                <span className="text-3xl">{option.icon}</span>
                                                <div className="flex-1">
                                                    <h3 className="font-semibold text-white mb-1">
                                                        {option.label}
                                                    </h3>
                                                    <p className="text-sm text-gray-400">
                                                        {option.description}
                                                    </p>
                                                </div>
                                            </div>
                                            {selectedAction === option.value && (
                                                <div className="absolute top-3 right-3 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/50">
                                                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                            )}
                                        </label>
                                    ))}
                                </div>

                                <div className="flex gap-3 pt-4">
                                    <button
                                        type="button"
                                        onClick={resetChat}
                                        className="flex-1 py-3 px-6 border-2 border-slate-600 text-gray-300 font-medium rounded-xl hover:bg-slate-700 hover:border-slate-500 transition-all flex items-center justify-center gap-2"
                                    >
                                        <RotateCcw className="w-4 h-4" />
                                        Start Over
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={!selectedAction || isLoading}
                                        className="flex-1 py-3 px-6 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium rounded-xl hover:from-emerald-500 hover:to-teal-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-900/50 hover:shadow-xl flex items-center justify-center gap-2"
                                    >
                                        {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
                                        {isLoading ? "Generating..." : "Generate"}
                                        {!isLoading && <Sparkles className="w-4 h-4" />}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Chat Step */}
            {currentStep === 'chat' && (
                <div className="flex flex-col h-full max-w-5xl mx-auto w-full">
                    <div className="flex flex-col h-full bg-gradient-to-br from-slate-800/90 to-gray-800/90 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-700 overflow-hidden">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-cyan-700 text-white p-5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-white/20 backdrop-blur-sm rounded-xl">
                                        <Bot className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold flex items-center gap-2">
                                            Lecture AI
                                        </h2>
                                        <p className="text-sm text-white/80 truncate max-w-md">
                                            {uploadedFileName}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={resetChat}
                                    className="flex items-center gap-2 text-sm px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg transition-all"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                    New Session
                                </button>
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gradient-to-br from-slate-900 via-gray-900 to-zinc-900">
                            {messages.length === 0 && !isLoading && (
                                <div className="text-center mt-12">
                                    <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-emerald-900/50 to-teal-900/50 rounded-2xl mb-4 border border-emerald-800/50">
                                        <Bot className="w-10 h-10 text-emerald-400" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-white mb-2">Ready to Assist!</h3>
                                    <p className="text-gray-400">Ask me anything about your lecture</p>
                                </div>
                            )}

                            {messages.map((message) => (
                                <div
                                    key={message.id}
                                    className={`flex gap-4 ${
                                        message.role === 'user' ? 'justify-end' : 'justify-start'
                                    }`}
                                >
                                    {message.role === 'assistant' && (
                                        <div className="flex-shrink-0">
                                            <div className="w-10 h-10 bg-gradient-to-br from-emerald-600 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-900/50">
                                                <Bot className="w-6 h-6 text-white" />
                                            </div>
                                        </div>
                                    )}

                                    <div
                                        className={`max-w-[75%] rounded-2xl p-4 shadow-lg ${
                                            message.role === 'user'
                                                ? 'bg-gradient-to-br from-cyan-700 to-blue-700 text-white shadow-cyan-900/50'
                                                : 'bg-slate-800 border border-slate-700 text-gray-100'
                                        }`}
                                    >
                                        <div className={`prose prose-sm max-w-none ${
                                            message.role === 'user' ? 'prose-invert' : 'prose-invert'
                                        }`}>
                                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                                                {message.content}
                                            </ReactMarkdown>
                                        </div>
                                        <p
                                            className={`text-xs mt-3 ${
                                                message.role === 'user' ? 'text-white/70' : 'text-gray-500'
                                            }`}
                                        >
                                            {message.timestamp.toLocaleTimeString()}
                                        </p>
                                    </div>

                                    {message.role === 'user' && (
                                        <div className="flex-shrink-0">
                                            <div className="w-10 h-10 bg-gradient-to-br from-cyan-600 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-900/50">
                                                <User className="w-6 h-6 text-white" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {isLoading && (
                                <div className="flex gap-4 justify-start">
                                    <div className="flex-shrink-0">
                                        <div className="w-10 h-10 bg-gradient-to-br from-emerald-600 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-900/50">
                                            <Bot className="w-6 h-6 text-white" />
                                        </div>
                                    </div>
                                    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 shadow-lg">
                                        <div className="flex space-x-2">
                                            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce" />
                                            <div className="w-3 h-3 bg-teal-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                                            <div className="w-3 h-3 bg-cyan-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <div className="border-t border-slate-700 p-5 bg-slate-800/90">
                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyPress}
                                    placeholder="Ask me anything about your lecture..."
                                    className="flex-1 px-5 py-3 border-2 border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white placeholder-gray-500 bg-slate-900/50"
                                    disabled={isLoading}
                                />
                                <button
                                    onClick={sendMessage}
                                    disabled={!input.trim() || isLoading}
                                    className="px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:from-emerald-500 hover:to-teal-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-900/50 hover:shadow-xl"
                                    aria-label="Send message"
                                >
                                    <Send className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}