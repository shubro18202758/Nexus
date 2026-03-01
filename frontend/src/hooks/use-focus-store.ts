import { create } from "zustand";

interface FocusState {
    isFocusMode: boolean;
    setFocusMode: (value: boolean) => void;
    toggleFocusMode: () => void;
}

export const useFocusStore = create<FocusState>((set) => ({
    isFocusMode: false,
    setFocusMode: (value) => set({ isFocusMode: value }),
    toggleFocusMode: () => set((state) => ({ isFocusMode: !state.isFocusMode })),
}));
