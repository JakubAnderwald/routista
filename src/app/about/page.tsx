import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Heart, Coffee, Github, Code2 } from "lucide-react";

export default function About() {
    return (
        <div className="flex flex-col items-center">
            {/* Hero Section */}
            <section className="w-full py-12 md:py-16 bg-gradient-to-b from-blue-50 to-white text-center px-4">
                <div className="container mx-auto max-w-4xl">
                    <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-gray-900 mb-4">
                        About <span className="text-blue-600">Routista</span>
                    </h1>
                    <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                        Turn any shape into a real-world GPS route! 🏃‍♂️🎨
                    </p>
                </div>
            </section>

            {/* Main Content */}
            <section className="w-full py-12 px-4">
                <div className="container mx-auto max-w-4xl">
                    {/* What is Routista */}
                    <div className="mb-12">
                        <h2 className="text-3xl font-bold mb-4 text-gray-900">What is Routista?</h2>
                        <p className="text-lg text-gray-600 mb-4">
                            Routista is a fun, free tool for runners, cyclists, and explorers who want to create GPS art or just spice up their training. Upload an image (logo, symbol, drawing) or draw directly on the map, and Routista will find the best matching roads in your chosen area.
                        </p>
                    </div>

                    {/* How It Works */}
                    <div className="mb-12">
                        <h2 className="text-3xl font-bold mb-6 text-gray-900">How It Works</h2>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-xl">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-8 h-8 bg-blue-600 text-white font-bold rounded-full flex items-center justify-center">1</div>
                                    <h3 className="text-xl font-bold text-gray-900">Select Area</h3>
                                </div>
                                <p className="text-gray-700">Choose where you want to run or cycle</p>
                            </div>
                            <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-xl">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-8 h-8 bg-purple-600 text-white font-bold rounded-full flex items-center justify-center">2</div>
                                    <h3 className="text-xl font-bold text-gray-900">Input Shape</h3>
                                </div>
                                <p className="text-gray-700">Upload an image or draw a shape</p>
                            </div>
                            <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-xl">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-8 h-8 bg-green-600 text-white font-bold rounded-full flex items-center justify-center">3</div>
                                    <h3 className="text-xl font-bold text-gray-900">Generate</h3>
                                </div>
                                <p className="text-gray-700">The algorithm snaps your shape to real-world streets</p>
                            </div>
                            <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded-xl">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-8 h-8 bg-orange-600 text-white font-bold rounded-full flex items-center justify-center">4</div>
                                    <h3 className="text-xl font-bold text-gray-900">Export</h3>
                                </div>
                                <p className="text-gray-700">Get your GPX file and go!</p>
                            </div>
                        </div>
                    </div>

                    {/* Tech Stack */}
                    <div className="mb-12">
                        <h2 className="text-3xl font-bold mb-4 text-gray-900 flex items-center gap-2">
                            <Code2 className="w-8 h-8 text-blue-600" />
                            Tech Stack
                        </h2>
                        <p className="text-lg text-gray-600 mb-6">Built with modern web technologies:</p>
                        <div className="grid sm:grid-cols-2 gap-3">
                            <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg">
                                <span className="text-gray-700">Framework:</span>
                                <span className="font-semibold text-gray-900">Next.js 16</span>
                            </div>
                            <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg">
                                <span className="text-gray-700">UI Library:</span>
                                <span className="font-semibold text-gray-900">React 19</span>
                            </div>
                            <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg">
                                <span className="text-gray-700">Styling:</span>
                                <span className="font-semibold text-gray-900">Tailwind CSS 4</span>
                            </div>
                            <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg">
                                <span className="text-gray-700">Maps:</span>
                                <span className="font-semibold text-gray-900">Leaflet</span>
                            </div>
                            <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg">
                                <span className="text-gray-700">Testing:</span>
                                <span className="font-semibold text-gray-900">Vitest</span>
                            </div>
                            <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg">
                                <span className="text-gray-700">Deployment:</span>
                                <span className="font-semibold text-gray-900">Firebase Hosting</span>
                            </div>
                        </div>
                    </div>

                    {/* Features */}
                    <div className="mb-12">
                        <h2 className="text-3xl font-bold mb-4 text-gray-900">Features</h2>
                        <ul className="space-y-3">
                            <li className="flex items-start gap-3">
                                <span className="text-blue-600 text-xl">✨</span>
                                <div>
                                    <span className="font-semibold text-gray-900">Shape-to-Route Magic:</span>
                                    <span className="text-gray-600"> Upload an image or draw directly on the map</span>
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="text-blue-600 text-xl">🗺️</span>
                                <div>
                                    <span className="font-semibold text-gray-900">Interactive Mapping:</span>
                                    <span className="text-gray-600"> Powered by Leaflet, select any location in the world</span>
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="text-blue-600 text-xl">📥</span>
                                <div>
                                    <span className="font-semibold text-gray-900">GPX Export:</span>
                                    <span className="text-gray-600"> Compatible with Strava, Garmin, and other fitness apps</span>
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="text-blue-600 text-xl">🔒</span>
                                <div>
                                    <span className="font-semibold text-gray-900">Privacy Focused:</span>
                                    <span className="text-gray-600"> All processing happens in your browser</span>
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="text-blue-600 text-xl">🆓</span>
                                <div>
                                    <span className="font-semibold text-gray-900">Completely Free:</span>
                                    <span className="text-gray-600"> No paywalls or subscriptions</span>
                                </div>
                            </li>
                        </ul>
                    </div>

                    {/* Creator Section */}
                    <div className="mb-12 bg-gradient-to-br from-gray-50 to-gray-100 p-8 rounded-2xl">
                        <div className="flex items-center gap-3 mb-4">
                            <Heart className="w-6 h-6 text-red-500" />
                            <h2 className="text-2xl font-bold text-gray-900">Created By</h2>
                        </div>
                        <p className="text-lg text-gray-700 mb-4">
                            Built with ❤️ by <span className="font-semibold">Jakub Anderwald</span>
                        </p>
                        <p className="text-gray-600 mb-6">
                            Routista is a passion project designed to bring creativity to fitness activities. Whether you're planning a heart-shaped run for Valentine's Day or want to spell out your initials across your city, Routista makes GPS art accessible to everyone.
                        </p>
                    </div>

                    {/* Support & Contributing */}
                    <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-8 rounded-2xl border border-amber-100">
                        <div className="flex items-center gap-3 mb-4">
                            <Coffee className="w-6 h-6 text-orange-600" />
                            <h2 className="text-2xl font-bold text-gray-900">Support the Project</h2>
                        </div>
                        <p className="text-gray-700 mb-6">
                            If you enjoy using Routista, consider buying me a coffee! Your support helps keep the service free and fuels new features.
                        </p>
                        <div className="flex flex-wrap gap-4">
                            <a
                                href="https://buymeacoffee.com/jakubanderwald"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <Button className="px-6 py-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5">
                                    <Coffee className="w-4 h-4 mr-2" />
                                    Buy Me a Coffee
                                </Button>
                            </a>
                            <a
                                href="https://github.com/JakubAnderwald/routista"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <Button variant="outline" className="px-6 py-2 rounded-full border-2 border-gray-300 hover:border-gray-400 transition-all">
                                    <Github className="w-4 h-4 mr-2" />
                                    View on GitHub
                                </Button>
                            </a>
                        </div>
                        <p className="text-sm text-gray-600 mt-4">
                            Contributions are welcome! Feel free to open issues or submit pull requests.
                        </p>
                    </div>

                    {/* CTA */}
                    <div className="mt-12 text-center">
                        <Link href="/create">
                            <Button size="lg" className="text-lg px-8 py-6 h-auto rounded-full shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1">
                                Start Creating Routes
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
