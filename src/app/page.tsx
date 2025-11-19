import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Map, Share2, Download } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col items-center">
      {/* Hero Section */}
      <section className="w-full py-20 md:py-32 bg-gradient-to-b from-blue-50 to-white text-center px-4">
        <div className="container mx-auto max-w-4xl">
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-gray-900 mb-6">
            Turn Shapes into <span className="text-blue-600">Routes</span>
          </h1>
          <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
            Upload an image or draw a shape, and Routista will generate a real-world GPS route that matches it. Perfect for running, cycling, or just exploring.
          </p>
          <Link href="/create">
            <Button size="lg" className="text-lg px-8 py-6 h-auto rounded-full shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1">
              Create Your Route
            </Button>
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section className="w-full py-20 bg-white px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-3 gap-12">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 mb-6">
                <Map className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold mb-3">Any Shape, Anywhere</h3>
              <p className="text-gray-600">
                Upload a heart, a star, or your logo. We'll find the best matching roads in your chosen area.
              </p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center text-green-600 mb-6">
                <Download className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold mb-3">Export to GPX</h3>
              <p className="text-gray-600">
                Download your route as a GPX file and use it with your favorite fitness app or GPS device.
              </p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center text-purple-600 mb-6">
                <Share2 className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold mb-3">Share the Fun</h3>
              <p className="text-gray-600">
                Create unique GPS art for birthdays, events, or just to spice up your daily workout.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
