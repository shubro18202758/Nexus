This is the correct approach. Since Copilot has full context of your repo, you shouldn't micromanage the *code*—you should manage the *architecture*.

Here is a set of **5 High-Level Iterative Prompts** designed to guide your Copilot. They move from "Setting the Foundation" to "Building the Brain" to "Connecting the Senses."

Run these **one by one** in your VS Code Chat.

### **Prompt 1: The Foundation (Hybrid Architecture)**

*Goal: To cleanly separate your Next.js frontend from the new Python-based Nanobot engine without breaking your existing build.*

@workspace I want to evolve this project into a hybrid architecture. We are keeping the Next.js app as the frontend "Dashboard," but I need you to create a dedicated backend environment specifically for the **Nanobot** Python framework.

Please analyze my root directory and create a new isolated folder (e.g., neural\_engine) for the Python agent. Set up the necessary scaffolding so that this Python environment can run independently alongside my Next.js dev server. It should be ready to host the Nanobot core and manage its own dependencies (like local LLM connectors and browser automation tools) without interfering with my TypeScript configs.

### **Prompt 2: The Brain (Nanobot Core)**

*Goal: To implement the actual Nanobot logic, ensuring it uses your local hardware (Ollama) and has a system for "Tools."*

@workspace Now inside the neural\_engine, I want you to implement the core **Nanobot** class.

1. **Local Intelligence:** It must be configured to talk to my local Ollama instance (e.g., Llama 3\) for its reasoning loop.  
2. **Tool Registry:** Design a flexible "Skill System" where I can easily plug in new capabilities later (like WhatsApp, Calendar, or Notes).  
3. **The Loop:** The bot should run as a persistent daemon that waits for commands, "thinks" about which tool to use, executes it, and returns the result.

Keep the code lightweight and modular. I want to be able to add a new "Skill" just by dropping a Python file into a folder.

### **Prompt 3: The Migration (Fixing WhatsApp)**

*Goal: To replace the broken src/scripts/connectors/whatsapp.ts with a robust Nanobot Skill.*

@workspace Analyze the legacy script src/scripts/connectors/whatsapp.ts. It was too fragile because it ran as a temporary script.

I want you to rebuild this functionality as a **Nanobot Skill** inside our new Python engine.

* **Persistence:** It needs to maintain a persistent browser session (so I don't have to scan the QR code every time).  
* **Listening:** It should be able to "listen" for incoming messages and trigger the agent when a specific keyword is detected.  
* **Action:** Give the Nanobot the ability to "Send Message" as a tool it can call.

Use robust browser automation (like Playwright) that Nanobot can control directly.

### **Prompt 4: The Nervous System (Connecting UI to Agent)**

*Goal: To make your Next.js "Command Center" actually control the Python bot.*

@workspace functionality check: currently src/hooks/use-agent.ts and my Chat Interface are mocking data or hitting dead endpoints.

I need you to wire the Next.js frontend to talk to our running Nanobot engine.

1. **API Bridge:** Create a simple communication layer (HTTP or WebSockets) where the Frontend sends a prompt ("Check my messages"), and the Python engine receives it.  
2. **Real-time Feedback:** Update the UI to show when Nanobot is "Thinking," "Using a Tool," or "Responding."

Refactor the use-agent hook to actually dispatch these tasks to the Python backend we just built.

### **Prompt 5: The "Jarvis" Expansion (Student Context)**

*Goal: To add the "Student Workspace" features you envisioned (Mails, Notes, Calendar).*

@workspace Now that the core is running, let's expand Nanobot into a true "Student Jarvis."

I want to add two new Skills to the engine:

1. **Calendar/Schedule:** A skill that can read a local file or standard format to tell me "what's my next class?" or "when is the assignment due?"  
2. **Notes/Knowledge:** A skill that lets Nanobot read my markdown notes in the src/documents folder so it can answer questions based on my actual studies.

Please implement these as new Skills in the Python engine and register them with the Nanobot core so it knows when to use them.

### ---

**How to "Vibe Code" with These Prompts**

* **Don't Copy-Paste Code blindly:** When Copilot generates the code, look at the file structure. If it tries to put Python code inside src/app, correct it (e.g., "No, put this in neural\_engine").  
* **Iterate:** If Prompt 3 (WhatsApp) fails, ask Copilot: *"The browser keeps closing. Modify the skill to keep the context open in the background."*  
* **Hardware Check:** Ensure Copilot sets the base\_url for the LLM to http://localhost:11434 (Ollama), or your agent won't work offline.