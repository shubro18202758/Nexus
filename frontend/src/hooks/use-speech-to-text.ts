"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface UseSpeechToTextProps {
    onResult?: (transcript: string) => void;
    continuous?: boolean;
    lang?: string;
}

export function useSpeechToText({
    onResult,
    continuous = false,
    lang = "en-US",
}: UseSpeechToTextProps = {}) {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState("");
    const [error, setError] = useState<string | null>(null);
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        if (typeof window !== "undefined" && (window as any).webkitSpeechRecognition) {
            // @ts-ignore
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = continuous;
            recognitionRef.current.interimResults = true;
            recognitionRef.current.lang = lang;

            recognitionRef.current.onresult = (event: any) => {
                let currentTranscript = "";
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        currentTranscript += event.results[i][0].transcript;
                    }
                }
                if (currentTranscript) {
                    setTranscript(currentTranscript);
                    onResult?.(currentTranscript);
                }
            };

            recognitionRef.current.onerror = (event: any) => {
                console.error("Speech recognition error", event.error);
                setError(event.error);
                setIsListening(false);
            };

            recognitionRef.current.onend = () => {
                setIsListening(false);
            };
        } else {
            setError("Speech recognition not supported in this browser.");
        }
    }, [continuous, lang, onResult]);

    const startListening = useCallback(() => {
        if (recognitionRef.current && !isListening) {
            try {
                setTranscript("");
                setError(null);
                recognitionRef.current.start();
                setIsListening(true);
            } catch (e) {
                console.error("Failed to start speech recognition:", e);
            }
        }
    }, [isListening]);

    const stopListening = useCallback(() => {
        if (recognitionRef.current && isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
        }
    }, [isListening]);

    const [isSupported, setIsSupported] = useState(false);

    useEffect(() => {
        setIsSupported(typeof window !== "undefined" && !!((window as any).webkitSpeechRecognition || (window as any).SpeechRecognition));
    }, []);

    return {
        isListening,
        transcript,
        startListening,
        stopListening,
        error,
        isSupported,
    };
}
