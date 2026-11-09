"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  Bot,
  User,
  Sparkles,
  Settings,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  Sliders,
  ChevronDown,
  Square,
  AlertCircle,
  Plus,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Download,
  RotateCcw,
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  model?: string;
  provider?: string;
  isStreaming?: boolean;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  messages: Message[];
  model: string;
}

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  is_available: boolean;
  description?: string;
}

const DEFAULT_MODELS: ModelInfo[] = [
  {
    id: "mock-convo-v1",
    name: "Convo AI Simulator (Mock)",
    provider: "mock",
    is_available: true,
    description: "Built-in fast simulated LLM for testing without API keys.",
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "gemini",
    is_available: false,
    description: "Ultra-fast, versatile Google multimodal model.",
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "gemini",
    is_available: false,
    description: "Google's highest intelligence reasoning model.",
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    is_available: false,
    description: "Fast, lightweight OpenAI flagship model.",
  },
];

const SUGGESTIONS = [
  {
    title: "How does SSE streaming work?",
    desc: "Explain the architecture of real-time token streaming",
    prompt: "Can you explain how Server-Sent Events (SSE) work for LLM token streaming?",
  },
  {
    title: "Write a Python script",
    desc: "Create an async API client with error handling",
    prompt: "Write a Python script using httpx to call a REST API with retries and error handling.",
  },
  {
    title: "Brainstorm SaaS Ideas",
    desc: "AI-driven micro SaaS opportunities for 2026",
    prompt: "Give me 3 innovative AI micro-SaaS ideas that can be built by a solo developer.",
  },
  {
    title: "FastAPI vs Next.js API",
    desc: "When to choose Python backend vs Node serverless",
    prompt: "What are the trade-offs between using a FastAPI backend versus Next.js API routes for AI applications?",
  },
];

export default function ChatPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeModel, setActiveModel] = useState("mock-convo-v1");
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>(DEFAULT_MODELS);
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">("checking");
  const [temperature, setTemperature] = useState(0.7);
  const [systemPrompt, setSystemPrompt] = useState("You are Convo AI, an intelligent, helpful, and concise conversational assistant.");
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Audio / Speech State
  const [isRecording, setIsRecording] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const speechRecognitionRef = useRef<any>(null);

  // Load sessions from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("convo_ai_sessions");
      if (saved) {
        const parsed: ChatSession[] = JSON.parse(saved);
        if (parsed.length > 0) {
          setSessions(parsed);
          setActiveSessionId(parsed[0].id);
          setActiveModel(parsed[0].model || "mock-convo-v1");
          return;
        }
      }
    } catch (e) {
      console.warn("Failed to load sessions from storage:", e);
    }
    createNewSession();
  }, []);

  // Save sessions to localStorage
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem("convo_ai_sessions", JSON.stringify(sessions));
    }
  }, [sessions]);

  // Current active session
  const currentSession = sessions.find((s) => s.id === activeSessionId) || {
    id: "temp",
    title: "New Chat",
    createdAt: "2026-01-01T00:00:00.000Z",
    messages: [],
    model: activeModel,
  };

  const messages = currentSession.messages;

  // Check backend health and fetch models on mount
  useEffect(() => {
    checkBackendHealth();
  }, []);

  const checkBackendHealth = async () => {
    setBackendStatus("checking");
    try {
      const res = await fetch("http://localhost:8000/");
      if (res.ok) {
        setBackendStatus("online");
        fetchModels();
      } else {
        setBackendStatus("offline");
      }
    } catch {
      setBackendStatus("offline");
    }
  };

  const fetchModels = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/models");
      if (res.ok) {
        const data = await res.json();
        setAvailableModels(data);
      }
    } catch (e) {
      console.warn("Could not fetch models:", e);
    }
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const updateCurrentSessionMessages = (newMessages: Message[] | ((prev: Message[]) => Message[])) => {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id === activeSessionId) {
          const updated = typeof newMessages === "function" ? newMessages(session.messages) : newMessages;
          
          // Auto-title if it's the first message and currently named "New Chat"
          let title = session.title;
          if (title === "New Chat" && updated.length > 0) {
            const firstUserMsg = updated.find((m) => m.role === "user");
            if (firstUserMsg) {
              title = firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? "..." : "");
            }
          }

          return { ...session, messages: updated, title };
        }
        return session;
      })
    );
  };

  const createNewSession = () => {
    if (isGenerating) handleStop();
    const newSession: ChatSession = {
      id: "session-" + Date.now(),
      title: "New Chat",
      createdAt: new Date().toISOString(),
      messages: [],
      model: activeModel,
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isGenerating && activeSessionId === id) handleStop();
    
    const remaining = sessions.filter((s) => s.id !== id);
    if (remaining.length === 0) {
      const fresh: ChatSession = {
        id: "session-" + Date.now(),
        title: "New Chat",
        createdAt: new Date().toISOString(),
        messages: [],
        model: activeModel,
      };
      setSessions([fresh]);
      setActiveSessionId(fresh.id);
    } else {
      setSessions(remaining);
      if (activeSessionId === id) {
        setActiveSessionId(remaining[0].id);
      }
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsGenerating(false);
      updateCurrentSessionMessages((prev) =>
        prev.map((msg) => (msg.isStreaming ? { ...msg, isStreaming: false } : msg))
      );
    }
  };

  const clearCurrentChat = () => {
    if (isGenerating) handleStop();
    updateCurrentSessionMessages([]);
  };

  // Text to Speech
  const toggleSpeech = (text: string, messageId: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      alert("Text-to-speech is not supported by your browser.");
      return;
    }

    if (speakingMessageId === messageId) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/```[\s\S]*?```/g, "Code snippet omitted."));
    utterance.rate = 1.05;
    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);
    setSpeakingMessageId(messageId);
    window.speechSynthesis.speak(utterance);
  };

  // Speech to Text (Microphone)
  const toggleRecording = () => {
    if (typeof window === "undefined") return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.");
      return;
    }

    if (isRecording) {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        setInput(transcript);
      };

      recognition.onerror = () => {
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      speechRecognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Speech recognition error:", err);
      setIsRecording(false);
    }
  };

  // Export Chat
  const exportChat = () => {
    if (messages.length === 0) return;
    const content = messages
      .map((m) => `### ${m.role === "user" ? "User" : "Assistant"} (${m.timestamp})\n\n${m.content}\n\n---\n`)
      .join("\n");
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${currentSession.title.replace(/[^a-zA-Z0-9]/g, "_")}_transcript.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Send message
  const handleSend = async (customPrompt?: string, overrideHistory?: Message[]) => {
    const textToSend = (customPrompt || input).trim();
    if (!textToSend || isGenerating) return;

    setInput("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    const userMessageId = "msg-" + Date.now();
    const assistantMessageId = "msg-" + (Date.now() + 1);

    const userMessage: Message = {
      id: userMessageId,
      role: "user",
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const baseHistory = overrideHistory || messages;
    const newMessages = [...baseHistory, userMessage];
    updateCurrentSessionMessages(newMessages);

    const selectedModelObj = availableModels.find((m) => m.id === activeModel);
    const provider = selectedModelObj?.provider || "mock";

    const assistantPlaceholder: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      model: activeModel,
      provider: provider,
      isStreaming: true,
    };

    updateCurrentSessionMessages([...newMessages, assistantPlaceholder]);
    setIsGenerating(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch("http://localhost:8000/api/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          provider: provider,
          model: activeModel,
          temperature: temperature,
          system_prompt: systemPrompt,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Server returned error ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error("No response body received from server.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const rawData = line.replace("data: ", "").trim();
            if (!rawData) continue;

            try {
              const parsed = JSON.parse(rawData);
              if (parsed.chunk) {
                accumulatedText += parsed.chunk;
                updateCurrentSessionMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: accumulatedText }
                      : msg
                  )
                );
              }
              if (parsed.done) {
                updateCurrentSessionMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? {
                          ...msg,
                          content: accumulatedText,
                          isStreaming: false,
                          model: parsed.model || msg.model,
                          provider: parsed.provider || msg.provider,
                        }
                      : msg
                  )
                );
              }
            } catch (err) {
              console.error("Error parsing SSE JSON chunk:", err, rawData);
            }
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        console.log("Stream aborted by user");
      } else {
        console.error("Chat error:", err);
        updateCurrentSessionMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content:
                    msg.content +
                    `\n\n⚠️ *Connection Error: Failed to reach backend API at http://localhost:8000. Please ensure the backend is running.*`,
                  isStreaming: false,
                }
              : msg
          )
        );
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  // Regenerate last response
  const handleRegenerate = () => {
    if (messages.length === 0 || isGenerating) return;
    const lastUserIdx = [...messages].reverse().findIndex((m) => m.role === "user");
    if (lastUserIdx === -1) return;

    const actualIdx = messages.length - 1 - lastUserIdx;
    const userPrompt = messages[actualIdx].content;
    const historyBefore = messages.slice(0, actualIdx);

    handleSend(userPrompt, historyBefore);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderMessageContent = (content: string, id: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g);

    return parts.map((part, index) => {
      if (part.startsWith("```") && part.endsWith("```")) {
        const lines = part.slice(3, -3).trim().split("\n");
        const language = lines[0].match(/^[a-zA-Z0-9_-]+$/) ? lines[0] : "";
        const code = language ? lines.slice(1).join("\n") : lines.join("\n");
        const codeBlockId = `${id}-code-${index}`;

        return (
          <div key={index} className="my-3 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-sm text-sm">
            <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-800 text-xs text-neutral-400 font-mono">
              <span>{language || "code"}</span>
              <button
                onClick={() => handleCopy(code, codeBlockId)}
                className="flex items-center gap-1 hover:text-white transition-colors"
                title="Copy code"
              >
                {copiedId === codeBlockId ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 text-xs">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span className="text-xs">Copy</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-3 overflow-x-auto text-neutral-200 font-mono text-xs leading-relaxed">
              <code>{code}</code>
            </pre>
          </div>
        );
      }

      const renderedLines = part.split("\n").map((line, lIdx) => {
        const isBullet = line.trim().startsWith("- ") || line.trim().startsWith("* ");
        const formattedLine = line.replace(/(\*\*|__)(.*?)\1/g, "<strong>$2</strong>");

        return (
          <span
            key={lIdx}
            className={`block ${isBullet ? "pl-4 before:content-['•'] before:inline-block before:w-3 before:-ml-4 before:text-neutral-400" : ""}`}
            dangerouslySetInnerHTML={{ __html: formattedLine || "&nbsp;" }}
          />
        );
      });

      return <div key={index} className="space-y-1">{renderedLines}</div>;
    });
  };

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-indigo-600 selection:text-white overflow-hidden">
      {/* Sidebar for Sessions */}
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-0"
        } transition-all duration-300 ease-in-out border-r border-neutral-800 bg-neutral-925 flex flex-col shrink-0 overflow-hidden relative z-30`}
      >
        <div className="p-3 border-b border-neutral-800 flex items-center justify-between">
          <button
            onClick={createNewSession}
            className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium py-2 px-3 rounded-lg shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>New Chat</span>
          </button>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 px-2 py-1">
            Recent Conversations
          </div>
          {sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => {
                if (isGenerating) handleStop();
                setActiveSessionId(session.id);
              }}
              className={`group flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-colors ${
                session.id === activeSessionId
                  ? "bg-neutral-800 text-white font-medium"
                  : "text-neutral-400 hover:bg-neutral-850 hover:text-neutral-200"
              }`}
            >
              <div className="flex items-center gap-2 truncate mr-1">
                <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-60" />
                <span className="truncate">{session.title}</span>
              </div>
              <button
                onClick={(e) => deleteSession(session.id, e)}
                className="opacity-0 group-hover:opacity-100 hover:text-rose-400 p-1 rounded transition-opacity"
                title="Delete session"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-neutral-800 text-[11px] text-neutral-500 flex items-center justify-between">
          <span>{sessions.length} Chat{sessions.length > 1 ? "s" : ""}</span>
          <button
            onClick={exportChat}
            disabled={messages.length === 0}
            className="flex items-center gap-1 hover:text-neutral-300 disabled:opacity-40 transition-colors"
            title="Export conversation to Markdown"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Navbar */}
        <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-neutral-800 bg-neutral-900/60 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
              title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              {sidebarOpen ? (
                <PanelLeftClose className="w-5 h-5" />
              ) : (
                <PanelLeftOpen className="w-5 h-5" />
              )}
            </button>

            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-sm sm:text-base tracking-tight text-white">
                  Convo AI
                </h1>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  v1.0
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-neutral-400">
                <span className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      backendStatus === "online"
                        ? "bg-emerald-400 animate-pulse"
                        : backendStatus === "checking"
                        ? "bg-amber-400"
                        : "bg-rose-500"
                    }`}
                  />
                  <span className="capitalize">{backendStatus}</span>
                </span>
                <span>•</span>
                <button
                  onClick={checkBackendHealth}
                  className="hover:text-neutral-200 transition-colors flex items-center gap-1"
                  title="Refresh backend status"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Model Selector & Actions */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={activeModel}
                onChange={(e) => setActiveModel(e.target.value)}
                className="appearance-none bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs rounded-lg pl-3 pr-8 py-2 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer hover:bg-neutral-750 transition-colors"
              >
                {availableModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {!m.is_available && m.provider !== "mock" ? "(Needs Key)" : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-neutral-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-lg border transition-colors ${
                showSettings
                  ? "bg-indigo-600/20 border-indigo-500 text-indigo-300"
                  : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700"
              }`}
              title="Chat Settings"
            >
              <Sliders className="w-4 h-4" />
            </button>

            {messages.length > 0 && (
              <button
                onClick={clearCurrentChat}
                className="p-2 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-rose-400 hover:border-rose-500/50 transition-colors"
                title="Clear current messages"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        {/* Settings Drawer */}
        {showSettings && (
          <div className="border-b border-neutral-800 bg-neutral-900/95 px-4 sm:px-6 py-4 transition-all">
            <div className="max-w-3xl mx-auto space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-indigo-400" />
                  Configuration & Parameters
                </h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-xs text-neutral-400 hover:text-white"
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-neutral-300 mb-1 font-medium">System Instructions</label>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={3}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-2.5 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-xs resize-none"
                    placeholder="Set AI persona or behavior..."
                  />
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-neutral-300 mb-1 font-medium">
                      <span>Creativity (Temperature)</span>
                      <span className="font-mono text-indigo-400">{temperature}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value))}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-neutral-500">
                      <span>Precise (0.0)</span>
                      <span>Balanced (0.7)</span>
                      <span>Creative (1.0)</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-neutral-800/60 border border-neutral-700/60 text-[11px] text-neutral-400 space-y-1">
                    <div className="flex items-center gap-1.5 font-medium text-neutral-300">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                      <span>API Keys Setup</span>
                    </div>
                    <p>
                      Configure keys in <code className="text-neutral-200">backend/.env</code>.
                      Mock mode works instantly out-of-the-box!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Conversation Stream */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[55vh] text-center space-y-8">
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center shadow-2xl shadow-indigo-500/30">
                    <Bot className="w-8 h-8 text-white" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-neutral-950 flex items-center justify-center">
                    <Sparkles className="w-2.5 h-2.5 text-white" />
                  </div>
                </div>

                <div className="space-y-2 max-w-md">
                  <h2 className="text-2xl font-bold tracking-tight text-white">
                    Welcome to Convo AI
                  </h2>
                  <p className="text-sm text-neutral-400">
                    A high-performance conversational assistant with streaming, voice support, persistent history, and code execution blocks.
                  </p>
                </div>

                {/* Quick Prompt Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl text-left">
                  {SUGGESTIONS.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(item.prompt)}
                      className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-900/60 hover:bg-neutral-850 hover:border-neutral-700 transition-all text-left group"
                    >
                      <div className="font-medium text-sm text-neutral-200 group-hover:text-indigo-400 transition-colors">
                        {item.title}
                      </div>
                      <div className="text-xs text-neutral-400 mt-1 line-clamp-1">
                        {item.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 sm:gap-4 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shrink-0 mt-1 shadow-sm">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                  )}

                  <div
                    className={`flex flex-col space-y-1.5 max-w-[85%] sm:max-w-[78%] ${
                      message.role === "user" ? "items-end" : "items-start"
                    }`}
                  >
                    {/* Meta Bar */}
                    <div className="flex items-center gap-2 px-1 text-[11px] text-neutral-400">
                      <span className="font-medium">
                        {message.role === "user" ? "You" : "Convo AI"}
                      </span>
                      <span>•</span>
                      <span>{message.timestamp}</span>
                      {message.role === "assistant" && message.model && (
                        <>
                          <span>•</span>
                          <span className="text-[10px] font-mono uppercase bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded">
                            {message.model}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Message Bubble */}
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm transition-all ${
                        message.role === "user"
                          ? "bg-indigo-600 text-white rounded-tr-sm"
                          : "bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-tl-sm w-full"
                      }`}
                    >
                      {message.content ? (
                        renderMessageContent(message.content, message.id)
                      ) : message.isStreaming ? (
                        <div className="flex items-center gap-1.5 py-1">
                          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" />
                          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:0.2s]" />
                          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:0.4s]" />
                        </div>
                      ) : null}

                      {message.isStreaming && message.content && (
                        <span className="inline-block w-2 h-4 ml-1 bg-indigo-400 animate-pulse align-middle" />
                      )}
                    </div>

                    {/* Bubble Action Footer */}
                    {message.role === "assistant" && message.content && !message.isStreaming && (
                      <div className="flex items-center gap-3 pt-1 px-1 text-xs text-neutral-500">
                        <button
                          onClick={() => handleCopy(message.content, message.id)}
                          className="hover:text-neutral-300 transition-colors flex items-center gap-1"
                          title="Copy message"
                        >
                          {copiedId === message.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400 text-xs">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => toggleSpeech(message.content, message.id)}
                          className={`hover:text-neutral-300 transition-colors flex items-center gap-1 ${
                            speakingMessageId === message.id ? "text-indigo-400" : ""
                          }`}
                          title="Read out loud"
                        >
                          {speakingMessageId === message.id ? (
                            <>
                              <VolumeX className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                              <span className="text-indigo-400 text-xs">Stop Audio</span>
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-3.5 h-3.5" />
                              <span>Listen</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {message.role === "user" && (
                    <div className="w-8 h-8 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center shrink-0 mt-1 shadow-sm">
                      <User className="w-4 h-4 text-neutral-300" />
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Input Composer Footer */}
        <footer className="border-t border-neutral-800 bg-neutral-900/60 backdrop-blur-md px-4 sm:px-6 py-4">
          <div className="max-w-3xl mx-auto space-y-2">
            <div className="relative flex items-end gap-2 bg-neutral-900 border border-neutral-750 rounded-2xl p-2 shadow-lg focus-within:border-indigo-500/80 focus-within:ring-1 focus-within:ring-indigo-500/50 transition-all">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
                }}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything or request code..."
                rows={1}
                className="flex-1 bg-transparent border-0 resize-none px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none max-h-44"
              />

              {/* Voice Dictation (Microphone) */}
              <button
                onClick={toggleRecording}
                className={`p-2.5 rounded-xl transition-all shadow-sm shrink-0 ${
                  isRecording
                    ? "bg-rose-600 text-white animate-pulse"
                    : "bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200"
                }`}
                title={isRecording ? "Stop voice dictation" : "Dictate via microphone"}
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              {/* Regenerate Last */}
              {messages.length > 0 && !isGenerating && (
                <button
                  onClick={handleRegenerate}
                  className="p-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 transition-all shadow-sm shrink-0"
                  title="Regenerate last response"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}

              {/* Send / Stop */}
              {isGenerating ? (
                <button
                  onClick={handleStop}
                  className="p-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium transition-all shadow-md shrink-0 flex items-center gap-1.5 text-xs"
                  title="Stop generation"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span className="hidden sm:inline">Stop</span>
                </button>
              ) : (
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim()}
                  className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white transition-all shadow-md shrink-0 disabled:cursor-not-allowed"
                  title="Send message (Enter)"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between px-2 text-[11px] text-neutral-500">
              <span>
                Press <kbd className="px-1 py-0.5 rounded bg-neutral-800 text-neutral-400 font-mono text-[10px]">Enter</kbd> to send, <kbd className="px-1 py-0.5 rounded bg-neutral-800 text-neutral-400 font-mono text-[10px]">Shift+Enter</kbd> for newline
              </span>
              <span className="hidden sm:inline">
                Real-time SSE Streaming
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
