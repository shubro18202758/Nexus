"use client";

import { useState } from "react";
import { Play, ExternalLink } from "lucide-react";

function getYouTubeId(url: string): string | null {
    const regex = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

export function VideoEmbed({ url, title }: { url: string; title: string }) {
    const [loaded, setLoaded] = useState(false);
    const videoId = getYouTubeId(url);

    // YouTube embed with lazy loading (click to load)
    if (videoId) {
        const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

        return (
            <div className="relative aspect-video bg-black/50 overflow-hidden group/video">
                {!loaded ? (
                    <button
                        onClick={() => setLoaded(true)}
                        className="relative w-full h-full"
                    >
                        <img
                            src={thumbnailUrl}
                            alt={title}
                            className="w-full h-full object-cover opacity-70 group-hover/video:opacity-90 transition-opacity"
                            loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center shadow-[0_0_30px_rgba(220,38,38,0.4)] group-hover/video:scale-110 transition-transform">
                                <Play className="h-6 w-6 text-white fill-current ml-1" />
                            </div>
                        </div>
                        <div className="absolute bottom-2 left-3 right-3">
                            <span className="text-[9px] font-mono text-red-400 tracking-wider flex items-center gap-1">
                                <Play className="h-2.5 w-2.5 fill-current" /> YOUTUBE
                            </span>
                        </div>
                    </button>
                ) : (
                    <iframe
                        src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
                        title={title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="w-full h-full"
                    />
                )}
            </div>
        );
    }

    // Generic video link
    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 p-3 bg-red-500/5 border-b border-white/[0.04] hover:bg-red-500/10 transition-all"
        >
            <Play className="h-4 w-4 text-red-400 fill-current" />
            <span className="text-xs font-mono text-red-300 tracking-wider">Watch Video</span>
            <ExternalLink className="h-3 w-3 text-red-400/50 ml-auto" />
        </a>
    );
}
