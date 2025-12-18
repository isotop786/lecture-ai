import Chat from '@/components/chat';

export default function Home() {

  const [height, setHeight] = "80vh";
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-center text-gray-800 mb-2">
           Lecture AI
          </h1>
          <p className="text-center text-gray-600 mb-8">
            Your AI course companion
          </p>

           <div className="h-[600px]">
            < Chat />
          </div>

          <footer className="mt-8 text-center text-sm text-gray-500">
            <p>Lecture AI</p>
          </footer>
        </div>
      </div>
    </main>
  );
}