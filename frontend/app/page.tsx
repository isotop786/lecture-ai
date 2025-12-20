import Chat from '@/components/chat';
import Chat2 from '@/components/chat2';
import { Sparkles, Brain, Zap } from 'lucide-react';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-zinc-900">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header Section */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-emerald-600 to-teal-600 rounded-2xl shadow-lg shadow-emerald-900/50 mb-4">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-5xl font-bold mb-3">
              <span className="bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 bg-clip-text text-transparent">
                Lecture AI
              </span>
            </h1>
            <p className="text-gray-400 text-lg mb-6">
              Your AI-powered course companion
            </p>
            
            {/* Feature Pills */}
            <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-full text-sm text-gray-300">
                <Brain className="w-4 h-4 text-emerald-400" />
                Smart Analysis
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-full text-sm text-gray-300">
                <Zap className="w-4 h-4 text-teal-400" />
                Instant Results
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-full text-sm text-gray-300">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                AI-Powered
              </div>
            </div>
          </div>

          {/* Chat Component */}
          <div className="h-[auto] rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
            <Chat2 />
          </div>

          {/* Footer */}
          <footer className="mt-8 text-center">
            <div className="inline-flex flex-col items-center gap-2 px-6 py-4 bg-slate-800/50 border border-slate-700 rounded-xl backdrop-blur-sm">
              <p className="text-sm text-gray-400">
                Powered by Advanced AI Technology
              </p>
              <p className="text-xs text-gray-500">
                &copy; {new Date().getFullYear()}  Lecture AI. Transform your learning experience.
              </p>
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
}