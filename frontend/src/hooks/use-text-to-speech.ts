"use client";

import { useState, useEffect, useCallback } from "react";

export function useTextToSpeech() {
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);

    useEffect(() => {
        if (typeof window !== "undefined" && window.speechSynthesis) {
            const loadVoices = () => {
                const availableVoices = window.speechSynthesis.getVoices();
                setVoices(availableVoices);
                // Prefer Google US English or Microsoft Zira
                const preferred = availableVoices.find(
                    (v) => v.name.includes("Google US English") || v.name.includes("Zira")
                );
                if (preferred) setSelectedVoice(preferred);
            };

            loadVoices();
            window.speechSynthesis.onvoiceschanged = loadVoices;
        }
    }, []);

    const speak = useCallback((text: string) => {
        if (typeof window !== "undefined" && window.speechSynthesis) {
            // Cancel any current speaking
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            if (selectedVoice) utterance.voice = selectedVoice;

            utterance.onstart = () => setIsSpeaking(true);
            utterance.onend = () => setIsSpeaking(false);
            utterance.onerror = () => setIsSpeaking(false);

            window.speechSynthesis.speak(utterance);
        }
    }, [selectedVoice]);

    const stop = useCallback(() => {
        if (typeof window !== "undefined" && window.speechSynthesis) {
            window.speechSynthesis.cancel();
            setIsSpeaking(false);
        }
    }, []);

    return {
        isSpeaking,
        speak,
        stop,
        voices,
        selectedVoice,
        setSelectedVoice
    };
}
