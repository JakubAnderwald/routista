import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Map, Share2, Download, Coffee } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col items-center min-h-screen">
      {/* Hero Section */}
      <section className="w-full py-6 md:py-8 bg-gradient-to-b from-blue-50 to-white text-center px-4">
        <div className="container mx-auto max-w-4xl">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900 mb-4">
            Turn Shapes into <span className="text-blue-600">Routes</span>
          </h1>
          <p className="text-lg text-gray-600 mb-6 max-w-2xl mx-auto">
            Upload an image or draw a shape, and Routista will generate a real-world GPS route that matches it. Perfect for running, cycling, or just exploring.
          </p>
          <Link href="/create">
            <Button size="lg" className="text-base px-6 py-3 h-auto rounded-full shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1">
              Create Your Route
            </Button>
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section className="w-full py-6 bg-white px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 mb-3">
                <Map className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold mb-2">Any Shape, Anywhere</h3>
              <p className="text-sm text-gray-600">
                Upload a heart, a star, or your logo. We'll find the best matching roads in your chosen area.
              </p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center text-green-600 mb-3">
                <Download className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold mb-2">Export to GPX</h3>
              <p className="text-sm text-gray-600">
                Download your route as a GPX file and use it with your favorite fitness app or GPS device.
              </p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center text-purple-600 mb-3">
                <Share2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold mb-2">Share the Fun</h3>
              <p className="text-sm text-gray-600">
                Create unique GPS art for birthdays, events, or just to spice up your daily workout.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Support Section */}
      <section className="w-full flex-grow py-6 bg-gradient-to-b from-white to-amber-50 px-4">
        <div className="container mx-auto max-w-2xl text-center">
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-amber-100">
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center shadow-md">
                <Coffee className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">
                Enjoying Routista?
              </h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              This service is completely free! If it helped you create an amazing route, consider supporting development with a coffee ☕
            </p>
            <a
              href="https://buymeacoffee.com/jakubanderwald"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block"
            >
              <Button
                size="md"
                className="px-5 py-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5"
              >
                <Coffee className="w-4 h-4 mr-2" />
                Buy Me a Coffee
              </Button>
            </a>
            <p className="text-xs text-gray-500 mt-3">
              Every coffee fuels new features! 🚀
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
